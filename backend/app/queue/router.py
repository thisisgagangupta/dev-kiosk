import os, uuid, logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import json

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field, constr

from app.db.dynamo import appointments_table
from app.util.datetime import now_utc_iso
from zoneinfo import ZoneInfo
from app.notifications.whatsapp import send_doctor_checkin_confirmation

log = logging.getLogger("queue")
router = APIRouter(tags=["queue"])

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
TOKENS_TABLE_NAME   = os.getenv("DDB_TABLE_TOKENS",   "medmitra_tokens")
COUNTERS_TABLE_NAME = os.getenv("DDB_TABLE_COUNTERS", "medmitra_counters")

AVG_CONSULT_MIN = int(os.getenv("CONSULT_AVG_MIN", "10"))   # simple ETA model
LANES = (os.getenv("QUEUE_LANES", "A").split(","))          # default single lane "A"

DYNAMODB_ENDPOINT = (os.getenv("DYNAMODB_LOCAL_URL") or "").strip() or None

def _ddb():
    kw = {"region_name": AWS_REGION}
    if DYNAMODB_ENDPOINT:
        kw["endpoint_url"] = DYNAMODB_ENDPOINT
    ddb = boto3.resource("dynamodb", **kw)
    return ddb

ddb = _ddb()
tbl_tokens   = ddb.Table(TOKENS_TABLE_NAME)
tbl_counters = ddb.Table(COUNTERS_TABLE_NAME)

# --------------------- helpers ---------------------

def _today_local(date_iso: Optional[str]) -> str:
    # date is in appointment_details.dateISO (local clinic date)
    return (date_iso or datetime.now().date().isoformat())

def _lane_for_doctor(doctor_id: Optional[str]) -> str:
    if not LANES:
        return "A"
    if not doctor_id:
        return LANES[0]
    # stable-ish distribution if you add lanes later
    try:
        idx = abs(hash(str(doctor_id))) % len(LANES)
        return LANES[idx]
    except Exception:
        return LANES[0]

def _next_seq_for(day: str, lane: str) -> int:
    counter_id = f"dayLane:{day}#{lane}"
    try:
        resp = tbl_counters.update_item(
            Key={"counterId": counter_id},
            UpdateExpression="ADD seq :one",
            ExpressionAttributeValues={":one": 1},
            ReturnValues="UPDATED_NEW",
        )
        return int(resp["Attributes"]["seq"])
    except ClientError as e:
        # first time → upsert with seq=1
        if e.response["Error"]["Code"] == "ValidationException":
            tbl_counters.put_item(Item={"counterId": counter_id, "seq": 1})
            return 1
        raise

def _count_ahead(day: str, lane: str, my_seq: int) -> int:
    resp = tbl_tokens.query(
        IndexName="GSI2",
        KeyConditionExpression=Key("GSI2PK").eq(f"{day}#{lane}") & Key("GSI2SK").between(0, my_seq-1),
        FilterExpression=Attr("status").is_in(["waiting","called","roomed"])
    )
    return len(resp.get("Items", []))

def _estimate_eta(num_ahead: int) -> Dict[str, Any]:
    # simplest: linear on number ahead; widen range by +/- 20%
    low = max(1, int(num_ahead * AVG_CONSULT_MIN))
    high = max(low+1, int((num_ahead + 1) * AVG_CONSULT_MIN * 1.2))
    conf = 70 if num_ahead < 3 else 60  # toy confidence
    return {"etaLow": low, "etaHigh": high, "confidence": conf}

def _get_appointment_details(appt: Dict[str, Any]) -> Dict[str, Any]:
    """
    Safely parse appointment_details from an appointment item. Supports both dict and JSON string.
    """
    raw = appt.get("appointment_details")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}

# --------------------- schemas ---------------------

class IssueTokenReq(BaseModel):
    patientId: constr(min_length=6)
    appointmentId: constr(min_length=6)

