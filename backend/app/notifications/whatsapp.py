# backend/app/notifications/whatsapp.py
import os
import logging
from datetime import datetime
from typing import Optional

from twilio.rest import Client
from zoneinfo import ZoneInfo

log = logging.getLogger("whatsapp")

# ----------------------------
# Twilio / WhatsApp setup
# ----------------------------

# Use same Twilio account as SMS; separate FROM for WhatsApp
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

# e.g. "whatsapp:+16206701378"
TWILIO_FROM_WHATSAPP = (os.getenv("TWILIO_WHATSAPP_FROM") or "").strip()

WHATSAPP_ENABLED = bool(
    TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_WHATSAPP
)

_client: Optional[Client] = None
if WHATSAPP_ENABLED:
    try:
        _client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        log.info("WhatsApp notifications enabled (Twilio)")
    except Exception as e:
        log.warning("Failed to init Twilio client for WhatsApp: %s", e)
        _client = None
        WHATSAPP_ENABLED = False
else:
    log.info("WhatsApp disabled: missing SID/TOKEN/FROM envs")

# Clinic local timezone (for message formatting)
CLINIC_TZ_NAME = os.getenv("CLINIC_TIME_ZONE", "Asia/Kolkata")
CLINIC_TZ = ZoneInfo(CLINIC_TZ_NAME)


def _format_whatsapp_to(e164: str) -> Optional[str]:
    """
    Convert +91XXXXXXXXXX → whatsapp:+91XXXXXXXXXX.
    If already has whatsapp: prefix, leave as is.
    """
    if not e164:
        return None
    val = e164.strip()
    if not val:
        return None
    if val.startswith("whatsapp:"):
        return val
    if not val.startswith("+"):
        # very small normalization: if looks like 91xxxxxxxxxx, add plus
        digits = "".join(ch for ch in val if ch.isdigit())
        if digits and not val.startswith("+"):
            val = "+" + digits
    return f"whatsapp:{val}"


