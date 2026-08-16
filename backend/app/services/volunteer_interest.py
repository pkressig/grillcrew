"""Staff notification email for the public 'Bewerbung' (volunteer interest) form.

No new database table exists for this in v1: an interested person who is not yet a
helper leaves their contact details on a public form, and the organization's
ADMIN/KOORDINATION staff are notified by email so they can follow up manually. This
mirrors the dispatch/send split and branding resolution already used by
`app.services.signup_confirmation` and `app.services.invitation`.
"""

from __future__ import annotations

import html
import logging

from app.core.config import Settings
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.branding import (
    OrganizationBranding,
    render_branded_email,
    sender_display_name,
)
from app.services.email.factory import build_email_sender

logger = logging.getLogger(__name__)
SUBJECT = "Neue Bewerbung"

_AREA_LABELS: dict[str, str] = {
    "GRILL": "Grill",
    "KIOSK": "Kiosk",
    "EITHER": "Grill oder Kiosk",
}


def dispatch_volunteer_interest_email(
    settings: Settings,
    *,
    recipient: str,
    organization_name: str,
    first_name: str,
    last_name: str,
    contact: str,
    area: str | None,
    message: str | None,
    branding: OrganizationBranding | None = None,
) -> None:
    """Build and send the notification without allowing delivery errors to escape."""
    try:
        sender = build_email_sender(settings)
    except ValueError:
        logger.error("volunteer interest email sender unavailable to=%s", recipient)
        return
    send_volunteer_interest_email(
        sender,
        recipient=recipient,
        organization_name=organization_name,
        first_name=first_name,
        last_name=last_name,
        contact=contact,
        area=area,
        message=message,
        branding=branding,
    )


def send_volunteer_interest_email(
    sender: EmailSender,
    *,
    recipient: str,
    organization_name: str,
    first_name: str,
    last_name: str,
    contact: str,
    area: str | None,
    message: str | None,
    branding: OrganizationBranding | None = None,
) -> None:
    full_name = f"{first_name} {last_name}"
    area_label = _AREA_LABELS.get(area or "", None)
    body_text = (
        f"Es gibt eine neue Bewerbung bei {organization_name}.\n\n"
        f"Name: {full_name}\n"
        f"Kontakt: {contact}\n"
    )
    body_html = (
        f"<p>Es gibt eine neue Bewerbung bei {html.escape(organization_name)}.</p>"
        "<p>"
        f"<strong>Name:</strong> {html.escape(full_name)}<br>"
        f"<strong>Kontakt:</strong> {html.escape(contact)}"
    )
    if area_label:
        body_text += f"Interessiert an: {area_label}\n"
        body_html += f"<br><strong>Interessiert an:</strong> {html.escape(area_label)}"
    body_html += "</p>"
    if message:
        body_text += f"\nNachricht:\n{message}\n"
        body_html += f"<p><strong>Nachricht:</strong><br>{html.escape(message)}</p>"
    content = render_branded_email(
        branding=branding,
        heading=SUBJECT,
        body_html=body_html,
        body_text=body_text,
    )
    email_message = EmailMessage(
        to=recipient,
        subject=SUBJECT,
        body_text=content.text,
        body_html=content.html,
        from_display_name=sender_display_name(branding),
    )
    try:
        sender.send(email_message)
    except EmailSendError:
        logger.warning("volunteer interest email failed to=%s subject=%s", recipient, SUBJECT)
