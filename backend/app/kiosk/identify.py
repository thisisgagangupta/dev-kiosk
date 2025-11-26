import os
import re
import time
import json
import uuid
import random
import logging
from typing import Optional
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field, validator

log = logging.getLogger("kiosk-identify")
router = APIRouter(prefix="/kiosk/identify", tags=["kiosk-identify"])

# -----------------------------------------------------------------------------#
# Env / Config                                                                 #
# -----------------------------------------------------------------------------#
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")

COGNITO_USER_POOL_ID = (os.getenv("COGNITO_USER_POOL_ID") or "").strip()
if not COGNITO_USER_POOL_ID:
    raise RuntimeError("Missing COGNITO_USER_POOL_ID")

DDB_TABLE_OTP = os.getenv("DDB_TABLE_KIOSK_OTP", "kiosk_otp")
OTP_TTL_SECONDS = int(os.getenv("OTP_TTL_SECONDS", "300"))
OTP_LENGTH = int(os.getenv("OTP_LENGTH", "6"))
OTP_RESEND_COOLDOWN = int(os.getenv("OTP_RESEND_COOLDOWN", "45"))

KIOSK_REQUIRE_VERIFIED = (os.getenv("KIOSK_REQUIRE_VERIFIED", "false").strip().lower() == "true")

# Twilio (preferred)
try:
    from twilio.rest import Client as TwilioClient  # type: ignore
except Exception:
    TwilioClient = None  # if not installed

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()
TWILIO_ENABLED = bool(TwilioClient and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)

# SNS (fallback)
SMS_PROVIDER = "twilio" if TWILIO_ENABLED else "sns"
SNS_REGION = os.getenv("SNS_REGION") or AWS_REGION
SNS_SENDER_ID = os.getenv("SNS_SENDER_ID", "").strip()
SNS_ENTITY_ID = os.getenv("SNS_ENTITY_ID", "").strip()
SNS_TEMPLATE_ID = os.getenv("SNS_TEMPLATE_ID", "").strip()
SNS_ORIGINATION_NUMBER = os.getenv("SNS_ORIGINATION_NUMBER", "").strip()
SNS_DEFAULT_SMS_TYPE = os.getenv("SNS_DEFAULT_SMS_TYPE", "Transactional")

# -----------------------------------------------------------------------------#
# AWS Clients                                                                  #
# -----------------------------------------------------------------------------#
cognito = boto3.client("cognito-idp", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
otp_table = dynamodb.Table(DDB_TABLE_OTP)
sns = boto3.client("sns", region_name=SNS_REGION)
twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ENABLED else None

# -----------------------------------------------------------------------------#
# Helpers                                                                      #
# -----------------------------------------------------------------------------#
def normalize_phone(mobile: str, country_code: str) -> str:
    digits = re.sub(r"\D", "", mobile or "")
    if not digits:
        return ""
    if (mobile or "").strip().startswith("+"):
        return (mobile or "").strip()
    if country_code in ("+91", "91"):
        if len(digits) == 10:
            return f"+91{digits}"
        if digits.startswith("0") and len(digits) == 11:
            return f"+91{digits[1:]}"
        if digits.startswith("91") and len(digits) == 12:
            return f"+{digits}"
    return f"+{country_code.strip('+')}{digits}"

def _gen_code(n: int) -> str:
    lo = 10 ** (n - 1)
    hi = (10 ** n) - 1
    return str(random.randint(lo, hi))

def _attrs_map(user: dict) -> dict:
    return {a["Name"]: a["Value"] for a in user.get("Attributes", [])}

def _find_cognito_user_by_phone(e164: str) -> Optional[dict]:
    try:
        resp = cognito.list_users(UserPoolId=COGNITO_USER_POOL_ID, Filter=f'phone_number = "{e164}"', Limit=2)
        users = resp.get("Users", []) or []
        if not users:
            digits = e164.lstrip("+")
            try:
                resp2 = cognito.list_users(UserPoolId=COGNITO_USER_POOL_ID, Filter=f'phone_number ^= "+{digits}"', Limit=5)
                users = resp2.get("Users", []) or []
            except ClientError:
                pass
        if not users:
            return None
        user = users[0]
        attrs = _attrs_map(user)
        if KIOSK_REQUIRE_VERIFIED:
            verified = str(attrs.get("phone_number_verified", "")).lower() == "true"
            if not verified:
                log.info("User found but phone_number_verified=false: %s", e164)
                return None
        return user
    except ClientError as e:
        log.exception("Cognito list_users failed")
        raise HTTPException(status_code=500, detail=f"Cognito error: {e.response['Error'].get('Message', 'unknown')}")

def _put_otp_session(phone: str, user_sub: str, code: str) -> str:
    now_epoch = int(time.time())
    ttl_epoch = now_epoch + OTP_TTL_SECONDS
    session_id = str(uuid.uuid4())
    item = {
        "phone": phone,
        "sessionId": session_id,
        "code": code,  # plaintext for MVP; hash in prod if needed
        "userSub": user_sub,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "ttl": ttl_epoch,
        "attempts": 0,
        "lastSendAt": now_epoch,
    }
    otp_table.put_item(Item=item)
    return session_id

def _can_resend(existing: Optional[dict]) -> bool:
    if not existing:
        return True
    last = int(existing.get("lastSendAt", 0))
    return (int(time.time()) - last) >= OTP_RESEND_COOLDOWN

def _update_resend(existing: dict, new_code: str):
    now_epoch = int(time.time())
    ttl_epoch = now_epoch + OTP_TTL_SECONDS
    otp_table.update_item(
        Key={"phone": existing["phone"], "sessionId": existing["sessionId"]},
        UpdateExpression="SET #c=:c, #ls=:ls, #ttl=:ttl, attempts=:z",
        ExpressionAttributeNames={"#c": "code", "#ls": "lastSendAt", "#ttl": "ttl"},
        ExpressionAttributeValues={":c": new_code, ":ls": now_epoch, ":ttl": ttl_epoch, ":z": 0},
        ConditionExpression="attribute_exists(phone) AND attribute_exists(sessionId)",
    )

def _latest_session_for_phone(phone: str) -> Optional[dict]:
    try:
        resp = otp_table.query(IndexName="GSI1", KeyConditionExpression=Key("phone").eq(phone), ScanIndexForward=False, Limit=1)
        items = resp.get("Items", [])
        return items[0] if items else None
    except Exception:
        return None

def _send_sms_twilio(e164: str, text: str):
    if not twilio_client or not TWILIO_FROM_NUMBER:
        raise HTTPException(status_code=500, detail="Twilio not configured")
    try:
        twilio_client.messages.create(body=text, from_=TWILIO_FROM_NUMBER, to=e164)
    except Exception as e:
        log.exception("Twilio send failed to %s", e164)
        raise HTTPException(status_code=500, detail=f"Failed to send OTP via Twilio: {str(e)}")

def _send_sms_sns(e164: str, text: str):
    attrs = { "AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": SNS_DEFAULT_SMS_TYPE} }
    if SNS_SENDER_ID:
        attrs["AWS.SNS.SMS.SenderID"] = {"DataType": "String", "StringValue": SNS_SENDER_ID}
    if SNS_ORIGINATION_NUMBER:
        attrs["AWS.SNS.SMS.OriginationNumber"] = {"DataType": "String", "StringValue": SNS_ORIGINATION_NUMBER}
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

