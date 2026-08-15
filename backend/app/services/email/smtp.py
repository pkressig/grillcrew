"""SMTP transport for EmailSender, configured entirely via environment variables (D-040)."""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from email.headerregistry import Address
from email.message import EmailMessage as MimeEmailMessage

from app.services.email.base import EmailMessage, EmailSender, EmailSendError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SmtpConfig:
    host: str
    port: int
    username: str | None
    password: str | None
    use_tls: bool
    from_address: str


class SmtpEmailSender(EmailSender):
    def __init__(self, config: SmtpConfig) -> None:
        self._config = config

    def send(self, message: EmailMessage) -> None:
        mime_message = MimeEmailMessage()
        mime_message["From"] = self._build_from_header(message.from_display_name)
        mime_message["To"] = message.to
        mime_message["Subject"] = message.subject
        mime_message.set_content(message.body_text)
        if message.body_html:
            mime_message.add_alternative(message.body_html, subtype="html")

        try:
            with smtplib.SMTP(self._config.host, self._config.port, timeout=10) as client:
                if self._config.use_tls:
                    client.starttls()
                if self._config.username and self._config.password:
                    client.login(self._config.username, self._config.password)
                client.send_message(mime_message)
        except (OSError, smtplib.SMTPException) as exc:
            # Metadata only — never the body, which may carry a bearer token.
            logger.error(
                "email send failed to=%s subject=%s error=%s",
                message.to,
                message.subject,
                type(exc).__name__,
            )
            raise EmailSendError(f"failed to send email to {message.to}") from exc

        logger.info("email sent to=%s subject=%s", message.to, message.subject)

    def _build_from_header(self, from_display_name: str | None) -> str | Address:
        """Build the From header: the address stays platform-wide (D-040); only an optional
        per-organization display name is layered on top, via `Address` for RFC 2047/5322-safe
        encoding of non-ASCII names (never hand-rolled string concatenation).
        """
        if not from_display_name:
            return self._config.from_address
        return Address(display_name=from_display_name, addr_spec=self._config.from_address)