class IssueTokenResp(BaseModel):
    tokenNo: str
    lane: str
    position: int
    etaLow: int
    etaHigh: int
    confidence: int
    appointmentId: str
    patientId: str
    status: str = "waiting"

# --------------------- routes ----------------------

@router.post("/kiosk/checkin/issue", response_model=IssueTokenResp)
def issue_token(body: IssueTokenReq = Body(...)):
    """Create a token (idempotent per appointment). Works for any appointment in the shared table."""
    # 0) Find appointment
    appt_tbl = appointments_table()
    appt_resp = appt_tbl.get_item(Key={"patientId": body.patientId, "appointmentId": body.appointmentId})
    appt = appt_resp.get("Item")
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    # 1) If token already exists for this appointment → return it
    existing = tbl_tokens.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(body.appointmentId),
        Limit=1, ScanIndexForward=False
    ).get("Items", [])
    if existing:
        t = existing[0]
        pos = _count_ahead(t["date"], t["lane"], int(t["seq"]))
        eta = _estimate_eta(pos)
        return IssueTokenResp(
            tokenNo=t["tokenNo"],
            lane=t["lane"],
            position=pos,
            etaLow=eta["etaLow"],
            etaHigh=eta["etaHigh"],
            confidence=eta["confidence"],
            appointmentId=body.appointmentId,
            patientId=body.patientId,
            status=t.get("status", "waiting"),
        )

    # 2) Compute day & lane + timeSlot (robust to string or map appointment_details)
    details = _get_appointment_details(appt)
    date_iso = _today_local(appt.get("dateISO") or details.get("dateISO"))
    doctor_id = appt.get("doctorId") or details.get("doctorId")
    # NEW: extract time slot once and reuse (doctor and lab flows)
    collection = appt.get("collection") or {}
    time_slot = (
        appt.get("timeSlot")
        or details.get("timeSlot")
        or collection.get("preferredSlot")
        or ""
    )
    lane = _lane_for_doctor(doctor_id)

    # 3) Allocate next sequence (atomic)
    seq = _next_seq_for(date_iso, lane)
    token_no = f"{lane}{seq}"

    # 4) Count ahead and ETA
    ahead = _count_ahead(date_iso, lane, seq)
    eta = _estimate_eta(ahead)

    # 5) Persist token (NEW: include timeSlot)
    item = {
        "tokenId": str(uuid.uuid4()),
        "tokenNo": token_no,
        "patientId": body.patientId,
        "appointmentId": body.appointmentId,
        "doctorId": str(doctor_id or ""),
        "date": date_iso,
        "lane": lane,
        "seq": int(seq),
        "status": "waiting",
        "issuedAt": now_utc_iso(),
        "etaLow": eta["etaLow"],
        "etaHigh": eta["etaHigh"],
        "timeSlot": str(time_slot or ""),  # <── NEW
        "GSI1PK": body.appointmentId,
        "GSI1SK": now_utc_iso(),
        "GSI2PK": f"{date_iso}#{lane}",
        "GSI2SK": int(seq),
        "GSI3PK": token_no,
        "GSI3SK": now_utc_iso(),
    }
    tbl_tokens.put_item(Item=item)

    # --- WhatsApp check-in confirmation (doctor only for now) ---
    try:
        record_type = (appt.get("recordType") or "").lower()

        # contact & phone
        contact = appt.get("contact") or {}
        phone = (contact.get("phone") or contact.get("phoneNumber") or "").strip()
        if phone:
            tz = ZoneInfo(os.getenv("CLINIC_TIME_ZONE", "Asia/Kolkata"))

            # Extract date/time similar to reminder lambda
            details_local = details
            collection = appt.get("collection") or {}
            date_iso_full = (
                appt.get("dateISO")
                or details_local.get("dateISO")
                or collection.get("preferredDateISO")
                or ""
            )
            time_slot_local = (
                appt.get("timeSlot")
                or details_local.get("timeSlot")
                or collection.get("preferredSlot")
                or ""
            )

            if date_iso_full and time_slot_local and record_type == "doctor":
                y, m, d = [int(x) for x in date_iso_full.split("-", 2)]
                hh, mm = [int(x) for x in time_slot_local.split(":", 1)]
                when_local = datetime(y, m, d, hh, mm, tzinfo=tz)
                doctor_name = (
                    details_local.get("doctorName")
                    or appt.get("doctorName")
                    or "Doctor"
                )
                clinic_name = (
                    details_local.get("clinicName")
                    or appt.get("clinicName")
                    or "Clinic"
                )
                send_doctor_checkin_confirmation(
                    phone_e164=phone,
                    patient_name=contact.get("name") or "",
                    when_local=when_local,
                    doctor_name=doctor_name,
                    clinic_name=clinic_name,
                    token_no=token_no,
                )
            # If you also want a different wording for lab check in, you can
            # add an elif record_type == "lab": branch here and call a lab-specific helper.
    except Exception:
        log.warning("Failed to send WhatsApp check-in confirmation", exc_info=True)

    return IssueTokenResp(
        tokenNo=token_no,
        lane=lane,
        position=ahead,
        etaLow=eta["etaLow"],
        etaHigh=eta["etaHigh"],
        confidence=eta["confidence"],
        appointmentId=body.appointmentId,
        patientId=body.patientId,
        status="waiting",
    )