# -----------------------------------------------------------------------------#
# Schemas                                                                       #
# -----------------------------------------------------------------------------#
class SendOTPReq(BaseModel):
    mobile: str
    countryCode: str = "+91"
    createIfMissing: bool = False

    @validator("mobile")
    def _digits(cls, v):
        if not re.sub(r"\D", "", v or ""):
            raise ValueError("mobile required")
        return v

class SendOTPResp(BaseModel):
    otpSessionId: str
    normalizedPhone: str

class VerifyOTPReq(BaseModel):
    mobile: str
    countryCode: str = "+91"
    code: str = Field(..., min_length=4, max_length=6)
    otpSessionId: Optional[str] = None

class VerifyOTPResp(BaseModel):
    patientId: str
    normalizedPhone: str

# -----------------------------------------------------------------------------#
# Routes                                                                        #
# -----------------------------------------------------------------------------#
@router.post("/send-otp", response_model=SendOTPResp)
def send_otp(req: SendOTPReq, x_kiosk_key: Optional[str] = Header(None)):
    phone = normalize_phone(req.mobile, req.countryCode)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone")

    log.info("Kiosk send-otp: normalized=%s pool=%s region=%s provider=%s",
             phone, COGNITO_USER_POOL_ID, AWS_REGION, SMS_PROVIDER)

    user = _find_cognito_user_by_phone(phone)
    if not user:
        raise HTTPException(status_code=404, detail="Mobile number not registered")

    attrs = _attrs_map(user)
    user_sub = attrs.get("sub") or user.get("Username")
    if not user_sub:
        raise HTTPException(status_code=500, detail="Cognito user missing sub")

    existing = _latest_session_for_phone(phone)
    if existing and not _can_resend(existing):
        return SendOTPResp(otpSessionId=existing["sessionId"], normalizedPhone=phone)

    code = _gen_code(OTP_LENGTH)

    if existing and _can_resend(existing):
        _update_resend(existing, code)
        session_id = existing["sessionId"]
    else:
        session_id = _put_otp_session(phone, user_sub, code)

    _send_sms(phone, f"{code} is your MedMitra verification code. It expires in {OTP_TTL_SECONDS // 60} min.")

    return SendOTPResp(otpSessionId=session_id, normalizedPhone=phone)

@router.post("/verify-otp", response_model=VerifyOTPResp)
def verify_otp(req: VerifyOTPReq, x_kiosk_key: Optional[str] = Header(None)):
    phone = normalize_phone(req.mobile, req.countryCode)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone")

    item = None
    if req.otpSessionId:
        try:
            resp = otp_table.get_item(Key={"phone": phone, "sessionId": req.otpSessionId})
            item = resp.get("Item")
        except Exception:
            item = None
    if not item:
        item = _latest_session_for_phone(phone)
    if not item:
        raise HTTPException(status_code=400, detail="OTP session not found or expired")

    if int(time.time()) >= int(item.get("ttl", 0)):
        raise HTTPException(status_code=400, detail="OTP expired")

    attempts = int(item.get("attempts", 0))
    if attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts")

    if req.code != str(item.get("code")):
        try:
            otp_table.update_item(
                Key={"phone": item["phone"], "sessionId": item["sessionId"]},
                UpdateExpression="SET attempts = if_not_exists(attempts, :z) + :one",
                ExpressionAttributeValues={":z": 0, ":one": 1},
            )
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Invalid code")

    try:
        otp_table.delete_item(Key={"phone": item["phone"], "sessionId": item["sessionId"]})
    except Exception:
        pass

    patient_id = str(item.get("userSub") or "")
    if not patient_id:
        raise HTTPException(status_code=500, detail="User mapping missing")

    return VerifyOTPResp(patientId=patient_id, normalizedPhone=phone)
