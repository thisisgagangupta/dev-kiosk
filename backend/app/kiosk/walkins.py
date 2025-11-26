import os
import re
import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key
from fastapi import APIRouter, Body, Header, HTTPException
from botocore.exceptions import ClientError

from app.auth import cognito as cg
from app.db.dynamo import patients_table
from app.models.patients import WalkinRegisterRequest, WalkinRegisterResponse

log = logging.getLogger("kiosk-walkins")
router = APIRouter(prefix="/kiosk", tags=["kiosk"])

# ---------------- Env / Config ----------------

PLACEHOLDER_EMAIL_DOMAIN = os.getenv("PLACEHOLDER_EMAIL_DOMAIN", "noemail.medmitra")

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None

# Patient-portal profiles table (for seeding)
PROFILES_TABLE = os.getenv("PROFILES_TABLE", "patient_profiles")

# Shared OTP table (same as identify flow)
DDB_TABLE_OTP = os.getenv("DDB_TABLE_KIOSK_OTP", "kiosk_otp")
OTP_TTL_SECONDS = int(os.getenv("OTP_TTL_SECONDS", "300"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))

# Gate to require OTP for walk-in registration
WALKIN_REQUIRE_OTP = (os.getenv("WALKIN_REQUIRE_OTP", "false").strip().lower() == "true")

# SMS sending (Twilio or SNS), reused style from identify.py
try:
    from twilio.rest import Client as TwilioClient  # type: ignore
except Exception:
    TwilioClient = None  # if not installed

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()
TWILIO_ENABLED = bool(TwilioClient and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)

SMS_PROVIDER = "twilio" if TWILIO_ENABLED else "sns"
SNS_REGION = os.getenv("SNS_REGION") or AWS_REGION
SNS_SENDER_ID = os.getenv("SNS_SENDER_ID", "").strip()
SNS_ENTITY_ID = os.getenv("SNS_ENTITY_ID", "").strip()
SNS_TEMPLATE_ID = os.getenv("SNS_TEMPLATE_ID", "").strip()
SNS_ORIGINATION_NUMBER = os.getenv("SNS_ORIGINATION_NUMBER", "").strip()
SNS_DEFAULT_SMS_TYPE = os.getenv("SNS_DEFAULT_SMS_TYPE", "Transactional")


def _ddb():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    return boto3.resource("dynamodb", **kw)


ddb = _ddb()
otp_table = ddb.Table(DDB_TABLE_OTP)
profiles_table = ddb.Table(PROFILES_TABLE)
sns = boto3.client("sns", region_name=SNS_REGION)
twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ENABLED else None


# ---------------- Helpers: basic utils ----------------

def _norm_e164(mobile: str, default_country="+91") -> str:
    m = re.sub(r"\D", "", mobile or "")
    if not m:
        return ""
    if mobile.strip().startswith("+"):
        return f"+{re.sub(r'[^0-9]', '', mobile)}"
    return f"{default_country}{m}"


