"""Tests for the EmailSender abstraction (D-040, plan §15-16)."""

import logging
from email.message import EmailMessage as MimeEmailMessage

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


@pytest.mark.parametrize("smtp_host", ["", "   \t"])
def test_factory_returns_in_memory_sender_for_blank_smtp_host(smtp_host: str) -> None:
    settings = Settings(app_env=AppEnv.DEVELOPMENT, smtp_host=smtp_host)

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


def test_smtp_sender_uses_bare_platform_address_without_display_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The sending address stays platform-wide (D-040); with no organization display name,
    the From header is exactly the configured address, unchanged from prior behavior."""
    sent_messages: list[MimeEmailMessage] = []

    class _FakeSmtp:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def __enter__(self) -> "_FakeSmtp":
            return self

        def __exit__(self, *_exc: object) -> None:
            return None

        def starttls(self) -> None:
            pass

        def send_message(self, message: MimeEmailMessage) -> None:
            sent_messages.append(message)

    monkeypatch.setattr("app.services.email.smtp.smtplib.SMTP", _FakeSmtp)
    sender = SmtpEmailSender(
        SmtpConfig(
            host="smtp.example.test",
            port=587,
            username=None,
            password=None,
            use_tls=True,
            from_address="no-reply@grillcrew.example",
        )
    )

    sender.send(EmailMessage(to="user@example.test", subject="Hallo", body_text="Hallo Welt"))

    assert len(sent_messages) == 1
    assert sent_messages[0]["From"] == "no-reply@grillcrew.example"


def test_smtp_sender_formats_from_header_with_organization_display_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only the display name is per-organization; built via `Address` for RFC 2047/5322-safe
    encoding (handles non-ASCII names correctly, unlike hand-rolled string concatenation)."""
    sent_messages: list[MimeEmailMessage] = []

    class _FakeSmtp:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def __enter__(self) -> "_FakeSmtp":
            return self

        def __exit__(self, *_exc: object) -> None:
            return None

        def starttls(self) -> None:
            pass

        def send_message(self, message: MimeEmailMessage) -> None:
            sent_messages.append(message)

    monkeypatch.setattr("app.services.email.smtp.smtplib.SMTP", _FakeSmtp)
    sender = SmtpEmailSender(
        SmtpConfig(
            host="smtp.example.test",
            port=587,
            username=None,
            password=None,
            use_tls=True,
            from_address="no-reply@grillcrew.example",
        )
    )

    sender.send(
        EmailMessage(
            to="user@example.test",
            subject="Hallo",
            body_text="Hallo Welt",
            from_display_name="FCTC Grill Helfer",
        )
    )

    assert len(sent_messages) == 1
    from_header = str(sent_messages[0]["From"])
    assert from_header == "FCTC Grill Helfer <no-reply@grillcrew.example>"


def test_smtp_sender_builds_multipart_alternative_when_html_body_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_messages: list[MimeEmailMessage] = []

    class _FakeSmtp:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def __enter__(self) -> "_FakeSmtp":
            return self

        def __exit__(self, *_exc: object) -> None:
            return None

        def starttls(self) -> None:
            pass

        def send_message(self, message: MimeEmailMessage) -> None:
            sent_messages.append(message)

    monkeypatch.setattr("app.services.email.smtp.smtplib.SMTP", _FakeSmtp)
    sender = SmtpEmailSender(
        SmtpConfig(
            host="smtp.example.test",
            port=587,
            username=None,
            password=None,
            use_tls=True,
            from_address="no-reply@grillcrew.example",
        )
    )

    sender.send(
        EmailMessage(
            to="user@example.test",
            subject="Hallo",
            body_text="Plain fallback",
            body_html="<p>Rich body</p>",
        )
    )

    message = sent_messages[0]
    assert message.is_multipart()
    plain_part = message.get_body(preferencelist=("plain",))
    html_part = message.get_body(preferencelist=("html",))
    assert plain_part is not None
    assert "Plain fallback" in plain_part.get_content()
    assert html_part is not None
    assert "<p>Rich body</p>" in html_part.get_content()
