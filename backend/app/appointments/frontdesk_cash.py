import logging
import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

import boto3
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, constr
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from app.db.dynamo import appointments_table
from app.util.datetime import now_utc_iso
from app.appointments.router import _patient_display_name_from_id  # NEW import

log = logging.getLogger("frontdesk-cash")
router = APIRouter(prefix="/frontdesk", tags=["frontdesk"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DDB_TABLE_SLOTS = os.getenv("DDB_TABLE_SLOTS", "medmitra_appointment_slots")
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None
CLINIC_TZ = os.getenv("CLINIC_TIME_ZONE", "Asia/Kolkata")


def _slots_table():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    ddb = boto3.resource("dynamodb", **kw)
    return ddb.Table(DDB_TABLE_SLOTS)


tbl_slots = _slots_table()


class CashPendingItem(BaseModel):
    patientId: str
    appointmentId: str
    clinicName: Optional[str] = ""
    doctorName: Optional[str] = ""
    dateISO: Optional[str] = ""
    timeSlot: Optional[str] = ""
    amount: Optional[int] = 0
    status: Optional[str] = ""
    kioskPayment: Optional[Dict[str, Any]] = None
    patientName: Optional[str] = ""


class CashSettleReq(BaseModel):
    patientId: constr(min_length=6)
    appointmentId: constr(min_length=6)


def _parse_details(it: Dict[str, Any]) -> Dict[str, Any]:
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


def _today_iso_local() -> str:
    tz = ZoneInfo(CLINIC_TZ)
    return datetime.now(tz).date().isoformat()


def _sort_key(row: CashPendingItem) -> int:
    d = (row.dateISO or "").strip()
    t = (row.timeSlot or "").strip()
    if not d:
        return 2**62
    try:
        h_str, m_str = (t.split(":", 1) + ["0"])[:2]
        dt = datetime.fromisoformat(f"{d}T{h_str.zfill(2)}:{m_str.zfill(2)}:00")
        return int(dt.timestamp())
    except Exception:
        return 2**62


@router.get("/cash-pending", response_model=List[CashPendingItem])
def list_cash_pending():
    """
    List all appointments where kiosk.payment.mode == 'pay_later'
    and kiosk.payment.status == 'unpaid'. These are patients who
    chose 'Pay at reception' on the kiosk.
    Only today's entries (clinic local date) are returned, sorted by time.
    """
    tbl = appointments_table()
    items: List[Dict[str, Any]] = []

    try:
        scan_kwargs: Dict[str, Any] = {
            "FilterExpression": Attr("kiosk.payment.mode").eq("pay_later")
            & Attr("kiosk.payment.status").eq("unpaid")
        }
        while True:
            resp = tbl.scan(**scan_kwargs)
            items.extend(resp.get("Items", []))
            last = resp.get("LastEvaluatedKey")
            if not last:
                break
            scan_kwargs["ExclusiveStartKey"] = last
    except ClientError as e:
        log.exception("DynamoDB scan failed")
        raise HTTPException(
            status_code=500, detail=e.response["Error"].get("Message", str(e))
        )
    except Exception as e:
        log.exception("Unexpected scan error")
        raise HTTPException(status_code=500, detail=str(e))

    today_iso = _today_iso_local()
    out: List[CashPendingItem] = []
    for it in items:
        kiosk = it.get("kiosk") or {}
        kpay = kiosk.get("payment") or {}
        amount = 0

        try:
            if isinstance(kpay, dict) and kpay.get("amount") is not None:
                amount = int(kpay["amount"])
            elif isinstance(it.get("payment"), dict) and it["payment"].get("amount") is not None:
                amount = int(it["payment"]["amount"])
        except Exception:
            amount = 0

        details = _parse_details(it)
        date_iso = (
            it.get("dateISO")
            or details.get("dateISO")
            or (it.get("collection") or {}).get("preferredDateISO")
            or ""
        )
        time_slot = (
            it.get("timeSlot")
            or details.get("timeSlot")
            or (it.get("collection") or {}).get("preferredSlot")
            or ""
        )

        # Only today's entries
        if (date_iso or "")[:10] != today_iso:
            continue

        # Best-effort patient name:
        # 1) medmitra_patients / Cognito via helper
        # 2) fallback to contact.name if helper returns nothing
        pid = it.get("patientId", "")
        patient_name = _patient_display_name_from_id(pid) or ""

        if not patient_name:
            contact = it.get("contact") or {}
            patient_name = (contact.get("name") or "").strip()
            if not patient_name and isinstance(details, dict):
                d_contact = (details.get("contact") or {}) or {}
                patient_name = (d_contact.get("name") or "").strip()

        out.append(
            CashPendingItem(
                patientId=pid,
                appointmentId=it.get("appointmentId", ""),
                clinicName=(it.get("clinicName") or details.get("clinicName") or ""),
                doctorName=(it.get("doctorName") or details.get("doctorName") or ""),
                dateISO=date_iso or "",
                timeSlot=time_slot or "",
                amount=amount,
                status=str(it.get("status") or it.get("payment", {}).get("status") or ""),
                kioskPayment=kpay or None,
                patientName=patient_name or "",
            )
        )

    # Sort by time within today
    out.sort(key=_sort_key)
    return out


@router.post("/cash/settle")
def settle_cash(req: CashSettleReq = Body(...)):
    """
    Mark a cash-pending appointment as paid (cash) and update kiosk.payment.
    Front desk should call this after collecting cash, then issue a token.
    """
    tbl = appointments_table()
    try:
        resp = tbl.get_item(
            Key={"patientId": req.patientId, "appointmentId": req.appointmentId}
        )
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Appointment not found")

        kiosk = item.get("kiosk") or {}
        kpay = kiosk.get("payment") or {}

        # determine amount best-effort
        amount: Optional[int] = None
        try:
            if isinstance(kpay, dict) and kpay.get("amount") is not None:
                amount = int(kpay["amount"])
            elif isinstance(item.get("payment"), dict) and item["payment"].get("amount") is not None:
                amount = int(item["payment"]["amount"])
        except Exception:
            amount = None

        # canonical payment map
        payment_map = item.get("payment") or {}
        if not isinstance(payment_map, dict):
            payment_map = {}
        payment_map.setdefault("mode", "pay_later")
        payment_map["status"] = "paid"
        payment_map["method"] = "cash"
        payment_map.setdefault("currency", "INR")
        if amount is not None:
            payment_map["amount"] = int(amount)

        # kiosk.payment
        if not isinstance(kpay, dict):
            kpay = {}
        kpay["mode"] = "pay_later"
        kpay["status"] = "paid"
        kpay["channel"] = "front-desk"
        kpay["paidAt"] = now_utc_iso()
        kiosk["payment"] = kpay

        update_resp = tbl.update_item(
            Key={"patientId": req.patientId, "appointmentId": req.appointmentId},
            UpdateExpression="SET #p = :p, #k = :k, #u = :u",
            ExpressionAttributeNames={
                "#p": "payment",
                "#k": "kiosk",
                "#u": "updatedAt",
            },
            ExpressionAttributeValues={
                ":p": payment_map,
                ":k": kiosk,
                ":u": now_utc_iso(),
            },
            ConditionExpression="attribute_exists(patientId) AND attribute_exists(appointmentId)",
            ReturnValues="ALL_NEW",
        )
        return {"ok": True, "appointment": update_resp["Attributes"]}
    except HTTPException:
        raise
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        if code == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Appointment not found")
        log.exception("DynamoDB update failed")
        raise HTTPException(status_code=500, detail=msg)
    except Exception as e:
        log.exception("Unexpected error in settle_cash")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cash/cancel")
def cancel_cash(req: CashSettleReq = Body(...)):
    """
    Cancel a cash-pending appointment and free the associated slot.
    Used when a patient decides not to proceed.
    """
    tbl = appointments_table()
    try:
        resp = tbl.get_item(
            Key={"patientId": req.patientId, "appointmentId": req.appointmentId}
        )
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Appointment not found")

        details = _parse_details(item)
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

        kiosk = item.get("kiosk") or {}
        kpay = kiosk.get("payment") or {}
        if not isinstance(kpay, dict):
            kpay = {}
        kpay["status"] = "cancelled"
        kiosk["payment"] = kpay

        payment_map = item.get("payment") or {}
        if not isinstance(payment_map, dict):
            payment_map = {}
        payment_map["status"] = "cancelled"

        update_resp = tbl.update_item(
            Key={"patientId": req.patientId, "appointmentId": req.appointmentId},
            UpdateExpression="SET #s = :s, #p = :p, #k = :k, #u = :u",
            ExpressionAttributeNames={
                "#s": "status",
                "#p": "payment",
                "#k": "kiosk",
                "#u": "updatedAt",
            },
            ExpressionAttributeValues={
                ":s": "CANCELLED",
                ":p": payment_map,
                ":k": kiosk,
                ":u": now_utc_iso(),
            },
            ConditionExpression="attribute_exists(patientId) AND attribute_exists(appointmentId)",
            ReturnValues="ALL_NEW",
        )

        # Free the slot if we know doctor/date/time
        try:
            if doctor_id and date_iso and time_slot:
                resource_key = f"doctor#{doctor_id}"
                slot_key = f"{date_iso}#{time_slot}"
                tbl_slots.delete_item(Key={"resourceKey": resource_key, "slotKey": slot_key})
        except Exception as e:
            log.warning(
                "Failed to delete slot lock for cancelled appointment %s/%s: %s",
                req.patientId,
                req.appointmentId,
                e,
            )

        return {"ok": True, "appointment": update_resp["Attributes"]}
    except HTTPException:
        raise
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        if code == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Appointment not found")
        log.exception("DynamoDB update failed in cancel_cash")
        raise HTTPException(status_code=500, detail=msg)
    except Exception as e:
        log.exception("Unexpected error in cancel_cash")
        raise HTTPException(status_code=500, detail=str(e))
