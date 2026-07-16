"""Tests for the EmailSender abstraction (D-040, plan §15-16)."""

import logging

import pytest

from app.core.config import AppEnv, Settings
from app.services.email.base import EmailMessage, EmailSendError
from app.services.email.dev import InMemoryEmailSender
from app.services.email.factory import build_email_sender
from app.services.email.smtp import SmtpConfig, SmtpEmailSender

SECRET_TOKEN = "super-secret-reset-token-should-never-be-logged"


def test_in_memory_sender_captures_message() -> None:
    sender = InMemoryEmailSender()
    message = EmailMessage(
        to="user@example.test", subject="Reset your password", body_text=SECRET_TOKEN
    )

    sender.send(message)

    assert sender.sent_messages == [message]


def test_in_memory_sender_never_logs_body(caplog: pytest.LogCaptureFixture) -> None:
    sender = InMemoryEmailSender()
    message = EmailMessage(
        to="user@example.test", subject="Reset your password", body_text=SECRET_TOKEN
    )

    with caplog.at_level(logging.DEBUG):
        sender.send(message)

    assert SECRET_TOKEN not in caplog.text


def test_smtp_sender_failure_raises_and_never_logs_token(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def _boom(*_args: object, **_kwargs: object) -> object:
        raise OSError("connection refused")

    monkeypatch.setattr("app.services.email.smtp.smtplib.SMTP", _boom)

    sender = SmtpEmailSender(
        SmtpConfig(
            host="smtp.example.test",
            port=587,
            username=None,
            password=None,
            use_tls=True,
            from_address="no-reply@example.test",
        )
    )
    message = EmailMessage(
        to="user@example.test", subject="Reset your password", body_text=SECRET_TOKEN
    )

    with caplog.at_level(logging.DEBUG):
        with pytest.raises(EmailSendError):
            sender.send(message)

    assert SECRET_TOKEN not in caplog.text
    assert "email send failed" in caplog.text


def test_factory_returns_in_memory_sender_in_development_without_smtp_host() -> None:
    settings = Settings(app_env=AppEnv.DEVELOPMENT, smtp_host=None)

    sender = build_email_sender(settings)

    assert isinstance(sender, InMemoryEmailSender)


def test_factory_returns_in_memory_sender_in_test_without_smtp_host() -> None:
    settings = Settings(app_env=AppEnv.TEST, smtp_host=None)

    sender = build_email_sender(settings)

    assert isinstance(sender, InMemoryEmailSender)


def test_factory_raises_in_production_without_smtp_host() -> None:
    settings = Settings(
        app_env=AppEnv.PRODUCTION,
        smtp_host=None,
        jwt_secret_key="a-unique-production-secret-key-1234567890",
    )

    with pytest.raises(ValueError, match="SMTP_HOST"):
        build_email_sender(settings)


def test_factory_returns_smtp_sender_when_host_configured() -> None:
    settings = Settings(app_env=AppEnv.DEVELOPMENT, smtp_host="smtp.example.test")

    sender = build_email_sender(settings)

    assert isinstance(sender, SmtpEmailSender)
