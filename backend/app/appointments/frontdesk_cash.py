# backend/app/appointments/frontdesk_cash.py
import logging
import json
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, constr
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from app.db.dynamo import appointments_table
from app.util.datetime import now_utc_iso

log = logging.getLogger("frontdesk-cash")
router = APIRouter(prefix="/frontdesk", tags=["frontdesk"])


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


@router.get("/cash-pending", response_model=List[CashPendingItem])
def list_cash_pending():
    """
    List all appointments where kiosk.payment.mode == 'pay_later'
    and kiosk.payment.status == 'unpaid'. These are patients who
    chose 'Pay at reception' on the kiosk.
    """
    tbl = appointments_table()
    items: List[Dict[str, Any]] = []

    try:
        scan_kwargs: Dict[str, Any] = {
            "FilterExpression": Attr("kiosk.payment.mode").eq("pay_later") & Attr("kiosk.payment.status").eq("unpaid")
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
        raise HTTPException(status_code=500, detail=e.response["Error"].get("Message", str(e)))
    except Exception as e:
        log.exception("Unexpected scan error")
        raise HTTPException(status_code=500, detail=str(e))

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

        out.append(
            CashPendingItem(
                patientId=it.get("patientId", ""),
                appointmentId=it.get("appointmentId", ""),
                clinicName=(it.get("clinicName") or details.get("clinicName") or ""),
                doctorName=(it.get("doctorName") or details.get("doctorName") or ""),
                dateISO=(it.get("dateISO") or details.get("dateISO") or ""),
                timeSlot=(it.get("timeSlot") or details.get("timeSlot") or ""),
                amount=amount,
                status=str(it.get("status") or it.get("payment", {}).get("status") or ""),
                kioskPayment=kpay or None,
            )
        )
    return out


@router.post("/cash/settle")
def settle_cash(req: CashSettleReq = Body(...)):
    """
    Mark a cash-pending appointment as paid (cash) and update kiosk.payment.
    Front desk should call this after collecting cash, then issue a token.
    """
    tbl = appointments_table()
    try:
        resp = tbl.get_item(Key={"patientId": req.patientId, "appointmentId": req.appointmentId})
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
        code = e.response["Error"].get("Code")
        msg = e.response["Error"].get("Message", str(e))
        if code == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Appointment not found")
        log.exception("DynamoDB update failed")
        raise HTTPException(status_code=500, detail=msg)
    except Exception as e:
        log.exception("Unexpected error in settle_cash")
        raise HTTPException(status_code=500, detail=str(e))
