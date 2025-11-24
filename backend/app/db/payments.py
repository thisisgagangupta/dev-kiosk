# backend/app/db/payments.py
import os
import time
from typing import Optional, Dict, Any
import boto3
from botocore.exceptions import ClientError

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DDB_TABLE_PAYMENTS = os.getenv("DDB_TABLE_PAYMENTS", "medmitra_payments")
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None

def _ddb():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    return boto3.resource("dynamodb", **kw)

def payments_table():
    return _ddb().Table(DDB_TABLE_PAYMENTS)

def put_intent(
    invoice_id: str,
    *,
    order_id: str,
    amount: int,
    currency: str,
    patient_id: str,
    appointment_id: str,
    notes: Optional[Dict[str, Any]] = None,
):
    tbl = payments_table()
    now = int(time.time())
    item = {
        "invoice_id": invoice_id,         # PK (string)
        "order_id": order_id,
        "status": "created",
        "amount": int(amount),
        "currency": currency,
        "patient_id": patient_id,
        "appointment_id": appointment_id,
        "notes": notes or {},
        "created_at": now,
        "updated_at": now,
    }
    try:
        tbl.put_item(Item=item)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ValidationException":
            # log and continue (don’t block payment flow)
            print("[payments] put_intent skipped due to schema mismatch")
            return
        raise

from botocore.exceptions import ClientError

def get_by_invoice(invoice_id: str) -> Optional[Dict[str, Any]]:
    tbl = payments_table()
    try:
        r = tbl.get_item(Key={"invoice_id": invoice_id})
        return r.get("Item")
    except ClientError as e:
        # Schema mismatch or table missing → treat as not found (dev-friendly)
        if e.response.get("Error", {}).get("Code") == "ValidationException":
            return None
        raise

def update_by_invoice(invoice_id: str, patch: Dict[str, Any]):
    tbl = payments_table()
    # Build a dynamic SET expression
    expr_names = {}
    expr_values = {":updated_at": int(time.time())}
    sets = ["updated_at = :updated_at"]
    idx = 0
    for k, v in patch.items():
        idx += 1
        name_key = f"#n{idx}"
        value_key = f":v{idx}"
        expr_names[name_key] = k
        expr_values[value_key] = v
        sets.append(f"{name_key} = {value_key}")

    try:
        tbl.update_item(
            Key={"invoice_id": invoice_id},
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ConditionExpression="attribute_exists(invoice_id)",
        )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ValidationException":
            print("[payments] update_by_invoice skipped due to schema mismatch")
            return
        raise