def _split_name(full: str):
    s = (full or "").strip()
    if not s:
        return "", ""
    parts = s.split()
    return (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else (parts[0], "")


def _user_sub(user: dict) -> Optional[str]:
    # Prefer the 'sub' attribute
    for a in user.get("Attributes", []):
        if a.get("Name") == "sub":
            return a.get("Value")
    # Fallback: Cognito's Username is a stable UUID in most pool configs
    uid = user.get("Username")
    return uid if uid else None


def _upsert_patient(patient_id: str, e164: str, req: WalkinRegisterRequest):
    now = datetime.now(timezone.utc).isoformat()
    first, last = _split_name(req.name)
    item = {
        "patientId": patient_id,
        "mobile": e164,
        "firstName": first,
        "lastName": last,
        "fullName": req.name,
        "yearOfBirth": req.yearOfBirth,
        "gender": (req.gender or ""),
        "hasCaregiver": bool(req.hasCaregiver),
        "source": "kiosk",
        "updatedAt": now,
        "createdAt": now,
    }
    patients_table.put_item(Item=item)


def _seed_portal_profile(patient_id: str, e164: str, req: WalkinRegisterRequest):
    """
    Best-effort: seed a minimal patient profile into the patient-portal
    profiles table (default 'patient_profiles') so that records/profile
    views are not empty for walk-in users.
    """
    try:
        existing = profiles_table.get_item(Key={"patientId": patient_id}).get("Item")
        if existing:
            return

        first, last = _split_name(req.name)
        now = datetime.now(timezone.utc).isoformat()

        item = {
            "patientId": patient_id,
            "patient_details": {
                "basic": {
                    "firstName": first,
                    "lastName": last,
                    "email": "",
                    "phone": e164,
                    "dateOfBirth": "",
                    "gender": req.gender or "",
                    "address": "",
                    "profileImage": "",
                },
                "health": {
                    "height": "",
                    "weight": "",
                    "bloodType": "",
                    "allergies": "",
                    "medications": "",
                },
                "emergency": {
                    "name": "",
                    "relation": "",
                    "phone": "",
                    "email": "",
                },
                "insurance": {
                    "provider": "",
                    "policyNumber": "",
                    "groupNumber": "",
                    "policyHolder": "",
                    "phone": "",
                },
            },
            "profile_completion": 0,
            "createdAt": now,
            "updatedAt": now,
            "version": 1,
        }

        profiles_table.put_item(Item=item)
        log.info("Seeded portal profile for patientId=%s into table=%s", patient_id, PROFILES_TABLE)
    except ClientError as e:
        log.warning(
            "Failed to seed portal profile for patientId=%s: %s",
            patient_id,
            e.response["Error"].get("Message", str(e)),
        )
    except Exception as e:
        log.warning("Unexpected error seeding portal profile for patientId=%s: %s", patient_id, e)


# ---------------- Helpers: OTP for walk-ins ----------------

def _gen_otp_code(n: int = 6) -> str:
    lo = 10 ** (n - 1)
    hi = (10 ** n) - 1
    import random
    return str(random.randint(lo, hi))


def _send_sms_twilio(e164: str, text: str):
    if not twilio_client or not TWILIO_FROM_NUMBER:
        raise HTTPException(status_code=500, detail="Twilio not configured")
    try:
        twilio_client.messages.create(body=text, from_=TWILIO_FROM_NUMBER, to=e164)
    except Exception as e:
        log.exception("Twilio send failed to %s", e164)
        raise HTTPException(status_code=500, detail=f"Failed to send OTP via Twilio: {str(e)}")


def _send_sms_sns(e164: str, text: str):
    attrs = {"AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": SNS_DEFAULT_SMS_TYPE}}
    if SNS_SENDER_ID:
        attrs["AWS.SNS.SMS.SenderID"] = {"DataType": "String", "StringValue": SNS_SENDER_ID}
    if SNS_ORIGINATION_NUMBER:
        attrs["AWS.SNS.SMS.OriginationNumber"] = {
            "DataType": "String",
            "StringValue": SNS_ORIGINATION_NUMBER,
        }
    if SNS_ENTITY_ID:
        attrs["AWS.MM.SMS.EntityId"] = {"DataType": "String", "StringValue": SNS_ENTITY_ID}
    if SNS_TEMPLATE_ID:
        attrs["AWS.MM.SMS.TemplateId"] = {"DataType": "String", "StringValue": SNS_TEMPLATE_ID}
    try:
        sns.publish(PhoneNumber=e164, Message=text, MessageAttributes=attrs)
    except Exception as e:
        log.exception("SNS publish failed to %s", e164)
        raise HTTPException(status_code=500, detail=f"Failed to send OTP via SNS: {str(e)}")


def _send_sms(e164: str, text: str):
    if SMS_PROVIDER == "twilio":
        return _send_sms_twilio(e164, text)
    return _send_sms_sns(e164, text)


