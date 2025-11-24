import os
import re
import logging
from app.util.datetime import now_utc_iso, now_epoch_ms
from typing import Optional, Any, Dict

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, validator
from botocore.exceptions import ClientError
from app.db.dynamo import appointments_table

log = logging.getLogger("appt-kiosk-attach")
router = APIRouter(prefix="/kiosk/appointments", tags=["kiosk-appointments"])


class KioskPayload(BaseModel):
    # required keys to locate the row
    patientId: str = Field(..., min_length=6)
    appointmentId: str = Field(..., min_length=6)

    # everything we want to attach under "kiosk"
    kiosk: Dict[str, Any] = Field(
        default_factory=dict,
        description="Free-form kiosk payload (reason, voice flags, payment, device info, etc.)",
    )

    # Optional safety: allow only plain JSON map values (lists/str/num/bool/None)
    @validator("kiosk")
    def _no_binary(cls, v):
        # very light guard; extend as needed
        if not isinstance(v, dict):
            raise ValueError("kiosk must be an object")
        return v


def _now():
    return now_utc_iso()


@router.post("/attach")
def attach_kiosk_data(payload: KioskPayload = Body(...)):
    """
    Merge/attach kiosk details into the appointment row as a single map field 'kiosk'.
    - Requires existing item (patientId + appointmentId).
    - Adds/updates kiosk.updatedAt; sets kiosk.createdAt if first time.
    - Server-side merge logic to preserve previous 'kiosk' content.
    - NEW: if kiosk.payment indicates a pay-later choice and no canonical
      payment exists yet, mirror that into 'payment' for the appointment.
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
        # Check whether kiosk exists so we can set createdAt once
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

        # --- NEW: mirror pay-later into canonical payment if payment is empty ---
        existing_payment = item.get("payment")
        new_payment: Optional[Dict[str, Any]] = None

        kiosk_payment = merged_kiosk.get("payment")
        if (
            not existing_payment  # only if there is no canonical payment yet
            and isinstance(kiosk_payment, dict)
            and kiosk_payment
        ):
            # Start from empty or existing_payment (if it was a weird falsy value)
            base: Dict[str, Any] = existing_payment if isinstance(existing_payment, dict) else {}

            # Copy core fields from kiosk.payment
            for key in ("mode", "status", "amount", "currency"):
                if kiosk_payment.get(key) is not None:
                    base[key] = kiosk_payment[key]

            # Defaults for mode/currency if still missing
            status_lower = str(base.get("status") or "").lower()
            if "mode" not in base or not base["mode"]:
                if status_lower in ("unpaid", "pending", "created", "initiated"):
                    base["mode"] = "pay_later"
                else:
                    base["mode"] = "pay_now"
            if "currency" not in base or not base["currency"]:
                base["currency"] = "INR"

            # We keep whatever 'amount' was provided (rupees vs paise is already
            # a broader system concern; we don't change units here).
            new_payment = base

        # Build UpdateExpression dynamically depending on whether we set payment
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

        update_resp = tbl.update_item(
            Key={"patientId": pid, "appointmentId": aid},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ConditionExpression="attribute_exists(patientId) AND attribute_exists(appointmentId)",
            ReturnValues="ALL_NEW",
        )

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
