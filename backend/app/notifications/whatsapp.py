import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict

from twilio.rest import Client
from zoneinfo import ZoneInfo

log = logging.getLogger("whatsapp")

# ----------------------------
# Twilio / WhatsApp setup
# ----------------------------

# Account SID / token – support both generic and *_WHATSAPP variants
TWILIO_ACCOUNT_SID = (
    os.getenv("TWILIO_ACCOUNT_SID_WHATSAPP")
    or os.getenv("TWILIO_ACCOUNT_SID")
    or ""
)
TWILIO_AUTH_TOKEN = (
    os.getenv("TWILIO_AUTH_TOKEN_WHATSAPP")
    or os.getenv("TWILIO_AUTH_TOKEN")
    or ""
)

# FROM number – support both TWILIO_WHATSAPP_FROM and TWILIO_FROM_PHONE_NUMBER_WHATSAPP
_raw_from = (
    os.getenv("TWILIO_WHATSAPP_FROM")
    or os.getenv("TWILIO_FROM_PHONE_NUMBER_WHATSAPP")
    or ""
).strip()

# Normalize FROM to "whatsapp:+<digits>" if needed
if _raw_from and not _raw_from.startswith("whatsapp:"):
    # Allow passing "+91..." or "91..." or "whatsapp:+91..."
    digits = "".join(ch for ch in _raw_from if ch.isdigit() or ch == "+")
    if not digits:
        TWILIO_FROM_WHATSAPP = ""
    else:
        if not digits.startswith("+"):
            digits = "+" + digits
        TWILIO_FROM_WHATSAPP = f"whatsapp:{digits}"
else:
    TWILIO_FROM_WHATSAPP = _raw_from

WHATSAPP_ENABLED = bool(
    TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_WHATSAPP
)

_client: Optional[Client] = None
if WHATSAPP_ENABLED:
    try:
        _client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        log.info(
            "WhatsApp notifications enabled (Twilio). FROM=%s",
            TWILIO_FROM_WHATSAPP,
        )
    except Exception as e:
        log.warning("Failed to init Twilio client for WhatsApp: %s", e)
        _client = None
        WHATSAPP_ENABLED = False
else:
    log.info(
        "WhatsApp disabled: missing SID/TOKEN/FROM "
        "(SID set=%s, TOKEN set=%s, FROM=%r)",
        bool(TWILIO_ACCOUNT_SID),
        bool(TWILIO_AUTH_TOKEN),
        TWILIO_FROM_WHATSAPP,
    )

# Clinic TZ for formatting
CLINIC_TZ_NAME = os.getenv("CLINIC_TIME_ZONE", "Asia/Kolkata")
CLINIC_TZ = ZoneInfo(CLINIC_TZ_NAME)

# Template / Content SIDs (set in env)
# If you only have TWILIO_CONTENT_SID_WHATSAPP configured (as in your other service),
# we'll use that as a fallback for appointment confirmations.
DEFAULT_CONTENT_SID = os.getenv("TWILIO_CONTENT_SID_WHATSAPP", "")

TPL_APPOINTMENT_CONFIRMATION = os.getenv(
    "WA_TEMPLATE_APPOINTMENT_CONFIRMATION_SID", DEFAULT_CONTENT_SID
)
TPL_APPOINTMENT_CHECKIN = os.getenv(
    "WA_TEMPLATE_APPOINTMENT_CHECKIN_SID", ""
)
TPL_LAB_BOOKING_CONFIRMATION = os.getenv(
    "WA_TEMPLATE_LAB_BOOKING_CONFIRMATION_SID", ""
)
TPL_APPOINTMENT_REMINDER_2H = os.getenv(
    "WA_TEMPLATE_APPOINTMENT_REMINDER_2H_SID", ""
)
TPL_CONSECUTIVE_APPT_WARNING = os.getenv(
    "WA_TEMPLATE_CONSECUTIVE_APPOINTMENT_WARNING_SID", ""
)


def _format_whatsapp_to(e164: str) -> Optional[str]:
    """
    Convert "+91XXXXXXXXXX" or "91XXXXXXXXXX" into "whatsapp:+91XXXXXXXXXX".
    If it's already "whatsapp:+..." we keep it.
    """
    if not e164:
        return None
    val = e164.strip()
    if not val:
        return None
    if val.startswith("whatsapp:"):
        return val
    if not val.startswith("+"):
        digits = "".join(ch for ch in val if ch.isdigit())
        if not digits:
            return None
        val = "+" + digits
    return f"whatsapp:{val}"


