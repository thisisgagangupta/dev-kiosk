import os
import re
import logging
import json
from typing import List, Optional, Dict, Any, Tuple

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Query

log = logging.getLogger("appt-list")
router = APIRouter(prefix="/appointments", tags=["appointments"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")

# DynamoDB Appointments table (same name your patient portal writes to)
DDB_TABLE_APPOINTMENTS = os.getenv("DDB_TABLE_APPOINTMENTS", "medmitra-appointments")
# Patients table (for walk-in + profile seeding)
DDB_TABLE_PATIENTS = os.getenv("DDB_TABLE_PATIENTS", "medmitra_patients")

# Optional local DynamoDB endpoint for dev
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None

# Cognito (to resolve phone -> user sub/patientId and names)
COGNITO_USER_POOL_ID = (os.getenv("COGNITO_USER_POOL_ID") or "").strip()
if not COGNITO_USER_POOL_ID:
    raise RuntimeError("Missing COGNITO_USER_POOL_ID")
cognito = boto3.client("cognito-idp", region_name=AWS_REGION)


def _ddb_resource():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    return boto3.resource("dynamodb", **kw)


def _ddb_table():
    ddb = _ddb_resource()
    return ddb.Table(DDB_TABLE_APPOINTMENTS)


def _patients_table():
    ddb = _ddb_resource()
    return ddb.Table(DDB_TABLE_PATIENTS)


# def _coerce_str(v: Optional[str]) -> str:
#     return (v or "").strip()
def _coerce_str(v: Any) -> str:
    if v is None:
        return ""
    # Convert Decimals / ints / anything else to str, then strip
    return str(v).strip()


def _normalize_phone(mobile: str, country_code: str = "+91") -> str:
    # mirrors kiosk identify normalization (kept local to avoid import cycles)
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
    return f"+{str(country_code).strip('+')}{digits}"


def _best_name_from_attrs(attrs: Dict[str, Any]) -> str:
    """Pick the nicest human name we can from Cognito attributes."""
    gn = (attrs.get("given_name") or "").strip()
    fn = (attrs.get("family_name") or "").strip()
    if gn or fn:
        return f"{gn} {fn}".strip()

    nm = (attrs.get("name") or "").strip()
    if nm:
        return nm

    email = (attrs.get("email") or "").strip()
    if email:
        handle = email.split("@")[0]
        return handle.replace(".", " ").replace("_", " ").title()

    return ""


def _cognito_identity_from_phone(e164: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Return (patientId, patientName) for a phone number using Cognito.
    patientId is the 'sub' (or Username fallback); patientName is best-effort.
    """
    try:
        # exact match first
        resp = cognito.list_users(
            UserPoolId=COGNITO_USER_POOL_ID,
            Filter=f'phone_number = "{e164}"',
            Limit=2,
        )
        users = resp.get("Users", []) or []
        if not users:
            # prefix match (handles cases where + is missing in stored attr etc.)
            digits = e164.lstrip("+")
            try:
                resp2 = cognito.list_users(
                    UserPoolId=COGNITO_USER_POOL_ID,
                    Filter=f'phone_number ^= "+{digits}"',
                    Limit=5,
                )
                users = resp2.get("Users", []) or []
            except ClientError:
                users = []
        if not users:
            return None, None
        user = users[0]
        attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
        sub = attrs.get("sub") or user.get("Username")
        return sub, _best_name_from_attrs(attrs)
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.exception("Cognito list_users failed: %s", msg)
        raise HTTPException(status_code=500, detail=f"Cognito error: {msg}")


def _cognito_name_from_sub(sub: str) -> Optional[str]:
    """
    Best-effort: resolve a patient's name from Cognito using sub.
    """
    try:
        resp = cognito.list_users(
            UserPoolId=COGNITO_USER_POOL_ID,
            Filter=f'sub = "{sub}"',
            Limit=1,
        )
        users = resp.get("Users", []) or []
        if not users:
            return None
        attrs = {a["Name"]: a["Value"] for a in users[0].get("Attributes", [])}
        return _best_name_from_attrs(attrs) or None
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.warning("Cognito list_users by sub failed: %s", msg)
        return None
    except Exception:
        log.exception("Cognito list_users by sub unexpected error")
        return None


def _patient_display_name_from_id(patient_id: str) -> Optional[str]:
    """
    Try to resolve a human-readable patient name:
    1) medmitra_patients table (walk-in flow)
    2) Cognito attributes (given_name/family_name/name/email)
    """
    # 1) medmitra_patients
    try:
        tbl = _patients_table()
        resp = tbl.get_item(Key={"patientId": patient_id})
        item = resp.get("Item")
        if item:
            full = (item.get("fullName") or "").strip()
            if full:
                return full
            first = (item.get("firstName") or "").strip()
            last = (item.get("lastName") or "").strip()
            if first or last:
                return f"{first} {last}".strip()
    except Exception:
        # soft-fail; don't break the endpoint if patients table is missing
        log.debug("patients_table lookup failed for %s", patient_id, exc_info=True)

    # 2) Cognito
    if not COGNITO_USER_POOL_ID:
        return None
    return _cognito_name_from_sub(patient_id)


def _get_appointment_details(it: Dict[str, Any]) -> Dict[str, Any]:
    """
    Safely return appointment_details as a dict, regardless of whether it's stored
    as a Map (dict) or as a JSON string (book-batch writer).
    """
    raw = it.get("appointment_details")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _normalize_item(it: Dict[str, Any]) -> Dict[str, Any]:
    # Decide kind and flatten common display fields (supports both FastAPI+Lambda writers)
    details = _get_appointment_details(it)

    kind = it.get("recordType") or (
        "lab" if it.get("tests")
        else "doctor"
        if (
            it.get("doctorId")
            or it.get("doctorName")
            or (details and (details.get("doctorId") or details.get("doctorName")))
        )
        else "appointment"
    )

    return {
        "appointmentId": it.get("appointmentId"),
        "patientId": it.get("patientId"),
        "createdAt": it.get("createdAt"),
        "status": it.get("status", it.get("payment", {}).get("status", "BOOKED")),

        "recordType": kind,
        "clinicName": _coerce_str(it.get("clinicName") or details.get("clinicName")),
        "clinicAddress": _coerce_str(it.get("clinicAddress")),
        "doctorId": _coerce_str(it.get("doctorId") or details.get("doctorId")),
        "doctorName": _coerce_str(it.get("doctorName") or details.get("doctorName")),
        "specialty": _coerce_str(it.get("specialty") or details.get("specialty")),
        "consultationType": _coerce_str(it.get("consultationType") or details.get("consultationType")),
        "appointmentType": _coerce_str(it.get("appointmentType") or details.get("appointmentType")),
        "dateISO": _coerce_str(
            it.get("dateISO")
            or details.get("dateISO")
            or it.get("collection", {}).get("preferredDateISO")
        ),
        "timeSlot": _coerce_str(
            it.get("timeSlot")
            or details.get("timeSlot")
            or it.get("collection", {}).get("preferredSlot")
        ),
        "fee": _coerce_str(it.get("fee") or details.get("fee")),
        "s3Key": it.get("s3Key"),

        # group bookings from book_batch.py
        "groupId": it.get("groupId"),
        "groupSize": it.get("groupSize"),

        "tests": it.get("tests") or [],
        "collection": it.get("collection"),
        "appointment_details": details if details else None,
        "payment": it.get("payment"),
        "_raw": it,
    }


def _query_appointments(patient_id: str, limit: int, start_key: Optional[Dict[str, Any]] = None):
    tbl = _ddb_table()
    kwargs: Dict[str, Any] = {
        "KeyConditionExpression": Key("patientId").eq(patient_id),
        "ScanIndexForward": False,  # newest first
        "Limit": limit,
    }
    if start_key:
        kwargs["ExclusiveStartKey"] = start_key
    resp = tbl.query(**kwargs)
    items: List[dict] = resp.get("Items", [])
    normalized = [_normalize_item(it) for it in items]
    return {
        "items": normalized,
        "lastEvaluatedKey": resp.get("LastEvaluatedKey"),
    }


# -----------------------------
# GET /appointments/{patientId}
# -----------------------------
@router.get("/{patientId}")
def list_appointments_for_patient(
    patientId: str,
    limit: int = Query(100, ge=1, le=500),
    startKey_patientId: Optional[str] = Query(None, description="for pagination"),
    startKey_appointmentId: Optional[str] = Query(None, description="for pagination"),
):
    """
    Fetch all appointments for a given patient (newest first).
    Kiosk has OTP-verified identity already; no JWT required.
    Supports pagination with startKey_*.
    """
    try:
        start_key = None
        if startKey_patientId and startKey_appointmentId:
            start_key = {"patientId": startKey_patientId, "appointmentId": startKey_appointmentId}

        data = _query_appointments(patientId, limit, start_key)
        data["patientId"] = patientId

        patient_name = _patient_display_name_from_id(patientId)
        if patient_name:
            data["patientName"] = patient_name

        return data
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.exception("DynamoDB query failed")
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")
    except Exception as e:
        log.exception("Unexpected error")
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------------
# GET /appointments/by-phone?phone=…
# -----------------------------------
@router.get("/by-phone")
def list_by_phone(
    phone: str = Query(..., description="raw user input (10 digits or +E.164)"),
    countryCode: str = Query("+91"),
    limit: int = Query(100, ge=1, le=500),
    startKey_patientId: Optional[str] = Query(None),
    startKey_appointmentId: Optional[str] = Query(None),
):
    """
    Convenience/backup endpoint:
    1) normalize phone
    2) look up the Cognito user (sub == patientId)
    3) return that patient's appointments
    Useful if FE doesn't have kioskPatientId in session for any reason.
    """
    e164 = _normalize_phone(phone, countryCode)
    if not e164:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    patient_id, patient_name = _cognito_identity_from_phone(e164)
    if not patient_id:
        return {"items": [], "patientId": None, "normalizedPhone": e164}

    start_key = None
    if startKey_patientId and startKey_appointmentId:
        start_key = {"patientId": startKey_patientId, "appointmentId": startKey_appointmentId}

    data = _query_appointments(patient_id, limit, start_key)
    data["patientId"] = patient_id
    data["normalizedPhone"] = e164
    if patient_name:
        data["patientName"] = patient_name
    return data
