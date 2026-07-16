"""Selects the EmailSender implementation for the running environment (D-040)."""

from __future__ import annotations

from app.core.config import AppEnv, Settings
from app.services.email.base import EmailSender
from app.services.email.dev import InMemoryEmailSender
from app.services.email.smtp import SmtpConfig, SmtpEmailSender


def build_email_sender(settings: Settings) -> EmailSender:
    if settings.smtp_host is None:
        if settings.app_env in (AppEnv.DEVELOPMENT, AppEnv.TEST):
            return InMemoryEmailSender()
        raise ValueError("SMTP_HOST must be configured outside development/test")

    return SmtpEmailSender(
        SmtpConfig(
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
            from_address=settings.email_from_address,
        )
    )