class StatusResp(BaseModel):
    tokenNo: str
    position: int
    etaLow: int
    etaHigh: int
    confidence: int
    status: str

@router.get("/queue/status", response_model=StatusResp)
def queue_status(tokenNo: str = Query(..., min_length=2)):
    res = tbl_tokens.query(
        IndexName="GSI3",
        KeyConditionExpression=Key("GSI3PK").eq(tokenNo),
        Limit=1,
        ScanIndexForward=False,
    )
    items = res.get("Items", [])
    if not items:
        raise HTTPException(status_code=404, detail="Token not found")
    t = items[0]
    pos = _count_ahead(t["date"], t["lane"], int(t["seq"]))
    eta = _estimate_eta(pos)
    return StatusResp(
        tokenNo=tokenNo,
        position=pos,
        etaLow=eta["etaLow"],
        etaHigh=eta["etaHigh"],
        confidence=eta["confidence"],
        status=t.get("status", "waiting"),
    )

class NowNextLane(BaseModel):
    lane: str
    now: List[str] = []
    next: List[str] = []
    avg_wait: int
    tokenTimes: Dict[str, str] = {}  # NEW

@router.get("/wallboard/now-next")
def wallboard_now_next(date: Optional[str] = Query(None), lane: Optional[str] = Query(None)):
    day = date or datetime.now().date().isoformat()
    lanes = [lane] if lane else LANES
    out: List[Dict[str, Any]] = []
    for ln in lanes:
        q = tbl_tokens.query(
            IndexName="GSI2",
            KeyConditionExpression=Key("GSI2PK").eq(f"{day}#{ln}"),
            FilterExpression=Attr("status").is_in(["waiting","called","roomed"]),
            Limit=20,
        )
        arr = sorted(q.get("Items", []), key=lambda x: int(x.get("seq", 0)))
        waiting = [i["tokenNo"] for i in arr if i.get("status") == "waiting"]

        # NEW: build token → timeSlot map (for waiting tokens only)
        token_times: Dict[str, str] = {}
        for i in arr:
            if i.get("status") == "waiting":
                tno = i.get("tokenNo")
                ts = (i.get("timeSlot") or "").strip()
                if tno and ts:
                    token_times[tno] = ts

        out.append(
            {
                "lane": ln,
                "now": waiting[:1],
                "next": waiting[1:6],
                "avg_wait": AVG_CONSULT_MIN,
                "tokenTimes": token_times,  # NEW
            }
        )
    return {"items": out}
