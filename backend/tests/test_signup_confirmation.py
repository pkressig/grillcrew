"""Signup confirmation email content and failure-safety tests."""

import logging
from datetime import UTC, datetime
from uuid import UUID

import pytest

from app.core.config import AppEnv, Settings
from app.services.email.base import EmailMessage, EmailSendError
from app.services.signup_confirmation import (
    dispatch_signup_confirmation_email,
    send_signup_confirmation_email,
)

SIGNUP_ID = UUID("11111111-1111-1111-1111-111111111111")
TOKEN = "raw-management-token-must-stay-out-of-logs"


class RecordingSender:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.messages.append(message)


class FailingSender:
    def send(self, _message: EmailMessage) -> None:
        raise EmailSendError("delivery failed")


def email_kwargs() -> dict[str, object]:
    return {
        "recipient": "mia@example.test",
        "signup_id": SIGNUP_ID,
        "organization_name": "Example Organization",
        "organization_slug": "example",
        "event_title": "Heimspiel",
        "event_type": "Match",
        "shift_starts_at": datetime(2026, 8, 1, 8, 30, tzinfo=UTC),
        "shift_ends_at": datetime(2026, 8, 1, 10, 45, tzinfo=UTC),
        "organization_timezone": "Europe/Zurich",
        "volunteer_public_name": "Mia Muster",
        "management_token": TOKEN,
    }


def test_confirmation_message_contains_local_details_and_absolute_links() -> None:
    sender = RecordingSender()

    send_signup_confirmation_email(
        sender,
        settings=Settings(frontend_public_url="https://crew.example.test/"),
        **email_kwargs(),  # type: ignore[arg-type]
    )

    assert len(sender.messages) == 1
    message = sender.messages[0]
    assert message.subject == "Deine GrillCrew-Eintragung ist bestätigt"
    assert "Example Organization" in message.body_text
    assert "Heimspiel (Match)" in message.body_text
    assert "01.08.2026" in message.body_text
    assert "10:30-12:45 Uhr" in message.body_text
    assert "Hallo Mia Muster" in message.body_text
    assert "https://crew.example.test/example" in message.body_text
    assert f"https://crew.example.test/example/manage-signup/{TOKEN}" in message.body_text
    assert "nur für berechtigte Verantwortliche sichtbar" in message.body_text


def test_sender_failure_is_contained_without_logging_management_token(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(
        "app.services.signup_confirmation.build_email_sender", lambda _settings: FailingSender()
    )
    caplog.set_level(logging.WARNING)

    dispatch_signup_confirmation_email(Settings(), **email_kwargs())  # type: ignore[arg-type]

    assert "signup confirmation email failed" in caplog.text
    assert str(SIGNUP_ID) in caplog.text
    assert TOKEN not in caplog.text


def test_unavailable_sender_is_contained_without_logging_management_token(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.ERROR)

    dispatch_signup_confirmation_email(
        Settings(
            app_env=AppEnv.PRODUCTION,
            jwt_secret_key="a-production-only-secret-with-at-least-32-characters",
            smtp_host=None,
        ),
        **email_kwargs(),  # type: ignore[arg-type]
    )

    assert "sender unavailable" in caplog.text
    assert TOKEN not in caplog.text
