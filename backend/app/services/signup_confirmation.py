"""Confirmation email for an immediately reserved public signup."""

from __future__ import annotations

import html
import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import Settings
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.branding import (
    OrganizationBranding,
    render_branded_email,
    sender_display_name,
)
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
    branding: OrganizationBranding | None = None,
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
        branding=branding,
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
    branding: OrganizationBranding | None = None,
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
    body_text = (
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
    )
    body_html = (
        f"<p>Hallo {html.escape(volunteer_public_name)}</p>"
        f"<p>Deine Eintragung bei {html.escape(organization_name)} ist bestätigt. "
        "Dein Platz ist reserviert.</p>"
        "<p>"
        f"<strong>Einsatz:</strong> {html.escape(event_label)}<br>"
        f"<strong>Datum:</strong> {local_start:%d.%m.%Y}<br>"
        f"<strong>Zeit:</strong> {local_start:%H:%M}-{local_end:%H:%M} Uhr"
        "</p>"
        f'<p>Öffentlicher Einsatzplan: <a href="{html.escape(public_plan_url, quote=True)}">'
        f"{html.escape(public_plan_url)}</a></p>"
        "<p>Bitte speichere deinen persönlichen Verwaltungslink. Damit kannst du deine "
        "Eintragung später wieder öffnen oder rechtzeitig absagen.</p>"
        "<p>Deine Telefonnummer und E-Mail-Adresse sind nur für berechtigte "
        "Verantwortliche sichtbar.</p>"
    )
    content = render_branded_email(
        branding=branding,
        heading=SUBJECT,
        body_html=body_html,
        body_text=body_text,
        cta_label="Anmeldung verwalten",
        cta_url=management_url,
    )
    message = EmailMessage(
        to=recipient,
        subject=SUBJECT,
        body_text=content.text,
        body_html=content.html,
        from_display_name=sender_display_name(branding),
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
