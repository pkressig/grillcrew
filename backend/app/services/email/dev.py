"""Development/test-safe EmailSender (D-040).

Performs no network I/O and never logs message bodies. Sent messages are
captured in memory so tests and local developers can inspect them directly,
without routing secrets (password-reset/invitation tokens) through any log
pipeline.
"""

from __future__ import annotations

import logging

from app.services.email.base import EmailMessage, EmailSender

logger = logging.getLogger(__name__)


class InMemoryEmailSender(EmailSender):
    def __init__(self) -> None:
        self.sent_messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent_messages.append(message)
        logger.info("email captured (dev/test) to=%s subject=%s", message.to, message.subject)
