import os
import json
import uuid
import logging
from app.util.datetime import now_utc_iso, now_epoch_ms
from typing import Optional, Dict, Any, List

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, constr, validator

log = logging.getLogger("appt-book-batch")
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
    return boto3.client("dynamodb", **kw), boto3.resource("dynamodb", **kw)


dcl, dbr = _ddb()
tbl_appts = dbr.Table(DDB_TABLE_APPTS)
s3 = boto3.client("s3", region_name=AWS_REGION) if S3_BUCKET else None

TZ = os.getenv("CLINIC_TIME_ZONE", "Asia/Kolkata")


class Contact(BaseModel):
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""


class AppointmentDetails(BaseModel):
    dateISO: constr(strip_whitespace=True, max_length=32)  # "YYYY-MM-DD"
    clinicName: Optional[str] = ""
    specialty: Optional[str] = ""
    doctorId: constr(strip_whitespace=True, max_length=64)
    doctorName: Optional[str] = ""
    consultationType: Optional[str] = "in-person"
    appointmentType: Optional[str] = "walkin"
    symptoms: Optional[str] = ""
    fee: Optional[str] = ""
    languages: Optional[List[str]] = []


class BookBatchRequest(BaseModel):
    patientId: constr(strip_whitespace=True, min_length=6)
    contact: Optional[Contact] = None
    appointment_details: AppointmentDetails
    timeSlots: List[constr(strip_whitespace=True, max_length=32)] = Field(
        ..., description="HH:mm list"
    )
    source: Optional[str] = "kiosk"

    @validator("timeSlots")
    def _len(cls, v):
        if not v or not isinstance(v, list):
            raise ValueError("timeSlots must be a non-empty list")
        if len(v) > 12:
            raise ValueError("timeSlots too many (max 12)")
        return v


def _slot_key(date_iso: str, time_slot: str) -> str:
    return f"{date_iso}#{time_slot}"


@router.post("/book-batch")
def book_batch(payload: BookBatchRequest = Body(...)):
    appt = payload.appointment_details
    if "T" in appt.dateISO:
        raise HTTPException(status_code=422, detail="dateISO must be 'YYYY-MM-DD'")

    dateISO = appt.dateISO
    resource_key = f"doctor#{appt.doctorId}"

    # --- NEW: group-level metadata (additive, no behavior change) ---
    group_id = str(uuid.uuid4())
    group_size = len(payload.timeSlots)

    # Prepare transact items: for each slot -> Put to SLOTS with condition; and Put to APPTS with condition
    transact_items: List[Dict[str, Any]] = []
    appointment_ids: List[str] = []
    created_at = now_utc_iso()

    for t in payload.timeSlots:
        aid = str(uuid.uuid4())
        appointment_ids.append(aid)

        # Slot lock item
        slot_item = {
            "resourceKey": {"S": resource_key},
            "slotKey": {"S": _slot_key(dateISO, t)},
            "patientId": {"S": payload.patientId},
            "appointmentId": {"S": aid},
            "createdAt": {"S": created_at},
        }
        transact_items.append(
            {
                "Put": {
                    "TableName": DDB_TABLE_SLOTS,
                    "Item": slot_item,
                    "ConditionExpression": "attribute_not_exists(slotKey)",
                }
            }
        )

        # Appointment item
        appt_item = {
            "patientId": {"S": payload.patientId},
            "appointmentId": {"S": aid},
            "createdAt": {"S": created_at},
            "createdAtEpoch": {"N": str(now_epoch_ms())},
            "recordType": {"S": "doctor"},
            "status": {"S": "BOOKED"},
            "source": {"S": (payload.source or "kiosk")},
            "timeZone": {"S": TZ},
            "dateKey": {"S": _slot_key(dateISO, t)},
            "doctorId": {"S": appt.doctorId},
            # --- NEW: store group metadata on each appointment row ---
            "groupId": {"S": group_id},
            "groupSize": {"N": str(group_size)},
            # denormalized fields
            "appointment_details": {
                "S": json.dumps({**appt.dict(), "dateISO": dateISO, "timeSlot": t}, ensure_ascii=False)
            },
        }
        transact_items.append(
            {
                "Put": {
                    "TableName": DDB_TABLE_APPTS,
                    "Item": appt_item,
                    "ConditionExpression": "attribute_not_exists(patientId) AND attribute_not_exists(appointmentId)",
                }
            }
        )

    try:
        # Atomic write
        dcl.transact_write_items(TransactItems=transact_items)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        # Return 409 + tell which slots conflicted if we can infer
        if code in ("TransactionCanceledException", "ConditionalCheckFailed"):
            return {"detail": "One or more slots are no longer available", "conflicts": payload.timeSlots}, 409
        log.exception("TransactWrite failed")
        raise HTTPException(
            status_code=500,
            detail=e.response.get("Error", {}).get("Message", str(e)),
        )

    # Optional: archive to S3 (best-effort)
    if s3 and S3_BUCKET:
        for aid, t in zip(appointment_ids, payload.timeSlots):
            item = {
                "patientId": payload.patientId,
                "appointmentId": aid,
                "createdAt": created_at,
                "createdAtEpoch": now_epoch_ms(),
                "timeZone": TZ,
                "recordType": "doctor",
                "status": "BOOKED",
                "source": payload.source or "kiosk",
                "appointment_details": {**appt.dict(), "dateISO": dateISO, "timeSlot": t},
                "doctorId": appt.doctorId,
                "dateKey": _slot_key(dateISO, t),
                # --- mirror group metadata into S3 archive too ---
                "groupId": group_id,
                "groupSize": group_size,
            }
            try:
                key = f"{S3_PREFIX_APPTS}/{payload.patientId}/{aid}.json"
                s3.put_object(
                    Bucket=S3_BUCKET,
                    Key=key,
                    Body=json.dumps(item, ensure_ascii=False).encode("utf-8"),
                    ContentType="application/json",
                )
            except Exception:
                log.warning("S3 archive failed for batch item %s", aid, exc_info=True)

    # Return all appointment ids
    out = [
        {
            "patientId": payload.patientId,
            "appointmentId": aid,
            "createdAt": created_at,
            "timeSlot": t,
            # exposing groupId/groupSize here is backward compatible and optional for consumers
            "groupId": group_id,
            "groupSize": group_size,
        }
        for aid, t in zip(appointment_ids, payload.timeSlots)
    ]
    return {"appointments": out}