def _send_whatsapp_text(to_phone_e164: str, body: str) -> bool:
    """
    Fallback freeform text send (only valid within 24h session window).
    """
    if not WHATSAPP_ENABLED or not _client:
        log.info("WhatsApp disabled; skipping send to %s", to_phone_e164)
        return False

    to = _format_whatsapp_to(to_phone_e164)
    if not to:
        log.warning("Invalid phone for WhatsApp: %r", to_phone_e164)
        return False

    try:
        msg = _client.messages.create(
            body=body,
            from_=TWILIO_FROM_WHATSAPP,
            to=to,
        )
        log.info(
            "WhatsApp (freeform) sent to %s sid=%s status=%s",
            to,
            msg.sid,
            getattr(msg, "status", ""),
        )
        return True
    except Exception as e:
        log.exception("Failed to send WhatsApp to %s", to)
        return False


def _send_whatsapp_template(
    to_phone_e164: str,
    template_sid: str,
    variables: Dict[str, str],
) -> bool:
    """
    Send a WhatsApp template (via Twilio Content / template SID).
    variables should be a dict of { '1': 'value1', '2': 'value2', ... }.
    """
    if not WHATSAPP_ENABLED or not _client:
        return False
    if not template_sid:
        # no template configured, fall back to freeform caller
        return False

    to = _format_whatsapp_to(to_phone_e164)
    if not to:
        log.warning("Invalid phone for WhatsApp: %r", to_phone_e164)
        return False

    try:
        msg = _client.messages.create(
            from_=TWILIO_FROM_WHATSAPP,
            to=to,
            content_sid=template_sid,
            content_variables=json.dumps(variables),
        )
        log.info(
            "WhatsApp (template %s) sent to %s sid=%s status=%s",
            template_sid,
            to,
            msg.sid,
            getattr(msg, "status", ""),
        )
        return True
    except Exception as e:
        log.exception("Failed to send WhatsApp template %s to %s", template_sid, to)
        return False


# -------------------------------------------------------------------
# Formatting helpers
# -------------------------------------------------------------------

def _fmt_date(dt: datetime) -> str:
    return dt.strftime("%A, %d %b %Y")


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M")


# -------------------------------------------------------------------
# High-level helpers used by the rest of the app
# -------------------------------------------------------------------

def send_doctor_booking_confirmation(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    doctor_name: str,
    clinic_name: str,
) -> bool:
    """Sent right after a doctor appointment is booked."""
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    clinic_name = clinic_name or "our clinic"
    doctor_name = doctor_name or "Doctor"

    vars_tpl = {
        "1": patient_name,
        "2": _fmt_date(when_local),
        "3": _fmt_time(when_local),
        "4": doctor_name,
        "5": clinic_name,
    }

    # Try template first, then freeform fallback
    if _send_whatsapp_template(phone_e164, TPL_APPOINTMENT_CONFIRMATION, vars_tpl):
        return True

    body = (
        f"Hello {patient_name}, your appointment has been booked.\n\n"
        f"📅 Date: {_fmt_date(when_local)}\n"
        f"⏰ Time: {_fmt_time(when_local)}\n"
        f"👨‍⚕️ Doctor: {doctor_name}\n"
        f"🏥 Clinic: {clinic_name}\n\n"
        f"Please arrive 10–15 minutes early for your visit."
    )
    return _send_whatsapp_text(phone_e164, body)


def send_doctor_checkin_confirmation(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    doctor_name: str,
    clinic_name: str,
    token_no: Optional[str] = None,
) -> bool:
    """Sent after kiosk check-in / token issue."""
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    clinic_name = clinic_name or "our clinic"
    doctor_name = doctor_name or "Doctor"
    token_str = token_no or ""

    vars_tpl = {
        "1": patient_name,
        "2": _fmt_date(when_local),
        "3": _fmt_time(when_local),
        "4": doctor_name,
        "5": clinic_name,
        "6": token_str,
    }

    if _send_whatsapp_template(phone_e164, TPL_APPOINTMENT_CHECKIN, vars_tpl):
        return True

    token_line = f"\n🎟 Token: {token_str}" if token_str else ""
    body = (
        f"Hi {patient_name}, you are checked in at {clinic_name}.\n\n"
        f"📅 Date: {_fmt_date(when_local)}\n"
        f"⏰ Time: {_fmt_time(when_local)}\n"
        f"👨‍⚕️ Doctor: {doctor_name}"
        f"{token_line}\n\n"
        f"We’ll call you when it’s your turn."
    )
    return _send_whatsapp_text(phone_e164, body)


