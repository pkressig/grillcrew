"""Confirmation email for an immediately reserved public signup."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import Settings
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.factory import build_email_sender

logger = logging.getLogger(__name__)
SUBJECT = "Deine GrillCrew-Eintragung ist bestätigt"


def dispatch_signup_confirmation_email(
    settings: Settings,
    *,
    recipient: str,
    signup_id: uuid.UUID,
    organization_name: str,
    organization_slug: str,
    event_title: str,
    event_type: str,
    shift_starts_at: datetime,
    shift_ends_at: datetime,
    organization_timezone: str,
    volunteer_public_name: str,
    management_token: str,
) -> None:
    """Build and send the email without allowing delivery errors to escape."""
    try:
        sender = build_email_sender(settings)
    except ValueError:
        logger.error(
            "signup confirmation email sender unavailable to=%s signup_id=%s",
            recipient,
            signup_id,
        )
        return
    send_signup_confirmation_email(
        sender,
        settings=settings,
        recipient=recipient,
        signup_id=signup_id,
        organization_name=organization_name,
        organization_slug=organization_slug,
        event_title=event_title,
        event_type=event_type,
        shift_starts_at=shift_starts_at,
        shift_ends_at=shift_ends_at,
        organization_timezone=organization_timezone,
        volunteer_public_name=volunteer_public_name,
        management_token=management_token,
    )


def send_signup_confirmation_email(
    sender: EmailSender,
    *,
    settings: Settings,
    recipient: str,
    signup_id: uuid.UUID,
    organization_name: str,
    organization_slug: str,
    event_title: str,
    event_type: str,
    shift_starts_at: datetime,
    shift_ends_at: datetime,
    organization_timezone: str,
    volunteer_public_name: str,
    management_token: str,
) -> None:
    timezone = ZoneInfo(organization_timezone)
    local_start = shift_starts_at.astimezone(timezone)
    local_end = shift_ends_at.astimezone(timezone)
    frontend_url = settings.frontend_public_url.rstrip("/")
    public_plan_url = f"{frontend_url}/{organization_slug}"
    management_url = f"{public_plan_url}/manage-signup/{management_token}"
    event_label = event_title
    if event_type and event_type != event_title:
        event_label = f"{event_title} ({event_type})"
    message = EmailMessage(
        to=recipient,
        subject=SUBJECT,
        body_text=(
            f"Hallo {volunteer_public_name}\n\n"
            f"Deine Eintragung bei {organization_name} ist bestätigt. "
            "Dein Platz ist reserviert.\n\n"
            f"Einsatz: {event_label}\n"
            f"Datum: {local_start:%d.%m.%Y}\n"
            f"Zeit: {local_start:%H:%M}-{local_end:%H:%M} Uhr\n\n"
            f"Öffentlicher Einsatzplan: {public_plan_url}\n\n"
            "Bitte speichere deinen persönlichen Verwaltungslink. Damit kannst du deine "
            "Eintragung später wieder öffnen oder rechtzeitig absagen:\n"
            f"{management_url}\n\n"
            "Deine Telefonnummer und E-Mail-Adresse sind nur für berechtigte "
            "Verantwortliche sichtbar."
        ),
    )
    try:
        sender.send(message)
    except EmailSendError:
        logger.warning(
            "signup confirmation email failed to=%s signup_id=%s subject=%s",
            recipient,
            signup_id,
            SUBJECT,
        )