def _latest_walkin_session_for_phone(phone: str) -> Optional[dict]:
    try:
        resp = otp_table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("phone").eq(phone),
            ScanIndexForward=False,
            Limit=1,
        )
        items = resp.get("Items", [])
        return items[0] if items else None
    except Exception:
        return None


def _put_walkin_otp_session(phone: str, code: str) -> str:
    now_epoch = int(time.time())
    ttl_epoch = now_epoch + OTP_TTL_SECONDS
    session_id = str(uuid.uuid4())
    item = {
        "phone": phone,
        "sessionId": session_id,
        "code": code,
        "userSub": "",  # not used for walk-ins
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "ttl": ttl_epoch,
        "attempts": 0,
        "lastSendAt": now_epoch,
        "context": "walkin",
    }
    otp_table.put_item(Item=item)
    return session_id


def _update_walkin_resend(existing: dict, new_code: str):
    now_epoch = int(time.time())
    ttl_epoch = now_epoch + OTP_TTL_SECONDS
    otp_table.update_item(
        Key={"phone": existing["phone"], "sessionId": existing["sessionId"]},
        UpdateExpression="SET #c=:c, #ls=:ls, #ttl=:ttl, attempts=:z",
        ExpressionAttributeNames={"#c": "code", "#ls": "lastSendAt", "#ttl": "ttl"},
        ExpressionAttributeValues={":c": new_code, ":ls": now_epoch, ":ttl": ttl_epoch, ":z": 0},
        ConditionExpression="attribute_exists(phone) AND attribute_exists(sessionId)",
    )


def _can_resend(existing: Optional[dict]) -> bool:
    if not existing:
        return True
    last = int(existing.get("lastSendAt", 0))
    return (int(time.time()) - last) >= 45  # simple 45s cooldown


def _verify_walkin_otp(phone: str, code: str, otp_session_id: Optional[str]) -> None:
    """
    Verify OTP for walk-in registration. Raises HTTPException on failure.
    """
    item = None
    if otp_session_id:
        try:
            resp = otp_table.get_item(Key={"phone": phone, "sessionId": otp_session_id})
            item = resp.get("Item")
        except Exception:
            item = None
    if not item:
        item = _latest_walkin_session_for_phone(phone)
    if not item:
        raise HTTPException(status_code=400, detail="OTP session not found or expired")

    now_epoch = int(time.time())
    if now_epoch >= int(item.get("ttl", 0)):
        raise HTTPException(status_code=400, detail="OTP expired")

    attempts = int(item.get("attempts", 0))
    if attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many OTP attempts")

    if code != str(item.get("code")):
        try:
            otp_table.update_item(
                Key={"phone": item["phone"], "sessionId": item["sessionId"]},
                UpdateExpression="SET attempts = if_not_exists(attempts, :z) + :one",
                ExpressionAttributeValues={":z": 0, ":one": 1},
            )
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Invalid OTP")

    # Success → delete session (best-effort)
    try:
        otp_table.delete_item(Key={"phone": item["phone"], "sessionId": item["sessionId"]})
    except Exception:
        pass


# ---------------- Routes: OTP for walk-in ----------------

class WalkinSendOTPReq(WalkinRegisterRequest.__class__):
    pass  # just for clarity; we’ll define a separate pydantic model below


from pydantic import BaseModel


class WalkinSendOtpRequest(BaseModel):
    mobile: str
    countryCode: str = "+91"


class WalkinSendOtpResponse(BaseModel):
    otpSessionId: str
    normalizedPhone: str