def send_doctor_reminder_2h(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    doctor_name: str,
    clinic_name: str,
) -> bool:
    """Reminder ~2h before a doctor appointment."""
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    clinic_name = clinic_name or "our clinic"
    doctor_name = doctor_name or "Doctor"

    vars_tpl = {
        "1": patient_name,
        "2": _fmt_date(when_local),
        "3": _fmt_time(when_local),
        "4": doctor_name,
        "5": clinic_name,
    }

    if _send_whatsapp_template(phone_e164, TPL_APPOINTMENT_REMINDER_2H, vars_tpl):
        return True

    body = (
        f"Reminder: you have a doctor appointment in about 2 hours.\n\n"
        f"📅 {_fmt_date(when_local)}\n"
        f"⏰ {_fmt_time(when_local)}\n"
        f"👨‍⚕️ Doctor: {doctor_name}\n"
        f"🏥 Clinic: {clinic_name}\n\n"
        f"Please arrive a little early. Reply here if you need to reschedule."
    )
    return _send_whatsapp_text(phone_e164, body)


def send_lab_booking_confirmation(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    site_id: str = "main",
) -> bool:
    """Lab / diagnostics booking confirmation from kiosk."""
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    is_diag = (site_id or "").lower() == "diagnostics"
    title = "diagnostics scan" if is_diag else "lab test(s)"
    location = "Diagnostics Centre" if is_diag else "Lab"

    vars_tpl = {
        "1": patient_name,
        "2": _fmt_date(when_local),
        "3": _fmt_time(when_local),
        "4": location,
        "5": title,
    }

    if _send_whatsapp_template(phone_e164, TPL_LAB_BOOKING_CONFIRMATION, vars_tpl):
        return True

    body = (
        f"Hello {patient_name}, your {title} booking has been created.\n\n"
        f"📅 Date: {_fmt_date(when_local)}\n"
        f"⏰ Time: {_fmt_time(when_local)}\n"
        f"📍 Location: {location}\n\n"
        f"Please bring your prescription and arrive 10–15 minutes early."
    )
    return _send_whatsapp_text(phone_e164, body)


def send_lab_reminder_2h(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    site_id: str = "main",
) -> bool:
    """Reminder ~2h before lab / diagnostics."""
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    is_diag = (site_id or "").lower() == "diagnostics"
    title = "your scan" if is_diag else "your lab tests"
    location = "Diagnostics Centre" if is_diag else "Lab"

    # You can reuse appointment_reminder_2h or create a dedicated lab reminder template.
    vars_tpl = {
        "1": patient_name,
        "2": _fmt_date(when_local),
        "3": _fmt_time(when_local),
        "4": title,
        "5": location,
    }

    if _send_whatsapp_template(phone_e164, TPL_APPOINTMENT_REMINDER_2H, vars_tpl):
        return True

    body = (
        f"Reminder: {title} are scheduled in about 2 hours.\n\n"
        f"📅 {_fmt_date(when_local)}\n"
        f"⏰ {_fmt_time(when_local)}\n"
        f"📍 Location: {location}\n\n"
        f"Please be on time and follow any fasting instructions given."
    )
    return _send_whatsapp_text(phone_e164, body)

def send_consecutive_appointment_warning(
    phone_e164: str,
    patient_name: str,
    date_iso: str,
    existing_time: str,
    new_time: str,
    doctor_name: str,
    clinic_name: str,
) -> bool:
    """
    Warn patient that they already have an appointment on this date
    and just booked another one (same day).
    """
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    doctor_name = doctor_name or "Doctor"
    clinic_name = clinic_name or "our clinic"

    # pretty date string if possible
    try:
        y, m, d = [int(x) for x in str(date_iso).split("-", 2)]
        dt = datetime(y, m, d, tzinfo=CLINIC_TZ)
        date_str = _fmt_date(dt)
    except Exception:
        date_str = date_iso

    vars_tpl = {
        "1": patient_name,
        "2": date_str,
        "3": existing_time,
        "4": doctor_name,
        "5": clinic_name,
        "6": new_time,
    }

    if _send_whatsapp_template(phone_e164, TPL_CONSECUTIVE_APPT_WARNING, vars_tpl):
        return True

    body = (
        f"Hello {patient_name}, you already have an appointment on {date_str} at {existing_time} "
        f"with {doctor_name} at {clinic_name}. "
        f"You just booked another appointment at {new_time}.\n\n"
        f"If this was intentional, no action is needed. "
        f"If it was a mistake, please visit the kiosk or front desk to cancel the extra booking."
    )
    return _send_whatsapp_text(phone_e164, body)


