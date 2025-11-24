# backend/app/appointments/book.py
import os
import json
import uuid
import logging
from app.util.datetime import now_utc_iso, now_epoch_ms, combine_local_to_utc_iso
from typing import Optional, Dict, Any

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, constr

log = logging.getLogger("appt-book")
router = APIRouter(prefix="/appointments", tags=["appointments"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DDB_TABLE_APPTS = os.getenv("DDB_TABLE_APPOINTMENTS", "medmitra-appointments")
DDB_TABLE_SLOTS = os.getenv("DDB_TABLE_SLOTS", "medmitra_appointment_slots")
S3_BUCKET = (os.getenv("S3_BUCKET") or os.getenv("AWS_BUCKET_NAME") or "").strip() or None
S3_PREFIX_APPTS = os.getenv("S3_PREFIX_APPTS", "appointments").strip().strip("/")

DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None

def _ddb():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    return boto3.resource("dynamodb", **kw)

ddb = _ddb()
tbl_appts = ddb.Table(DDB_TABLE_APPTS)
tbl_slots = ddb.Table(DDB_TABLE_SLOTS)
s3 = boto3.client("s3", region_name=AWS_REGION) if S3_BUCKET else None

TZ = os.getenv("CLINIC_TIME_ZONE", "Asia/Kolkata")

# -------- Schemas (doctor flow parity with patient portal) ----------
class Contact(BaseModel):
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""

class AppointmentDetails(BaseModel):
    dateISO: constr(strip_whitespace=True, max_length=32)     # "YYYY-MM-DD"
    timeSlot: constr(strip_whitespace=True, max_length=32)    # "HH:mm"
    clinicName: Optional[str] = ""
    specialty: Optional[str] = ""
    doctorId: constr(strip_whitespace=True, max_length=64)
    doctorName: Optional[str] = ""
    consultationType: Optional[str] = "in-person"             # "in-person" | "video"
    appointmentType: Optional[str] = "walkin"                 # "walkin" | ...

class BookRequest(BaseModel):
    patientId: constr(strip_whitespace=True, min_length=6)
    contact: Optional[Contact] = None
    appointment_details: AppointmentDetails
    source: Optional[str] = "kiosk"

def _slot_key(date_iso: str, time_slot: str) -> str:
    return f"{date_iso}#{time_slot}"

def _lock_slot(resource_key: str, slot_key: str, patient_id: str, appointment_id: str):
    item = {
        "resourceKey": resource_key,
        "slotKey": slot_key,
        "patientId": patient_id,
        "appointmentId": appointment_id,
        "createdAt": now_utc_iso(),
    }
    tbl_slots.put_item(Item=item, ConditionExpression="attribute_not_exists(slotKey)")

@router.post("/book")
def book_appointment(payload: BookRequest = Body(...)):
    appt = payload.appointment_details
    if "T" in appt.dateISO:
        raise HTTPException(status_code=422, detail="dateISO must be 'YYYY-MM-DD'")

    appointment_id = str(uuid.uuid4())
    slot_key = _slot_key(appt.dateISO, appt.timeSlot)
    resource_key = f"doctor#{appt.doctorId}"

    # 1) lock slot
    try:
        _lock_slot(resource_key, slot_key, payload.patientId, appointment_id)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise HTTPException(status_code=409, detail="Selected time slot is no longer available")
        log.exception("Slot lock error")
        raise HTTPException(status_code=500, detail=e.response.get("Error", {}).get("Message", str(e)))

    # 2) write appointment
    created_at = now_utc_iso()
    item: Dict[str, Any] = {
        "patientId": payload.patientId,
        "appointmentId": appointment_id,
        "createdAt": created_at,
        "createdAtEpoch": now_epoch_ms(),
        "recordType": "doctor",
        "status": "BOOKED",
        "source": payload.source or "kiosk",
        "timeZone": TZ,
        "contact": payload.contact.dict() if payload.contact else None,
        "appointment_details": appt.dict(),
        # quick query keys
        "doctorId": appt.doctorId,
        "dateKey": slot_key,
    }

    try:
        tbl_appts.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(patientId) AND attribute_not_exists(appointmentId)"
        )
    except ClientError as e:
        # rollback slot on failure
        try:
            tbl_slots.delete_item(Key={"resourceKey": resource_key, "slotKey": slot_key})
        except Exception:
            pass
        log.exception("Dynamo put_item failed")
        raise HTTPException(status_code=500, detail=e.response.get("Error", {}).get("Message", str(e)))

    # 3) archive to S3 (optional, best effort)
    if s3 and S3_BUCKET:
        try:
            key = f"{S3_PREFIX_APPTS}/{payload.patientId}/{appointment_id}.json"
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=json.dumps(item, ensure_ascii=False).encode("utf-8"),
                ContentType="application/json",
            )
            item["s3Key"] = key
        except Exception:
            log.warning("S3 archive failed for %s/%s", payload.patientId, appointment_id, exc_info=True)

    return {
        "patientId": payload.patientId,
        "appointmentId": appointment_id,
        "createdAt": created_at,
        "recordType": "doctor",
        **({"s3Key": item.get("s3Key")} if item.get("s3Key") else {})
    }
