# backend/app/util/datetime.py
from datetime import datetime, timezone
from typing import Optional
import pytz  # add to requirements.txt

def now_utc_iso() -> str:
    # No micros; stable ISO for logs/diffing
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def now_epoch_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)

def now_local_iso(tz_name: str) -> str:
    tz = pytz.timezone(tz_name)
    return tz.normalize(datetime.now(tz)).replace(microsecond=0).isoformat()

def combine_local_to_utc_iso(dateISO: str, timeHHmm: str, tz_name: str) -> str:
    """
    If you ever need an absolute moment for the appointment (rare),
    convert local YYYY-MM-DD + HH:mm -> UTC ISO.
    """
    tz = pytz.timezone(tz_name)
    y, m, d = map(int, dateISO.split("-"))
    hh, mm = map(int, timeHHmm.split(":"))
    local_dt = tz.localize(datetime(y, m, d, hh, mm, 0))
    return local_dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()
