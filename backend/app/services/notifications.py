from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings


@dataclass
class NotificationResult:
    email_sent: bool
    sms_sent: bool
    detail: str | None = None


def notify_status_change(
    *,
    to_email: str | None,
    to_phone: str | None,
    claim_id: str,
    new_status: str,
) -> NotificationResult:
    """
    Minimal notification hook.
    - If provider keys are missing, it becomes a safe no-op.
    - You can replace this with real SendGrid/Twilio integration later.
    """
    email_ok = bool(settings.sendgrid_api_key and settings.sendgrid_from_email and to_email)
    sms_ok = bool(settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number and to_phone)

    # Intentionally minimal: no external calls in this demo scaffold.
    # The goal is to keep code simple and avoid unexpected side effects.
    detail = f"email={'on' if email_ok else 'off'}, sms={'on' if sms_ok else 'off'}"
    return NotificationResult(email_sent=email_ok, sms_sent=sms_ok, detail=detail)

