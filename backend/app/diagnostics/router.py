# backend/app/diagnostics/router.py
import os
import json
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Header, Query, Body, Depends
from pydantic import BaseModel, Field, constr

log = logging.getLogger("diagnostics-partner")

router = APIRouter(prefix="/diagnostics/partner", tags=["diagnostics-partner"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
DDB_TABLE_APPTS = os.getenv("DDB_TABLE_APPOINTMENTS", "medmitra-appointments")
DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None
S3_BUCKET = (os.getenv("S3_BUCKET") or os.getenv("AWS_BUCKET_NAME") or "").strip() or None

DIAG_PARTNER_API_KEY = os.getenv("DIAG_PARTNER_API_KEY", "").strip()
if not DIAG_PARTNER_API_KEY:
    raise RuntimeError("DIAG_PARTNER_API_KEY must be set for diagnostics partner API")

def _ddb():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    return boto3.resource("dynamodb", **kw)

ddb = _ddb()
tbl_appts = ddb.Table(DDB_TABLE_APPTS)
s3 = boto3.client("s3", region_name=AWS_REGION) if S3_BUCKET else None


# ---------- Auth dependency ----------

def _check_partner_key(x_partner_key: str = Header(...)):
    if x_partner_key.strip() != DIAG_PARTNER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid partner key")


# ---------- Models ----------

class BookingSummary(BaseModel):
    patientId: str
    appointmentId: str
    diagnosticType: str
    dateISO: str
    timeSlot: str
    status: str
    paymentStatus: Optional[str] = None
    patientName: Optional[str] = None
    createdAt: Optional[str] = None

class BookingDetail(BaseModel):
    patientId: str
    appointmentId: str
    diagnosticType: str
    tests: List[Dict[str, Any]]
    dateISO: str
    timeSlot: str
    status: str
    paymentStatus: Optional[str] = None
    patientName: Optional[str] = None
    phone: Optional[str] = None
    createdAt: Optional[str] = None
    reports: List[Dict[str, Any]] = []  # list of {reportId, name, s3Key, contentType, uploadedAt}


class StatusUpdateRequest(BaseModel):
    status: constr(strip_whitespace=True, min_length=1, max_length=64)


class ReportPresignRequest(BaseModel):
    patientId: str
    appointmentId: str
    filename: str
    contentType: str = "application/pdf"


class ReportPresignResponse(BaseModel):
    uploadUrl: str
    s3Key: str
    reportId: str


class ReportRegisterRequest(BaseModel):
    patientId: str
    appointmentId: str
    reportId: str
    name: str
    s3Key: str
    contentType: str = "application/pdf"


# ---------- Helpers ----------

def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def _get_appointment(patient_id: str, appointment_id: str) -> Dict[str, Any]:
    try:
        resp = tbl_appts.get_item(Key={"patientId": patient_id, "appointmentId": appointment_id})
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Booking not found")
        return item
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.exception("DynamoDB get_item failed")
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")

def _parse_appointment_details(it: Dict[str, Any]) -> Dict[str, Any]:
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

def _normalize_diagnostics_booking(it: Dict[str, Any]) -> Optional[BookingSummary]:
    record_type = (it.get("recordType") or "").lower()
    if record_type != "lab":
        return None
    collection = it.get("collection") or {}
    site_id = collection.get("siteId") or collection.get("site_id") or "main"
    if site_id != "diagnostics":
        return None

    tests = it.get("tests") or []
    diag_name = ""
    if tests:
        # for now, just use first test
        t0 = tests[0]
        diag_name = str(t0.get("name") or t0.get("id") or "Diagnostic Scan")

    details = _parse_appointment_details(it)
    date_iso = (
        it.get("dateISO")
        or details.get("dateISO")
        or collection.get("preferredDateISO")
        or ""
    )
    time_slot = (
        it.get("timeSlot")
        or details.get("timeSlot")
        or collection.get("preferredSlot")
        or "Walk-in"
    )

    pay = it.get("payment") or {}
    pstatus = str(pay.get("status") or "").upper()

    return BookingSummary(
        patientId=it.get("patientId", ""),
        appointmentId=it.get("appointmentId", ""),
        diagnosticType=diag_name,
        dateISO=date_iso,
        timeSlot=time_slot,
        status=str(it.get("status") or "BOOKED"),
        paymentStatus=pstatus or None,
        patientName=it.get("patientName") or "",
        createdAt=it.get("createdAt"),
    )


# ---------- Routes ----------

@router.get("/bookings", response_model=List[BookingSummary], dependencies=[Depends(_check_partner_key)])
def list_bookings(
    date: Optional[str] = Query(None, description="YYYY-MM-DD (optional; defaults to today)"),
    status: Optional[str] = Query(None, description="optional status filter"),
    includePast: bool = Query(False, description="if false, only today+future"),
):
    """
    List diagnostics bookings (backed by medmitra-appointments) where:
      - recordType = 'lab'
      - collection.siteId = 'diagnostics'
    NOTE: This uses a DynamoDB scan for now; in production you should add a GSI.
    """
    if not date:
        date = datetime.utcnow().date().isoformat()

    try:
        scan_kwargs: Dict[str, Any] = {
            "FilterExpression": Attr("recordType").eq("lab")
        }
        items: List[Dict[str, Any]] = []

        while True:
            resp = tbl_appts.scan(**scan_kwargs)
            items.extend(resp.get("Items", []))
            last = resp.get("LastEvaluatedKey")
            if not last:
                break
            scan_kwargs["ExclusiveStartKey"] = last

        summaries: List[BookingSummary] = []
        for it in items:
            col = it.get("collection") or {}
            site_id = col.get("siteId") or col.get("site_id") or "main"
            if site_id != "diagnostics":
                continue
            norm = _normalize_diagnostics_booking(it)
            if not norm:
                continue

            # date filter
            if norm.dateISO:
                if not includePast and norm.dateISO < date:
                    continue
                if date and norm.dateISO != date:
                    # if specific date is requested, skip mismatched
                    continue

            # status filter
            if status and norm.status.upper() != status.upper():
                continue

            summaries.append(norm)

        # sort by dateISO, timeSlot
        summaries.sort(key=lambda b: (b.dateISO or "", b.timeSlot or ""))
        return summaries
    except ClientError as e:
        msg = e.response["Error"].get("Message", str(e))
        log.exception("DynamoDB scan failed in diagnostics bookings")
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {msg}")
    except Exception as e:
        log.exception("Unexpected error in diagnostics bookings list")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/bookings/{patientId}/{appointmentId}",
    response_model=BookingDetail,
    dependencies=[Depends(_check_partner_key)],
)
def get_booking(patientId: str, appointmentId: str):
    """
    Get full details for a diagnostics booking.
    """
    it = _get_appointment(patientId, appointmentId)
    record_type = (it.get("recordType") or "").lower()
    if record_type != "lab":
        raise HTTPException(status_code=404, detail="Not a diagnostics booking")

    col = it.get("collection") or {}
    site_id = col.get("siteId") or col.get("site_id") or "main"
    if site_id != "diagnostics":
        raise HTTPException(status_code=404, detail="Not a diagnostics booking")

    tests = it.get("tests") or []
    details = _parse_appointment_details(it)

    diag_name = "Diagnostic Scan"
    if tests:
        t0 = tests[0]
        diag_name = str(t0.get("name") or t0.get("id") or "Diagnostic Scan")

    date_iso = (
        it.get("dateISO")
        or details.get("dateISO")
        or col.get("preferredDateISO")
        or ""
    )
    time_slot = (
        it.get("timeSlot")
        or details.get("timeSlot")
        or col.get("preferredSlot")
        or "Walk-in"
    )

    pay = it.get("payment") or {}
    pstatus = str(pay.get("status") or "").upper()
    contact = it.get("contact") or {}

    reports = []
    for r in (it.get("diagnosticReports") or []):
        if isinstance(r, dict):
            reports.append(r)

    return BookingDetail(
        patientId=it.get("patientId", ""),
        appointmentId=it.get("appointmentId", ""),
        diagnosticType=diag_name,
        tests=tests,
        dateISO=date_iso,
        timeSlot=time_slot,
        status=str(it.get("status") or "BOOKED"),
        paymentStatus=pstatus or None,
        patientName=it.get("patientName") or "",
        phone=contact.get("phone"),
        createdAt=it.get("createdAt"),
        reports=reports,
    )


@router.post(
    "/bookings/{patientId}/{appointmentId}/status",
    dependencies=[Depends(_check_partner_key)],
)
def update_status(patientId: str, appointmentId: str, body: StatusUpdateRequest = Body(...)):
    """
    Update high-level status of the diagnostics booking, e.g.:
      SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
    Stores into `status` and a nested map `diagnosticStatus`.
    """
    it = _get_appointment(patientId, appointmentId)
    record_type = (it.get("recordType") or "").lower()
    if record_type != "lab":
        raise HTTPException(status_code=400, detail="Not a diagnostics booking")

    new_status = body.status.strip()
    try:
        resp = tbl_appts.update_item(
            Key={"patientId": patientId, "appointmentId": appointmentId},
            UpdateExpression="SET #s = :s, diagnosticStatus = :ds, updatedAt = :u",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": new_status,
                ":ds": {
                    "status": new_status,
                    "updatedAt": _now_iso(),
                },
                ":u": _now_iso(),
            },
            ConditionExpression="attribute_exists(patientId) AND attribute_exists(appointmentId)",
            ReturnValues="ALL_NEW",
        )
        return {"ok": True, "appointment": resp["Attributes"]}
    except ClientError as e:
        code = e.response["Error"].get("Code")
        msg = e.response["Error"].get("Message", str(e))
        if code == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Appointment not found")
        log.exception("Diagnostics status update failed")
        raise HTTPException(status_code=500, detail=msg)