def send_whatsapp_text(to_phone_e164: str, body: str) -> bool:
    """
    Low-level helper: send a plain-text WhatsApp message.
    Returns True on success, False on failure or if disabled.
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
            "WhatsApp message sent to %s sid=%s status=%s",
            to,
            msg.sid,
            getattr(msg, "status", ""),
        )
        return True
    except Exception as e:
        log.exception("Failed to send WhatsApp to %s", to)
        return False


# -------------------------------------------------------------------
# Higher-level helpers: booking confirmations & reminders
# -------------------------------------------------------------------

def _fmt_date(dt: datetime) -> str:
    # "Monday, 3 Mar 2025"
    return dt.strftime("%A, %d %b %Y")


def _fmt_time(dt: datetime) -> str:
    # "14:30" 24h
    return dt.strftime("%H:%M")


def send_doctor_booking_confirmation(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    doctor_name: str,
    clinic_name: str,
) -> bool:
    """
    WhatsApp confirmation right after a doctor appointment is booked from kiosk.
    """
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    clinic_name = clinic_name or "our clinic"

    body = (
        f"Hello {patient_name}, your appointment has been booked.\n\n"
        f"📅 Date: {_fmt_date(when_local)}\n"
        f"⏰ Time: {_fmt_time(when_local)}\n"
        f"👨‍⚕️ Doctor: {doctor_name or 'Doctor'}\n"
        f"🏥 Clinic: {clinic_name}\n\n"
        f"Please arrive 10–15 minutes early for your visit."
    )
    return send_whatsapp_text(phone_e164, body)


def send_doctor_checkin_confirmation(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    doctor_name: str,
    clinic_name: str,
    token_no: Optional[str] = None,
) -> bool:
    """
    WhatsApp confirmation AFTER kiosk check-in/token issue.
    """
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    clinic_name = clinic_name or "our clinic"

    token_line = f"\n🎟 Token: {token_no}" if token_no else ""
    body = (
        f"Hi {patient_name}, you are checked in at {clinic_name}.\n\n"
        f"📅 Date: {_fmt_date(when_local)}\n"
        f"⏰ Time: {_fmt_time(when_local)}\n"
        f"👨‍⚕️ Doctor: {doctor_name or 'Doctor'}"
        f"{token_line}\n\n"
        f"We’ll call you when it’s your turn."
    )
    return send_whatsapp_text(phone_e164, body)


def send_doctor_reminder_2h(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    doctor_name: str,
    clinic_name: str,
) -> bool:
    """
    Reminder ~2h before a doctor appointment.
    """
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    clinic_name = clinic_name or "our clinic"

    body = (
        f"Reminder: you have a doctor appointment in about 2 hours.\n\n"
        f"📅 {_fmt_date(when_local)}\n"
        f"⏰ {_fmt_time(when_local)}\n"
        f"👨‍⚕️ Doctor: {doctor_name or 'Doctor'}\n"
        f"🏥 Clinic: {clinic_name}\n\n"
        f"Please arrive a little early. Reply here if you need to reschedule."
    )
    return send_whatsapp_text(phone_e164, body)


def send_lab_booking_confirmation(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    site_id: str = "main",
) -> bool:
    """
    Lab / diagnostics booking confirmation from kiosk.
    site_id: 'main' | 'diagnostics' | etc.
    """
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"

    is_diag = (site_id or "").lower() == "diagnostics"
    if is_diag:
        title = "diagnostics scan"
    else:
        title = "lab test(s)"

    body = (
        f"Hello {patient_name}, your {title} booking has been created.\n\n"
        f"📅 Date: {_fmt_date(when_local)}\n"
        f"⏰ Time: {_fmt_time(when_local)}\n"
        f"📍 Location: {('Diagnostics Centre' if is_diag else 'Lab')}\n\n"
        f"Please bring your prescription and arrive 10–15 minutes early."
    )
    return send_whatsapp_text(phone_e164, body)


def send_lab_reminder_2h(
    phone_e164: str,
    patient_name: str,
    when_local: datetime,
    site_id: str = "main",
) -> bool:
    """
    Reminder ~2h before lab / diagnostics.
    """
    if not phone_e164:
        return False

    patient_name = patient_name or "Patient"
    is_diag = (site_id or "").lower() == "diagnostics"
    title = "your scan" if is_diag else "your lab tests"

    body = (
        f"Reminder: {title} are scheduled in about 2 hours.\n\n"
        f"📅 {_fmt_date(when_local)}\n"
        f"⏰ {_fmt_time(when_local)}\n"
        f"📍 Location: {('Diagnostics Centre' if is_diag else 'Lab')}\n\n"
        f"Please be on time and follow any fasting instructions given."
    )
    return send_whatsapp_text(phone_e164, body)


# -------------------------------------------------------------------
# Backwards-compatible shims used by app.notifications.router
# -------------------------------------------------------------------

def send_appointment_reminder(*args, **kwargs) -> bool:
    """
    Backwards-compatible shim for older codepaths that expect a generic
    'send_appointment_reminder' helper.

    We infer whether this is a doctor or lab/diagnostics reminder
    from the kwargs and then delegate to send_doctor_reminder_2h
    or send_lab_reminder_2h.

    Supports both positional (phone first) and keyword-based calls.
    """
    if not WHATSAPP_ENABLED or not _client:
        return False

    # Phone
    phone = (
        kwargs.get("to_phone")
        or kwargs.get("phone")
        or kwargs.get("phone_e164")
        or (args[0] if args else "")
    )

    # Names / types
    patient_name = kwargs.get("patient_name") or kwargs.get("name") or "Patient"
    doctor_name = kwargs.get("doctor_name") or kwargs.get("doctor") or ""
    clinic_name = kwargs.get("clinic_name") or kwargs.get("clinic") or "Clinic"
    appointment_type = (kwargs.get("appointment_type") or "doctor").lower()
    site_id = kwargs.get("site_id") or kwargs.get("collection_type") or "main"

    # Date/time
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

    # Try to build a local datetime; fall back to "now" if parsing fails
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
        # default: doctor
        return send_doctor_reminder_2h(
            phone_e164=phone,
            patient_name=patient_name,
            when_local=when_local,
            doctor_name=doctor_name,
            clinic_name=clinic_name,
        )


def send_lab_reminder(*args, **kwargs) -> bool:
    """
    Backwards-compatible helper for code that imports send_lab_reminder
    directly (e.g. app.notifications.router). It simply forces the
    appointment_type='lab' and delegates to send_appointment_reminder.
    """
    kwargs = dict(kwargs)
    kwargs.setdefault("appointment_type", "lab")
    return send_appointment_reminder(*args, **kwargs)

def send_checkin_confirmation(*args, **kwargs) -> bool:
    """
    Backwards-compatible helper for code that imports send_checkin_confirmation
    (e.g. app.notifications.router). It delegates to send_doctor_checkin_confirmation.

    Expected kwargs (but we try to be forgiving):
      - phone / phone_e164 / to_phone
      - patient_name / name
      - doctor_name / doctor
      - clinic_name / clinic
      - when_local (datetime) OR appointment_date + appointment_time
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
        # try to build from date/time pieces
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