@router.post("/walkins/send-otp", response_model=WalkinSendOtpResponse)
def walkin_send_otp(payload: WalkinSendOtpRequest):
    """
    Send OTP for walk-in registration (used across WalkinPage, LabPage, PharmacyPage,
    DiagnosticsBookingPage).
    Behaviour:
      - Every call generates a NEW code.
      - TTL is always refreshed to now + OTP_TTL_SECONDS (5 minutes default).
      - We reuse the same sessionId per phone where possible so verification is simple.
    """
    phone = _norm_e164(payload.mobile, payload.countryCode or "+91")
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    existing = _latest_walkin_session_for_phone(phone)
    code = _gen_otp_code()  # generate a new code every time

    if existing:
        # Resend path: update existing row with new code + TTL + lastSendAt
        _update_walkin_resend(existing, code)
        session_id = existing["sessionId"]
    else:
        # First send: create session
        session_id = _put_walkin_otp_session(phone, code)

    _send_sms(
        phone,
        f"{code} is your MedMitra verification code for walk-in registration. "
        f"It expires in {OTP_TTL_SECONDS // 60} min.",
    )

    return WalkinSendOtpResponse(otpSessionId=session_id, normalizedPhone=phone)



# ---------------- Route: Walk-in registration ----------------

@router.post("/walkins/register", response_model=WalkinRegisterResponse, status_code=201)
def walkin_register(
    payload: WalkinRegisterRequest = Body(...),
    x_kiosk_key: Optional[str] = Header(default=None, alias="X-Kiosk-Key"),
):
    # if KIOSK_SHARED_KEY and x_kiosk_key != KIOSK_SHARED_KEY:
    #     raise HTTPException(status_code=401, detail="Unauthorized kiosk client")

    e164 = _norm_e164(payload.mobile, payload.countryCode or "+91")
    if not e164 or len(re.sub(r"\D", "", e164)) < 10:
        raise HTTPException(status_code=400, detail="Invalid mobile number")

    # Optional gate: require OTP for walk-in registration
    # Always enforce OTP for walk-in registration
    code = (payload.otpCode or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="OTP required for walk-in registration")

    # Validate OTP (raises 400/429 if invalid)
    _verify_walkin_otp(e164, code, payload.otpSessionId)


    user = cg.list_user_by_phone(e164)
    created = False

    if not user:
        # Pool expects email as username -> use a placeholder email as the username.
        # Keep the real phone in phone_number (and verify later via OTP flow).
        local_part = re.sub(r"\D", "", e164)  # e.g. "+9198..." -> "9198..."
        username = f"{local_part}@{PLACEHOLDER_EMAIL_DOMAIN}"

        # Split name into given_name / family_name for nicer portal UX
        first, last = _split_name(payload.name)

        # Set given_name, family_name and a placeholder email so patient portal sees a proper profile
        attrs = [
            {"Name": "phone_number", "Value": e164},
            {"Name": "phone_number_verified", "Value": "false"},
            {"Name": "name", "Value": payload.name},
            {"Name": "given_name", "Value": first},
            {"Name": "family_name", "Value": last},
            {"Name": "email", "Value": username},
            {"Name": "email_verified", "Value": "false"},
            # Optional custom attributes — only enable if configured in the User Pool
            # {"Name": "custom:year_of_birth", "Value": payload.yearOfBirth},
            # {"Name": "custom:gender", "Value": payload.gender or ""},
            # {"Name": "custom:has_caregiver", "Value": "true" if payload.hasCaregiver else "false"},
        ]

        try:
            cg.admin_create_user(username, attrs)
            cg.ensure_group(username)
            user = cg.admin_get_user(username)
            created = True
        except ClientError as e:
            msg = e.response["Error"].get("Message", str(e))
            raise HTTPException(status_code=400, detail=f"Cognito create failed: {msg}")

    patient_id = _user_sub(user) or ""
    if not patient_id:
        raise HTTPException(status_code=500, detail="Could not determine patientId (sub)")

    try:
        _upsert_patient(patient_id, e164, payload)
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")

    # Best-effort: seed a minimal patient-portal profile for this walk-in
    _seed_portal_profile(patient_id, e164, payload)

    return WalkinRegisterResponse(
        patientId=patient_id,
        created=created,
        kioskVisitId=str(uuid.uuid4()),
        normalizedPhone=e164,
    )
