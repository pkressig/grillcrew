"""Tests for the volunteer registration welcome email and the reset-link URL format."""

from __future__ import annotations

import logging

import pytest

from app.core.config import Settings
from app.services.auth import (
    dispatch_password_reset_email,
    dispatch_volunteer_registration_email,
    send_password_reset_email,
    send_volunteer_registration_email,
)
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.branding import OrganizationBranding

RAW_TOKEN = "raw-reset-token-that-must-not-be-stored-or-logged"


class RecordingSender(EmailSender):
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


class FailingSender(EmailSender):
    def send(self, message: EmailMessage) -> None:
        raise EmailSendError("transport unavailable")


def test_send_password_reset_email_builds_an_absolute_reset_url() -> None:
    sender = RecordingSender()

    send_password_reset_email(
        sender,
        recipient="user@example.test",
        raw_token=RAW_TOKEN,
        organization_slug=None,
        frontend_public_url="https://grillcrew.vercel.app",
    )

    assert len(sender.sent) == 1
    assert sender.sent[0].body_text.count("https://grillcrew.vercel.app/reset-password/") == 1
    assert f"https://grillcrew.vercel.app/reset-password/{RAW_TOKEN}" in sender.sent[0].body_text


def test_send_password_reset_email_carries_the_organization_slug_for_branding() -> None:
    sender = RecordingSender()

    send_password_reset_email(
        sender,
        recipient="user@example.test",
        raw_token=RAW_TOKEN,
        organization_slug="fc-beispiel",
        frontend_public_url="https://grillcrew.vercel.app",
    )

    assert (
        f"https://grillcrew.vercel.app/reset-password/{RAW_TOKEN}?org=fc-beispiel"
        in sender.sent[0].body_text
    )


def test_dispatch_password_reset_email_uses_configured_frontend_public_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sender = RecordingSender()
    monkeypatch.setattr("app.services.auth.build_email_sender", lambda _settings: sender)

    dispatch_password_reset_email(
        Settings(frontend_public_url="https://grillcrew.vercel.app"),
        recipient="user@example.test",
        raw_token=RAW_TOKEN,
        organization_slug=None,
    )

    assert f"https://grillcrew.vercel.app/reset-password/{RAW_TOKEN}" in sender.sent[0].body_text


def test_send_volunteer_registration_email_greets_by_name_and_links_the_org_plan() -> None:
    sender = RecordingSender()

    send_volunteer_registration_email(
        sender,
        recipient="mia@example.test",
        first_name="Mia",
        organization_name="FC Beispiel",
        organization_slug="fc-beispiel",
        frontend_public_url="https://grillcrew.vercel.app",
    )

    assert len(sender.sent) == 1
    message = sender.sent[0]
    assert message.to == "mia@example.test"
    assert "FC Beispiel" in message.subject
    assert "Mia" in message.body_text
    assert "https://grillcrew.vercel.app/fc-beispiel" in message.body_text


def test_send_volunteer_registration_email_failure_is_logged_without_raising(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.DEBUG):
        send_volunteer_registration_email(
            FailingSender(),
            recipient="mia@example.test",
            first_name="Mia",
            organization_name="FC Beispiel",
            organization_slug="fc-beispiel",
            frontend_public_url="https://grillcrew.vercel.app",
        )

    assert "volunteer registration email failed" in caplog.text


def test_dispatch_volunteer_registration_email_sends_via_configured_sender(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sender = RecordingSender()
    monkeypatch.setattr("app.services.auth.build_email_sender", lambda _settings: sender)

    dispatch_volunteer_registration_email(
        Settings(frontend_public_url="https://grillcrew.vercel.app"),
        recipient="mia@example.test",
        first_name="Mia",
        organization_name="FC Beispiel",
        organization_slug="fc-beispiel",
    )

    assert len(sender.sent) == 1
    assert "https://grillcrew.vercel.app/fc-beispiel" in sender.sent[0].body_text


def test_send_volunteer_registration_email_applies_organization_branding() -> None:
    sender = RecordingSender()
    branding = OrganizationBranding(
        organization_name="FC Beispiel",
        organization_short_name="FCB",
        logo_url="https://grillcrew.vercel.app/branding/fc-beispiel-logo.png",
        banner_url=None,
        primary_color="#112233",
        secondary_color="#445566",
    )

    send_volunteer_registration_email(
        sender,
        recipient="mia@example.test",
        first_name="Mia",
        organization_name="FC Beispiel",
        organization_slug="fc-beispiel",
        frontend_public_url="https://grillcrew.vercel.app",
        branding=branding,
    )

    message = sender.sent[0]
    assert message.from_display_name == "FCB Grill Helfer"
    assert message.body_html is not None
    assert "FC Beispiel" in message.body_html
    assert (
        '<img src="https://grillcrew.vercel.app/branding/fc-beispiel-logo.png"' in message.body_html
    )
    assert message.body_text is not None
    assert "Vereinshelden-Plattform im Auftrag von FC Beispiel" in message.body_html
    assert "Vereinshelden-Plattform im Auftrag von FC Beispiel" in message.body_text


def test_dispatch_volunteer_registration_email_never_raises_when_sender_unavailable(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def _raise_sender_unavailable(_settings: object) -> None:
        raise ValueError("SMTP_HOST must be configured outside development/test")

    monkeypatch.setattr("app.services.auth.build_email_sender", _raise_sender_unavailable)

    with caplog.at_level(logging.DEBUG):
        dispatch_volunteer_registration_email(
            Settings(),
            recipient="mia@example.test",
            first_name="Mia",
            organization_name="FC Beispiel",
            organization_slug="fc-beispiel",
        )

    assert "volunteer registration email sender unavailable" in caplog.text