# -------------------------------------------------------------------
# Backwards-compatible shims used by app.notifications.router
# -------------------------------------------------------------------

def send_appointment_reminder(*args, **kwargs) -> bool:
    """
    Generic reminder shim; delegates to doctor or lab 2h reminder.
    """
    if not WHATSAPP_ENABLED or not _client:
        return False

    phone = (
        kwargs.get("to_phone")
        or kwargs.get("phone")
        or kwargs.get("phone_e164")
        or (args[0] if args else "")
    )

    patient_name = kwargs.get("patient_name") or kwargs.get("name") or "Patient"
    doctor_name = kwargs.get("doctor_name") or kwargs.get("doctor") or ""
    clinic_name = kwargs.get("clinic_name") or kwargs.get("clinic") or "Clinic"
    appointment_type = (kwargs.get("appointment_type") or "doctor").lower()
    site_id = kwargs.get("site_id") or kwargs.get("collection_type") or "main"

    date_iso = (
        kwargs.get("appointment_date")
        or kwargs.get("date_iso")
        or kwargs.get("date")
        or ""
    )
    time_slot = (
        kwargs.get("appointment_time")
        or kwargs.get("time_slot")
        or kwargs.get("time")
        or ""
    )

    try:
        if date_iso and time_slot:
            y, m, d = [int(x) for x in str(date_iso).split("-", 2)]
            hh, mm = [int(x) for x in str(time_slot).split(":", 1)]
            when_local = datetime(y, m, d, hh, mm, tzinfo=CLINIC_TZ)
        else:
            when_local = datetime.now(CLINIC_TZ)
    except Exception:
        when_local = datetime.now(CLINIC_TZ)

    if appointment_type == "lab":
        return send_lab_reminder_2h(
            phone_e164=phone,
            patient_name=patient_name,
            when_local=when_local,
            site_id=site_id,
        )
    else:
        return send_doctor_reminder_2h(
            phone_e164=phone,
            patient_name=patient_name,
            when_local=when_local,
            doctor_name=doctor_name,
            clinic_name=clinic_name,
        )


def send_lab_reminder(*args, **kwargs) -> bool:
    kwargs = dict(kwargs)
    kwargs.setdefault("appointment_type", "lab")
    return send_appointment_reminder(*args, **kwargs)


def send_checkin_confirmation(*args, **kwargs) -> bool:
    """
    Shim for code that imports send_checkin_confirmation; delegates to
    send_doctor_checkin_confirmation.
    """
    if not WHATSAPP_ENABLED or not _client:
        return False

    phone = (
        kwargs.get("phone")
        or kwargs.get("phone_e164")
        or kwargs.get("to_phone")
        or (args[0] if args else "")
    )

    patient_name = kwargs.get("patient_name") or kwargs.get("name") or "Patient"
    doctor_name = kwargs.get("doctor_name") or kwargs.get("doctor") or "Doctor"
    clinic_name = kwargs.get("clinic_name") or kwargs.get("clinic") or "Clinic"
    token_no = kwargs.get("token_no") or kwargs.get("token") or None

    when_local = kwargs.get("when_local")
    if not isinstance(when_local, datetime):
        date_iso = (
            kwargs.get("appointment_date")
            or kwargs.get("date_iso")
            or kwargs.get("date")
            or ""
        )
        time_slot = (
            kwargs.get("appointment_time")
            or kwargs.get("time_slot")
            or kwargs.get("time")
            or ""
        )
        try:
            if date_iso and time_slot:
                y, m, d = [int(x) for x in str(date_iso).split("-", 2)]
                hh, mm = [int(x) for x in str(time_slot).split(":", 1)]
                when_local = datetime(y, m, d, hh, mm, tzinfo=CLINIC_TZ)
            else:
                when_local = datetime.now(CLINIC_TZ)
        except Exception:
            when_local = datetime.now(CLINIC_TZ)

    return send_doctor_checkin_confirmation(
        phone_e164=phone,
        patient_name=patient_name,
        when_local=when_local,
        doctor_name=doctor_name,
        clinic_name=clinic_name,
        token_no=token_no,
    )
