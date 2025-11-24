# backend/app/lab/router.py
import os
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field, constr

log = logging.getLogger("lab-bookings")

router = APIRouter(prefix="/lab/bookings", tags=["lab-bookings"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DDB_TABLE_APPTS = os.getenv("DDB_TABLE_APPOINTMENTS", "medmitra-appointments")
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None

def _ddb():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    return boto3.resource("dynamodb", **kw)

tbl_appts = _ddb().Table(DDB_TABLE_APPTS)


# ---------- Models ----------

class LabTest(BaseModel):
    id: str
    name: str
    price: float

class WalkinLabBookingRequest(BaseModel):
    patientId: constr(strip_whitespace=True, min_length=6)
    phone: Optional[str] = None
    tests: List[LabTest] = Field(..., min_items=1)
    siteId: Optional[str] = "main"

class LabBookingSummary(BaseModel):
    bookingId: str
    appointmentId: str
    patientId: str
    patientName: Optional[str] = None
    phone: Optional[str] = None
    orderedTests: List[LabTest] = []
    additionalTests: List[LabTest] = []
    paid: bool = False
    hasDoctorVisit: bool = False
    existingToken: Optional[str] = None


# ---------- Helpers ----------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _total_price(tests: List[Dict[str, Any]]) -> float:
    total = 0.0
    for t in tests:
        try:
            p = t.get("price", 0)
            total += float(p)
        except Exception:
            pass
    return total


# ---------- GET /lab/bookings/by-patient ----------

@router.get("/by-patient", response_model=List[LabBookingSummary])
def list_lab_bookings_for_patient(
    patientId: str = Query(..., description="Cognito sub / patientId"),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Returns lab bookings for a patient from the shared medmitra-appointments table.

    It looks for:
      - recordType == 'lab'
      - or items that have a 'tests' array
    """
    try:
        resp = tbl_appts.query(
            KeyConditionExpression=Key("patientId").eq(patientId),
            ScanIndexForward=False,  # newest first
            Limit=limit,
        )
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.exception("DynamoDB query failed")
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")

    out: List[LabBookingSummary] = []

    for it in resp.get("Items", []):
        record_type = (it.get("recordType") or "").lower()
        tests = it.get("tests") or []
        if record_type != "lab" and not tests:
            continue

        # Normalize tests into LabTest[]
        norm_tests: List[LabTest] = []
        for t in tests:
            try:
                norm_tests.append(
                    LabTest(
                        id=str(t.get("id") or t.get("code") or t.get("name") or ""),
                        name=str(t.get("name") or t.get("testName") or "Lab Test"),
                        price=float(t.get("price", 0)),
                    )
                )
            except Exception:
                continue

        if not norm_tests:
            continue

        # Determine payment status
        payment = it.get("payment") or {}
        status = str(payment.get("status") or "").lower()
        paid = status in ("paid", "captured", "success")

        # Existing token best-effort: if you already store it on the row
        # under kiosk.tokenNo or similar, read it. For now we keep this simple.
        kiosk = it.get("kiosk") or {}
        existing_token = kiosk.get("tokenNo") or kiosk.get("token") or None

        out.append(
            LabBookingSummary(
                bookingId=it.get("appointmentId"),
                appointmentId=it.get("appointmentId"),
                patientId=it.get("patientId"),
                patientName=(it.get("patientName") or ""),
                phone=(it.get("contact") or {}).get("phone"),
                orderedTests=norm_tests,
                additionalTests=[],  # can be populated if you store extras separately
                paid=paid,
                hasDoctorVisit=False,  # can be refined later via cross-lookup
                existingToken=existing_token,
            )
        )

    return out


# ---------- POST /lab/bookings/walkin ----------

@router.post("/walkin")
def create_walkin_lab_booking(payload: WalkinLabBookingRequest = Body(...)):
    """
    Creates a lab booking for walk-in patients into the same medmitra-appointments table.

    This mirrors the Lambda lab writer:
      - recordType = 'lab'
      - tests[] with name/price
      - collection = {type:'lab', preferredDateISO, preferredSlot, siteId}
      - payment.total = sum(prices), status='pending'
    """
    if not payload.tests:
        raise HTTPException(status_code=400, detail="At least one test is required")

    appointment_id = str(uuid.uuid4())
    created_at = _now_iso()
    today = datetime.now().date().isoformat()

    tests = [
        {
            "id": t.id,
            "name": t.name,
            "price": int(t.price),
        }
        for t in payload.tests
    ]
    total_price = _total_price(tests)

    item: Dict[str, Any] = {
        "patientId": payload.patientId,
        "appointmentId": appointment_id,
        "createdAt": created_at,
        "recordType": "lab",
        "source": "kiosk",
        "status": "BOOKED",
        "tests": tests,
        "collection": {
            "type": "lab",
            "siteId": payload.siteId or "main",
            "preferredDateISO": today,
            "preferredSlot": "Walk-in",
        },
        "contact": {
            "phone": payload.phone or "",
            "name": "",
            "email": "",
        },
        "payment": {
            "status": "pending",
            "total": int(total_price),
        },
    }

    try:
        tbl_appts.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(patientId) AND attribute_not_exists(appointmentId)",
        )
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.exception("DynamoDB put_item failed")
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")

    return {
        "appointmentId": appointment_id,
        "patientId": payload.patientId,
        "createdAt": created_at,
        "total": total_price,
    }