@router.post(
    "/reports/presign",
    response_model=ReportPresignResponse,
    dependencies=[Depends(_check_partner_key)],
)
def presign_report_upload(body: ReportPresignRequest):
    """
    Generate a presigned URL for uploading a PDF report for a diagnostics booking.
    Upload is direct PUT to S3.
    """
    if not S3_BUCKET or not s3:
        raise HTTPException(status_code=500, detail="S3 not configured")

    report_id = f"diag-{body.appointmentId}-{int(datetime.utcnow().timestamp())}"
    key = f"diagnostics/{body.patientId}/{body.appointmentId}/{report_id}/{body.filename}"

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": key,
                "ContentType": body.contentType,
            },
            ExpiresIn=600,
        )
    except ClientError as e:
        log.exception("S3 presign failed")
        raise HTTPException(status_code=500, detail=e.response["Error"].get("Message", str(e)))

    return ReportPresignResponse(uploadUrl=url, s3Key=key, reportId=report_id)


@router.post(
    "/reports/register",
    dependencies=[Depends(_check_partner_key)],
)
def register_report(body: ReportRegisterRequest):
    """
    Attach a report record to the diagnostics booking after a successful upload.
    Stored under `diagnosticReports` array on the appointment row.
    """
    it = _get_appointment(body.patientId, body.appointmentId)
    record_type = (it.get("recordType") or "").lower()
    if record_type != "lab":
        raise HTTPException(status_code=400, detail="Not a diagnostics booking")

    reports = it.get("diagnosticReports") or []
    if not isinstance(reports, list):
        reports = []

    reports.append(
        {
            "reportId": body.reportId,
            "name": body.name,
            "s3Key": body.s3Key,
            "contentType": body.contentType,
            "uploadedAt": _now_iso(),
        }
    )

    try:
        resp = tbl_appts.update_item(
            Key={"patientId": body.patientId, "appointmentId": body.appointmentId},
            UpdateExpression="SET diagnosticReports = :r, updatedAt = :u",
            ExpressionAttributeValues={
                ":r": reports,
                ":u": _now_iso(),
            },
            ConditionExpression="attribute_exists(patientId) AND attribute_exists(appointmentId)",
            ReturnValues="ALL_NEW",
        )
        return {"ok": True, "appointment": resp["Attributes"]}
    except ClientError as e:
        code = e.response["Error"].get("Code")
        msg = e.response["Error"].get("Message", str(e))
        if code == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Appointment not found")
        log.exception("Diagnostics report register failed")
        raise HTTPException(status_code=500, detail=msg)
