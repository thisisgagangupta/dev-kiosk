import os, hmac, hashlib, logging, json
from app.util.datetime import now_utc_iso, now_epoch_ms
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel, Field, validator
import razorpay

from app.db.dynamo import appointments_table
from app.db.payments import get_by_invoice, put_intent, update_by_invoice

log = logging.getLogger("billing-razorpay")
router = APIRouter(prefix="/billing/razorpay", tags=["billing-razorpay"])

def _now_iso():
    return now_utc_iso()

# --- ENV / Config ---
RAZORPAY_KEY_ID         = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET     = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
RAZORPAY_AUTO_CAPTURE   = (os.getenv("RAZORPAY_AUTO_CAPTURE", "true").lower() != "false")
RAZORPAY_CURRENCY       = os.getenv("RAZORPAY_CURRENCY", "INR").upper()

if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
    raise RuntimeError("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET")

client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# --- Models ---
class CustomerPrefill(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    contact: Optional[str] = None

class CreateOrderReq(BaseModel):
    patientId: str = Field(..., min_length=6)
    appointmentId: str = Field(..., min_length=6)
    invoice_id: str = Field(..., min_length=3)
    amount: int = Field(..., gt=0)        # paise
    currency: str = Field(default=RAZORPAY_CURRENCY, min_length=3, max_length=3)
    notes: Dict[str, Any] = Field(default_factory=dict)
    customer: Optional[CustomerPrefill] = None

    @validator("currency")
    def _upper(cls, v): return (v or "").upper()

class CreateOrderResp(BaseModel):
    key_id: str
    order_id: str
    amount: int
    currency: str
    invoice_id: str
    notes: Dict[str, Any]

class VerifyReq(BaseModel):
    patientId: str
    appointmentId: str
    invoice_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

# --- Kiosk payment merge into appointment row ---
def _merge_payment_into_appointment(patient_id: str, appointment_id: str, patch: Dict[str, Any]):
    tbl = appointments_table()
    resp = tbl.get_item(Key={"patientId": patient_id, "appointmentId": appointment_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Appointment not found")

    kiosk = item.get("kiosk") or {}
    payment = kiosk.get("payment") or {}

    # --- NEW: normalize amount from paise → rupees if present in patch ---
    patched = dict(patch or {})
    amt = patched.get("amount")
    if amt is not None:
        try:
            # Razorpay amounts are in paise; appointment-side we store rupees
            amt_val = float(amt)
            patched["amount"] = int(round(amt_val / 100.0))
        except Exception:
            # If anything goes wrong, keep original value as-is
            pass

    payment.update(patched)
    kiosk["payment"] = payment
    kiosk.setdefault("source", "kiosk")
    kiosk["updatedAt"] = _now_iso()
    kiosk.setdefault("createdAt", _now_iso())

    tbl.update_item(
        Key={"patientId": patient_id, "appointmentId": appointment_id},
        UpdateExpression="SET #k = :k, #u = :u",
        ExpressionAttributeNames={"#k": "kiosk", "#u": "updatedAt"},
        ExpressionAttributeValues={":k": kiosk, ":u": _now_iso()},
        ConditionExpression="attribute_exists(patientId) AND attribute_exists(appointmentId)",
    )

def _verify_checkout_sig(order_id: str, payment_id: str, signature: str) -> bool:
    payload = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    # timing-safe compare
    return hmac.compare_digest(expected, signature)

def _verify_webhook_sig(raw: bytes, signature: str) -> bool:
    if not (RAZORPAY_WEBHOOK_SECRET and signature):
        return False
    mac = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, signature)

# --- Create/Reuse Order (idempotent per invoice_id) ---
@router.post("/order", response_model=CreateOrderResp)
def create_or_reuse_order(body: CreateOrderReq, x_patient_id: Optional[str] = Header(None)):
    # optional cross-check to deter header/body mismatch
    if x_patient_id and x_patient_id.strip() != body.patientId:
        raise HTTPException(status_code=400, detail="Patient mismatch")

    # TODO (recommended): recompute amount server-side from your catalog for walk-ins
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    existing = get_by_invoice(body.invoice_id)
    if existing:
        # Reuse if order exists and isn't terminal failed/refunded
        status = (existing.get("status") or "").lower()
        if status in ("created", "attempted", "authorized"):
            return CreateOrderResp(
                key_id=RAZORPAY_KEY_ID,
                order_id=existing["order_id"],
                amount=existing["amount"],
                currency=existing["currency"],
                invoice_id=body.invoice_id,
                notes=existing.get("notes") or {},
            )

    # Fresh order
    try:
        order = client.order.create({
            "amount": body.amount,
            "currency": body.currency,
            "receipt": body.invoice_id,  # your idempotent handle
            "notes": {
                "invoice_id": body.invoice_id,
                "patientId": body.patientId,
                "appointmentId": body.appointmentId,
                **(body.notes or {})
            }
        })
    except Exception as e:
        log.exception("Razorpay order.create failed for invoice=%s", body.invoice_id)
        raise HTTPException(status_code=502, detail=f"Failed to create order: {e}")

    # Persist intent in Payments table (idempotency) and mirror into appointment row (best-effort)
    try:
        put_intent(
            body.invoice_id,
            order_id=order["id"],
            amount=order["amount"],
            currency=order["currency"],
            patient_id=body.patientId,
            appointment_id=body.appointmentId,
            notes=order.get("notes") or {},
        )
    except Exception as e:
        log.exception("Failed to persist payment intent: %s", e)

    try:
        _merge_payment_into_appointment(
            body.patientId,
            body.appointmentId,
            {
                "provider": "razorpay",
                "status": "created",
                "orderId": order["id"],
                "amount": order["amount"],   # paise → rupees handled inside helper
                "currency": order["currency"],
                "invoiceId": body.invoice_id,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Failed to mirror payment intent to appointment: %s", e)

    return CreateOrderResp(
        key_id=RAZORPAY_KEY_ID,
        order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        invoice_id=body.invoice_id,
        notes=order.get("notes") or {},
    )

# --- Verify (from FE Checkout handler) ---
@router.post("/verify")
def verify_checkout(body: VerifyReq, x_patient_id: Optional[str] = Header(None)):
    if x_patient_id and x_patient_id.strip() != body.patientId:
        raise HTTPException(status_code=400, detail="Patient mismatch")

    if not _verify_checkout_sig(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Signature mismatch")

    # manual capture if auto-capture is disabled
    if not RAZORPAY_AUTO_CAPTURE:
        try:
            pay = client.payment.fetch(body.razorpay_payment_id)
            client.payment.capture(body.razorpay_payment_id, int(pay["amount"]))
        except Exception as e:
            log.exception("Manual capture failed")
            raise HTTPException(status_code=502, detail=f"Capture failed: {e}")

    # try to fetch payment details for richer store
    try:
        pay = client.payment.fetch(body.razorpay_payment_id)
        status = pay.get("status", "captured" if RAZORPAY_AUTO_CAPTURE else "authorized")
    except Exception:
        pay = {}
        status = "captured" if RAZORPAY_AUTO_CAPTURE else "authorized"

    # Persist in Payments table
    try:
        update_by_invoice(
            body.invoice_id,
            {
                "status": status,
                "payment_id": body.razorpay_payment_id,
                "order_id": body.razorpay_order_id,
                "method": pay.get("method"),
                "email": pay.get("email"),
                "contact": pay.get("contact"),
                "fee": pay.get("fee"),
                "tax": pay.get("tax"),
                "verified": True,
                "verified_at": _now_iso(),
                "verified_epoch": now_epoch_ms(),
            }
        )
    except Exception as e:
        log.exception("Payments table update failed: %s", e)

    # Mirror into appointment
    try:
        _merge_payment_into_appointment(
            body.patientId,
            body.appointmentId,
            {
                "provider": "razorpay",
                "orderId": body.razorpay_order_id,
                "paymentId": body.razorpay_payment_id,
                "status": status,
                "method": pay.get("method"),
                "email": pay.get("email"),
                "contact": pay.get("contact"),
                "fee": pay.get("fee"),
                "tax": pay.get("tax"),
                "verified": True,
                "verifiedAt": _now_iso(),
                "verifiedEpoch": now_epoch_ms(),
                # we do NOT set amount here; intent already wrote it (normalized) if needed
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Failed to persist verification into appointment: %s", e)

    return {"ok": True, "status": status, "payment_id": body.razorpay_payment_id}

# backend/app/billing/razorpay_router.py  (add near bottom, before webhook or after – order doesn't matter)

class PharmacyOrderReq(BaseModel):
    patientId: str = Field(..., min_length=1)
    invoice_id: str = Field(..., min_length=3)  # we'll use billNumber
    amount: int = Field(..., gt=0)              # paise
    currency: str = Field(default=RAZORPAY_CURRENCY, min_length=3, max_length=3)
    notes: Dict[str, Any] = Field(default_factory=dict)
    customer: Optional[CustomerPrefill] = None

    @validator("currency")
    def _upper2(cls, v): return (v or "").upper()


class PharmacyVerifyReq(BaseModel):
    patientId: str
    invoice_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/pharmacy/order", response_model=CreateOrderResp)
def create_pharmacy_order(body: PharmacyOrderReq):
    """
    Create a Razorpay order for a pharmacy bill.
    Unlike the main /order endpoint, we do NOT require an appointment row.
    """
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    # Reuse the same idempotent pattern via invoice_id in payments table
    existing = get_by_invoice(body.invoice_id)
    if existing:
        status = (existing.get("status") or "").lower()
        if status in ("created", "attempted", "authorized"):
            return CreateOrderResp(
                key_id=RAZORPAY_KEY_ID,
                order_id=existing["order_id"],
                amount=existing["amount"],
                currency=existing["currency"],
                invoice_id=body.invoice_id,
                notes=existing.get("notes") or {},
            )

    # Fresh order
    try:
        order = client.order.create({
            "amount": body.amount,
            "currency": body.currency,
            "receipt": body.invoice_id,
            "notes": {
                "invoice_id": body.invoice_id,
                "patientId": body.patientId,
                "context": "pharmacy",
                **(body.notes or {}),
            },
        })
    except Exception as e:
        log.exception("Razorpay order.create failed for pharmacy invoice=%s", body.invoice_id)
        raise HTTPException(status_code=502, detail=f"Failed to create order: {e}")

    # Persist intent (no appointment_id)
    try:
        put_intent(
            body.invoice_id,
            order_id=order["id"],
            amount=order["amount"],
            currency=order["currency"],
            patient_id=body.patientId,
            appointment_id="",   # pharmacy-only; no appointment row
            notes=order.get("notes") or {},
        )
    except Exception as e:
        log.exception("Failed to persist pharmacy payment intent: %s", e)

    return CreateOrderResp(
        key_id=RAZORPAY_KEY_ID,
        order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        invoice_id=body.invoice_id,
        notes=order.get("notes") or {},
    )


@router.post("/pharmacy/verify")
def verify_pharmacy_checkout(body: PharmacyVerifyReq):
    """
    Verify payment for a pharmacy bill. Updates medmitra_payments only.
    """
    if not _verify_checkout_sig(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Signature mismatch")

    # Fetch Razorpay payment
    try:
        pay = client.payment.fetch(body.razorpay_payment_id)
        status = pay.get("status", "captured" if RAZORPAY_AUTO_CAPTURE else "authorized")
    except Exception:
        pay = {}
        status = "captured" if RAZORPAY_AUTO_CAPTURE else "authorized"

    # Update payments table
    try:
        update_by_invoice(
            body.invoice_id,
            {
                "status": status,
                "payment_id": body.razorpay_payment_id,
                "order_id": body.razorpay_order_id,
                "method": pay.get("method"),
                "email": pay.get("email"),
                "contact": pay.get("contact"),
                "fee": pay.get("fee"),
                "tax": pay.get("tax"),
                "verified": True,
                "verified_at": _now_iso(),
                "verified_epoch": now_epoch_ms(),
                "context": "pharmacy",
            },
        )
    except Exception as e:
        log.exception("Pharmacy payments table update failed: %s", e)

    # No appointment mirror here.
    return {"ok": True, "status": status, "payment_id": body.razorpay_payment_id}


# --- Webhook (source of truth for late events) ---
@router.post("/webhook")
async def webhook(request: Request):
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")

    if not _verify_webhook_sig(raw, sig):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    etype = str(event.get("event") or "")
    payload = event.get("payload") or {}
    pay = (payload.get("payment") or {}).get("entity") or {}
    order = (payload.get("order") or {}).get("entity") or {}

    notes = {}
    # Try to get our linkages
    try:
        notes = (order.get("notes") or {}) | (pay.get("notes") or {})
    except Exception:
        notes = order.get("notes") or pay.get("notes") or {}

    patient_id = (notes.get("patientId") or "").strip()
    appointment_id = (notes.get("appointmentId") or "").strip()
    invoice_id = (notes.get("invoice_id") or order.get("receipt") or "").strip()

    # Map event → status
    status = None
    if etype in ("order.paid", "payment.captured"):
        status = "captured"
    elif etype in ("payment.authorized",):
        status = "authorized"
    elif etype in ("payment.failed", "order.payment_failed"):
        status = "failed"
    elif etype in ("refund.processed",):
        status = "refunded"

    # Update payments table (best effort)
    try:
        patch = {
            "order_id": order.get("id") or pay.get("order_id"),
            "payment_id": pay.get("id"),
            "method": pay.get("method"),
            "fee": pay.get("fee"),
            "tax": pay.get("tax"),
            "webhook_event": etype,
            "webhook_at": _now_iso(),
        }
        if status:
            patch["status"] = status
        if invoice_id:
            update_by_invoice(invoice_id, patch)
    except Exception as e:
        log.exception("Payments table webhook update failed: %s", e)

    # Mirror into appointment if we can resolve it
    if patient_id and appointment_id:
        try:
            patch2 = {
                "provider": "razorpay",
                "orderId": order.get("id") or pay.get("order_id"),
                "paymentId": pay.get("id"),
                "method": pay.get("method"),
                "fee": pay.get("fee"),
                "tax": pay.get("tax"),
                "webhookEvent": etype,
                "webhookAt": _now_iso(),
            }
            if status:
                patch2["status"] = status
            _merge_payment_into_appointment(patient_id, appointment_id, patch2)
        except Exception as e:
            # never fail webhook
            log.exception("Webhook merge into appointment failed: %s", e)

    return {"ok": True}
