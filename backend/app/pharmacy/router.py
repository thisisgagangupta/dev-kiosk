# backend/app/pharmacy/router.py
import os
import logging
from typing import List, Optional, Dict, Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Query

log = logging.getLogger("pharmacy")
router = APIRouter(prefix="/pharmacy", tags=["pharmacy"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DDB_TABLE_PHARM_ORDERS = os.getenv("DDB_TABLE_PHARM_ORDERS", "medmitra_medication_orders")
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None


def _ddb():
  kw = {"region_name": AWS_REGION}
  if DYNAMODB_ENDPOINT:
      kw["endpoint_url"] = DYNAMODB_ENDPOINT
  return boto3.resource("dynamodb", **kw)


orders_table = _ddb().Table(DDB_TABLE_PHARM_ORDERS)


# ---- Models (minimal, match FE types) ----

def _order_to_bill_item(order: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map a single order row to PharmacyBillItem.
    For now we treat each order as one line item.
    """
    qty = int(order.get("quantity", 0))
    unit_price = float(order.get("unitPrice", 0.0))
    total_amount = float(order.get("totalAmount", unit_price * qty))
    dosage = str(order.get("dosage", ""))

    return {
        "id": str(order.get("selectedDrugId") or order.get("drugId") or order.get("orderId")),
        "name": str(order.get("brandName") or "Medicine"),
        "dosage": dosage,
        "quantity": qty,
        "price": total_amount,
        "prescribed": True,  # kiosk side can refine later
    }


def _order_status_to_bill_status(order_status: str) -> str:
    """
    Convert medmitra_medication_orders.orderStatus → 'pending'|'paid'
    Very simple rule:
      - 'delivered' => 'paid'
      - everything else => 'pending'
    You can refine later (e.g. add an explicit 'paid' status).
    """
    s = (order_status or "").lower()
    if s in ("delivered", "completed"):
        return "paid"
    return "pending"


@router.get("/bills/by-patient")
def get_latest_bill_for_patient(
    patientId: str = Query(..., description="Cognito sub / patientId"),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Return a single PharmacyBillSummary for the latest order(s) of this patient.

    For now, we:
      - query PatientOrdersIndex by patientId (newest first)
      - take the most recent order
      - map it into a bill the kiosk can display.
    """
    try:
        resp = orders_table.query(
            IndexName="PatientOrdersIndex",
            KeyConditionExpression=Key("patientId").eq(patientId),
            ScanIndexForward=False,  # newest first
            Limit=limit,
        )
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.exception("DynamoDB query failed in pharmacy/bills/by-patient")
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")

    items = resp.get("Items", [])
    if not items:
        return {"bill": None}

    # Take the most recent item as "the bill" for now.
    latest = items[0]

    bill_items: List[Dict[str, Any]] = [_order_to_bill_item(latest)]
    total = sum(float(it["price"]) for it in bill_items)

    bill_status = _order_status_to_bill_status(latest.get("orderStatus", "confirmed"))

    bill = {
        "billNumber": str(latest.get("orderId") or latest.get("order_id")),
        "patientName": "",            # optional; kiosk can show just phone
        "phone": "",
        "items": bill_items,
        "total": total,
        "status": bill_status,        # 'pending' or 'paid'
        "hasDoctorVisit": True,       # heuristic; you can refine
        "existingToken": None,
    }

    return {"bill": bill}