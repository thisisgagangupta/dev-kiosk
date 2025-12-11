import os
import logging
import json
from typing import Optional, Any, Dict

import boto3
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, validator
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key  # NEW

from app.util.datetime import now_utc_iso, now_epoch_ms
from app.db.dynamo import appointments_table
from app.notifications.whatsapp import (
    send_doctor_booking_confirmation,
    send_consecutive_appointment_warning,
)

log = logging.getLogger("appt-kiosk-attach")
router = APIRouter(prefix="/kiosk/appointments", tags=["kiosk-appointments"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DDB_TABLE_SLOTS = os.getenv("DDB_TABLE_SLOTS", "medmitra_appointment_slots")
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None


def _slots_table():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    ddb = boto3.resource("dynamodb", **kw)
    return ddb.Table(DDB_TABLE_SLOTS)


tbl_slots = _slots_table()


class KioskPayload(BaseModel):
    # required keys to locate the row
    patientId: str = Field(..., min_length=6)
    appointmentId: str = Field(..., min_length=6)

    # everything we want to attach under "kiosk"
    kiosk: Dict[str, Any] = Field(
        default_factory=dict,
        description="Free-form kiosk payload (reason, voice flags, payment, device info, etc.)",
    )

    @validator("kiosk")
    def _no_binary(cls, v):
        if not isinstance(v, dict):
            raise ValueError("kiosk must be an object")
        return v


def _now():
    return now_utc_iso()


def _get_details_map(it: Dict[str, Any]) -> Dict[str, Any]:
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


def _find_existing_same_day_appointment(
    tbl,
    patient_id: str,
    date_iso: str,
    exclude_appointment_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Best-effort: find an existing *other* doctor appointment for this patient
    on the same date. Used to trigger the consecutive-booking warning.
    """
    try:
        resp = tbl.query(
            KeyConditionExpression=Key("patientId").eq(patient_id),
            ScanIndexForward=False,
            Limit=50,
        )
    except ClientError as e:
        log.warning(
            "Existing same-day lookup failed for patient %s: %s",
            patient_id,
            e,
        )
        return None

    for it in resp.get("Items", []):
        if it.get("appointmentId") == exclude_appointment_id:
            continue
        record_type = (it.get("recordType") or "doctor").lower()
        if record_type != "doctor":
            continue

        status = str(it.get("status") or "").upper()
        if status in ("CANCELLED", "CANCELED"):
            continue

        details = _get_details_map(it)
        existing_date = (
            it.get("dateISO")
            or details.get("dateISO")
            or (it.get("collection") or {}).get("preferredDateISO")
        )
        if existing_date != date_iso:
            continue

        existing_time = (
            it.get("timeSlot")
            or details.get("timeSlot")
            or (it.get("collection") or {}).get("preferredSlot")
            or ""
        )

        return {
            "dateISO": existing_date,
            "timeSlot": existing_time,
            "doctorName": it.get("doctorName") or details.get("doctorName") or "",
            "clinicName": it.get("clinicName") or details.get("clinicName") or "",
        }

    return None


def _ensure_slot_locked(
    doctor_id: Any,
    date_iso: str,
    time_slot: str,
    patient_id: str,
    appointment_id: str,
):
    """
    Ensure there is a slot lock row for this doctor/date/time.
    Used when a kiosk walk-in is finalized (payment done / pay-later chosen).
    """
    if not doctor_id or not date_iso or not time_slot:
        return

    resource_key = f"doctor#{str(doctor_id)}"
    slot_key = f"{date_iso}#{time_slot}"

    try:
        # If already locked, nothing to do
        existing = tbl_slots.get_item(
            Key={"resourceKey": resource_key, "slotKey": slot_key}
        ).get("Item")
        if existing:
            return

        item = {
            "resourceKey": resource_key,
            "slotKey": slot_key,
            "patientId": patient_id,
            "appointmentId": appointment_id,
            "createdAt": now_utc_iso(),
        }
        tbl_slots.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(slotKey)",
        )
        log.info(
            "Kiosk attach: locked slot %s / %s for patient=%s appointment=%s",
            resource_key,
            slot_key,
            patient_id,
            appointment_id,
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code == "ConditionalCheckFailedException":
            # Someone else locked this slot first; log but don't break the flow
            log.warning(
                "Kiosk attach: slot already locked for %s / %s (possible race)",
                resource_key,
                slot_key,
            )
        else:
            log.warning(
                "Kiosk attach: failed to lock slot for %s / %s: %s",
                resource_key,
                slot_key,
                e,
            )
    except Exception:
        log.warning(
            "Kiosk attach: unexpected error while locking slot for doctor=%s date=%s time=%s",
            doctor_id,
            date_iso,
            time_slot,
            exc_info=True,
        )


@router.post("/attach")
def attach_kiosk_data(payload: KioskPayload = Body(...)):
    """
    Merge/attach kiosk details into the appointment row as a single map field 'kiosk'.
    - Requires existing item (patientId + appointmentId).
    - Adds/updates kiosk.updatedAt; sets kiosk.createdAt if first time.
    - Server-side merge logic to preserve previous 'kiosk' content.
    - If kiosk.payment signals that the kiosk flow is finalized (pay_now verified
      or pay_later chosen), we:
        * set status = BOOKED (for kiosk walk-ins that were PENDING_PAYMENT)
        * mirror payment into canonical payment if empty
        * lock the slot in the slots table (so availability hides it)
        * send WhatsApp appointment confirmation.
    """
    tbl = appointments_table()
    pid = payload.patientId.strip()
    aid = payload.appointmentId.strip()

    # Server-enrichment
    kiosk_in = dict(payload.kiosk or {})
    kiosk_in.setdefault("source", "kiosk")
    kiosk_in["updatedAt"] = _now()
    kiosk_in["updatedAtEpoch"] = now_epoch_ms()

    try:
        # Fetch existing item
        resp = tbl.get_item(Key={"patientId": pid, "appointmentId": aid})
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Appointment not found")

        existing_kiosk = item.get("kiosk") or {}
        if "createdAt" not in existing_kiosk:
            kiosk_in.setdefault("createdAt", _now())
            kiosk_in.setdefault("createdAtEpoch", now_epoch_ms())

        # --- Merge kiosk maps (shallow) ---
        merged_kiosk: Dict[str, Any] = {**existing_kiosk, **kiosk_in}

        # --- detect if this attach call finalizes the kiosk booking ---
        kiosk_payment = merged_kiosk.get("payment")
        finalize = False
        if isinstance(kiosk_payment, dict):
            mode = (kiosk_payment.get("mode") or "").lower()
            status = (kiosk_payment.get("status") or "").lower()
            verified = bool(kiosk_payment.get("verified"))
            if verified or mode == "pay_later" or status in ("paid", "success", "captured"):
                finalize = True

        record_type = (item.get("recordType") or "").lower()
        source = (item.get("source") or "").lower()

        # We only change status + send WhatsApp for kiosk doctor walk-ins
        is_kiosk_doctor = record_type == "doctor" and source == "kiosk"

        # Decide whether we should bump status to BOOKED
        existing_status = str(item.get("status") or "").upper()
        new_status: Optional[str] = None
        if finalize and is_kiosk_doctor:
            if existing_status in ("PENDING_PAYMENT", "HOLD", ""):
                new_status = "BOOKED"

        # --- If we are about to finalize, precompute same-day existing appt ---
        same_day_existing: Optional[Dict[str, Any]] = None
        details = _get_details_map(item)
        date_iso = (
            item.get("dateISO")
            or details.get("dateISO")
            or (item.get("collection") or {}).get("preferredDateISO")
        )
        time_slot = (
            item.get("timeSlot")
            or details.get("timeSlot")
            or (item.get("collection") or {}).get("preferredSlot")
        )
        doctor_id = item.get("doctorId") or details.get("doctorId")
        doctor_name = item.get("doctorName") or details.get("doctorName") or ""
        clinic_name = item.get("clinicName") or details.get("clinicName") or ""
        contact = item.get("contact") or {}
        phone = (contact.get("phone") or "").strip()
        patient_name = contact.get("name") or ""

        if finalize and is_kiosk_doctor and date_iso:
            same_day_existing = _find_existing_same_day_appointment(
                tbl=tbl,
                patient_id=pid,
                date_iso=date_iso,
                exclude_appointment_id=aid,
            )

        # --- mirror pay-later into canonical payment if payment is empty ---
        existing_payment = item.get("payment")
        new_payment: Optional[Dict[str, Any]] = None

        if (
            not existing_payment
            and isinstance(kiosk_payment, dict)
            and kiosk_payment
        ):
            base: Dict[str, Any] = existing_payment if isinstance(existing_payment, dict) else {}
            for key in ("mode", "status", "amount", "currency"):
                if kiosk_payment.get(key) is not None:
                    base[key] = kiosk_payment[key]

            status_lower = str(base.get("status") or "").lower()
            if "mode" not in base or not base["mode"]:
                if status_lower in ("unpaid", "pending", "created", "initiated"):
                    base["mode"] = "pay_later"
                else:
                    base["mode"] = "pay_now"
            if "currency" not in base or not base["currency"]:
                base["currency"] = "INR"

            new_payment = base

        # --- ensure slot lock on finalization for kiosk doctor appointments ---
        if finalize and is_kiosk_doctor and date_iso and time_slot and doctor_id:
            try:
                _ensure_slot_locked(
                    doctor_id=doctor_id,
                    date_iso=str(date_iso),
                    time_slot=str(time_slot),
                    patient_id=pid,
                    appointment_id=aid,
                )
            except Exception:
                # Never break the attach flow – just log.
                log.warning("Failed to ensure slot lock during kiosk attach", exc_info=True)

        # Build UpdateExpression dynamically
        expr_names = {
            "#k": "kiosk",
            "#u": "updatedAt",
        }
        expr_values: Dict[str, Any] = {
            ":k": merged_kiosk,
            ":u": _now(),
        }
        update_expr = "SET #k = :k, #u = :u"

        if new_payment is not None:
            expr_names["#p"] = "payment"
            expr_values[":p"] = new_payment
            update_expr += ", #p = :p"

        if new_status is not None:
            expr_names["#s"] = "status"
            expr_values[":s"] = new_status
            update_expr += ", #s = :s"

        update_resp = tbl.update_item(
            Key={"patientId": pid, "appointmentId": aid},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ConditionExpression="attribute_exists(patientId) AND attribute_exists(appointmentId)",
            ReturnValues="ALL_NEW",
        )

        # --- AFTER UPDATE: send WhatsApp confirmation ---
        try:
            if finalize and is_kiosk_doctor and phone and date_iso and time_slot:
                from datetime import datetime as dt_mod
                from zoneinfo import ZoneInfo

                tz = ZoneInfo(os.getenv("CLINIC_TIME_ZONE", "Asia/Kolkata"))
                try:
                    y, m, d = [int(x) for x in str(date_iso).split("-", 2)]
                    hh, mm = [int(x) for x in str(time_slot).split(":", 1)]
                    when_local = dt_mod(y, m, d, hh, mm, tzinfo=tz)
                except Exception:
                    when_local = dt_mod.now(tz)

                send_doctor_booking_confirmation(
                    phone_e164=phone,
                    patient_name=patient_name,
                    when_local=when_local,
                    doctor_name=doctor_name,
                    clinic_name=clinic_name,
                )

                # (Consecutive warning here is commented out in your current code)
        except Exception:
            log.warning("Failed to send WhatsApp for kiosk attach finalization", exc_info=True)

        return {
            "ok": True,
            "patientId": pid,
            "appointmentId": aid,
            "kiosk": update_resp["Attributes"].get("kiosk", {}),
            "updatedAt": update_resp["Attributes"].get("updatedAt"),
        }
    except HTTPException:
        raise
    except ClientError as e:
        code = e.response["Error"].get("Code")
        msg = e.response["Error"].get("Message", str(e))
        if code == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Appointment not found")
        log.exception("DynamoDB update failed: %s", msg)
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")
    except Exception as e:
        log.exception("Unexpected error")
        raise HTTPException(status_code=500, detail=str(e))
