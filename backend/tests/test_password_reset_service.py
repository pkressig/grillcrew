"""Tests for password reset service behavior."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import TypeVar, cast

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security.password import (
    MIN_PASSWORD_LENGTH,
    PasswordPolicyError,
    hash_password,
    verify_password,
)
from app.models.identity import AuditEvent, PasswordResetToken, User, UserStatus
from app.models.organization import Organization, OrganizationSettings, Theme
from app.models.planning import Volunteer
from app.services.auth import (
    InvalidPasswordResetTokenError,
    PasswordResetService,
    dispatch_password_reset_email,
    hash_password_reset_token,
    send_password_reset_email,
)
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.branding import OrganizationBranding

RAW_TOKEN = "raw-reset-token-that-must-not-be-stored-or-logged"
AddedT = TypeVar("AddedT")


class FakeSession:
    def __init__(self, *, scalar_values: list[object | None]) -> None:
        self.scalar_values = scalar_values
        self.executed: list[object] = []
        self.added: list[object] = []
        self.committed = False

    def scalar(self, _statement: object) -> object | None:
        if not self.scalar_values:
            raise AssertionError("unexpected scalar call")
        return self.scalar_values.pop(0)

    def execute(self, statement: object) -> None:
        self.executed.append(statement)

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def commit(self) -> None:
        self.committed = True


def test_forgot_password_creates_hashed_token_only_for_active_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user(status=UserStatus.ACTIVE, password_hash=hash_password("old-password-123"))
    # Second scalar() call is the Volunteer lookup used to resolve both the org slug (for the
    # reset-link/page branding) and the org branding (for the email); None here means this
    # user has no Volunteer record (e.g. staff-only), so both fall back to generic behavior.
    db = FakeSession(scalar_values=[user, None])
    monkeypatch.setattr("app.services.auth.secrets.token_urlsafe", lambda _bytes: RAW_TOKEN)

    issue = PasswordResetService(cast(Session, db), Settings()).request_reset(
        email=" USER@example.test "
    )

    assert issue is not None
    assert issue.recipient == "user@example.test"
    assert issue.raw_token == RAW_TOKEN
    assert issue.organization_slug is None
    assert issue.branding is None
    added_token = _only_added(db, PasswordResetToken)
    assert added_token.user_id == user.id
    assert added_token.token_hash == hash_password_reset_token(RAW_TOKEN)
    assert added_token.token_hash != RAW_TOKEN
    assert len(added_token.token_hash) == 64
    assert db.executed
    assert db.committed is True


def test_forgot_password_resolves_organization_slug_for_a_linked_volunteer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user(status=UserStatus.ACTIVE, password_hash=hash_password("old-password-123"))
    volunteer = Volunteer(id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=user.id)
    organization = Organization(
        id=volunteer.organization_id, theme_id=uuid.uuid4(), slug="example-club"
    )
    theme = Theme(id=organization.theme_id, name="Theme")
    db = FakeSession(scalar_values=[user, volunteer, organization, theme])
    monkeypatch.setattr("app.services.auth.secrets.token_urlsafe", lambda _bytes: RAW_TOKEN)

    issue = PasswordResetService(cast(Session, db), Settings()).request_reset(
        email="user@example.test"
    )

    assert issue is not None
    assert issue.organization_slug == "example-club"


def test_forgot_password_resolves_organization_branding_via_volunteer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A volunteer's password-reset email should carry their organization's branding, resolved
    read-only via the existing Volunteer -> Organization link (no PasswordResetToken column
    added or changed for this).
    """
    user = _user(status=UserStatus.ACTIVE, password_hash=hash_password("old-password-123"))
    volunteer = Volunteer(id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=user.id)
    organization = Organization(
        id=volunteer.organization_id,
        theme_id=uuid.uuid4(),
        name="FC Thusis-Cazis",
        short_name="FCTC",
        slug="fctc",
    )
    theme = Theme(
        id=organization.theme_id,
        name="FCTC Theme",
        logo_url="/branding/fctc-logo.png",
        primary_color="#123456",
        secondary_color="#abcdef",
    )
    db = FakeSession(scalar_values=[user, volunteer, organization, theme])
    monkeypatch.setattr("app.services.auth.secrets.token_urlsafe", lambda _bytes: RAW_TOKEN)

    issue = PasswordResetService(cast(Session, db), Settings()).request_reset(
        email="user@example.test"
    )

    assert issue is not None
    assert issue.branding is not None
    assert issue.branding.organization_name == "FC Thusis-Cazis"
    assert issue.branding.organization_short_name == "FCTC"
    assert issue.branding.primary_color == "#123456"


@pytest.mark.parametrize("status", [UserStatus.DISABLED, UserStatus.INVITED])
def test_forgot_password_does_not_issue_for_disabled_or_invited_users(status: UserStatus) -> None:
    user = _user(status=status, password_hash=hash_password("old-password-123"))
    db = FakeSession(scalar_values=[user])

    issue = PasswordResetService(cast(Session, db), Settings()).request_reset(
        email="user@example.test"
    )

    assert issue is None
    assert db.added == []
    assert db.executed == []
    assert db.committed is False


def test_forgot_password_does_not_issue_for_missing_user() -> None:
    db = FakeSession(scalar_values=[None])

    issue = PasswordResetService(cast(Session, db), Settings()).request_reset(
        email="missing@example.test"
    )

    assert issue is None
    assert db.added == []
    assert db.executed == []
    assert db.committed is False


def test_reset_password_succeeds_updates_hash_consumes_token_and_revokes_sessions() -> None:
    user = _user(status=UserStatus.ACTIVE, password_hash=hash_password("old-password-123"))
    token = _reset_token(user=user, expires_at=datetime.now(UTC) + timedelta(hours=1))
    db = FakeSession(scalar_values=[token, None])

    session, session_body = PasswordResetService(cast(Session, db), Settings()).reset_password(
        raw_token=RAW_TOKEN,
        new_password="new-password-123",
    )

    assert token.consumed_at is not None
    assert user.password_hash is not None
    assert verify_password("new-password-123", user.password_hash)
    assert len(db.executed) == 1
    assert _only_added(db, AuditEvent).action == "PASSWORD_RESET"
    assert db.committed is True
    assert session.access_token
    assert session_body.user.id == str(user.id)


def test_reset_password_uses_the_linked_volunteers_organization_minimum_length() -> None:
    user = _user(status=UserStatus.ACTIVE, password_hash=hash_password("old-password-123"))
    token = _reset_token(user=user, expires_at=datetime.now(UTC) + timedelta(hours=1))
    volunteer = Volunteer(id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=user.id)
    org_settings = OrganizationSettings(
        organization_id=volunteer.organization_id, volunteer_password_min_length=6
    )
    db = FakeSession(scalar_values=[token, volunteer, org_settings])

    # 8 characters: shorter than the platform default of MIN_PASSWORD_LENGTH (10),
    # but satisfies this organization's configured minimum of 6.
    assert MIN_PASSWORD_LENGTH > 8
    PasswordResetService(cast(Session, db), Settings()).reset_password(
        raw_token=RAW_TOKEN,
        new_password="short8ch",
    )

    assert token.consumed_at is not None


def test_reset_password_rejects_a_password_below_the_organizations_configured_minimum() -> None:
    user = _user(status=UserStatus.ACTIVE, password_hash=hash_password("old-password-123"))
    token = _reset_token(user=user, expires_at=datetime.now(UTC) + timedelta(hours=1))
    volunteer = Volunteer(id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=user.id)
    org_settings = OrganizationSettings(
        organization_id=volunteer.organization_id, volunteer_password_min_length=12
    )
    db = FakeSession(scalar_values=[token, volunteer, org_settings])

    with pytest.raises(PasswordPolicyError):
        PasswordResetService(cast(Session, db), Settings()).reset_password(
            raw_token=RAW_TOKEN,
            new_password="eleven-char",
        )

    assert token.consumed_at is None
    assert db.added == []
    assert db.committed is False


@pytest.mark.parametrize("token_state", ["missing", "consumed", "expired"])
def test_reset_password_rejects_invalid_consumed_or_expired_token(token_state: str) -> None:
    token: PasswordResetToken | None
    if token_state == "missing":
        token = None
    elif token_state == "consumed":
        token = _reset_token(consumed_at=datetime.now(UTC))
    else:
        token = _reset_token(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    db = FakeSession(scalar_values=[token])

    with pytest.raises(InvalidPasswordResetTokenError):
        PasswordResetService(cast(Session, db), Settings()).reset_password(
            raw_token=RAW_TOKEN,
            new_password="new-password-123",
        )

    assert db.added == []
    assert db.executed == []
    assert db.committed is False


def test_reset_password_enforces_password_policy_before_any_mutation() -> None:
    # The organization-specific minimum length can only be resolved once the
    # token's linked user (and volunteer, if any) is known, so the token lookup
    # now necessarily happens before policy validation. No mutation may occur
    # either way once the password is rejected.
    token = _reset_token(expires_at=datetime.now(UTC) + timedelta(hours=1))
    db = FakeSession(scalar_values=[token, None])

    with pytest.raises(PasswordPolicyError):
        PasswordResetService(cast(Session, db), Settings()).reset_password(
            raw_token=RAW_TOKEN,
            new_password="short",
        )

    assert token.consumed_at is None
    assert db.added == []
    assert db.executed == []
    assert db.committed is False


def test_send_password_reset_email_failure_never_logs_raw_token(
    caplog: pytest.LogCaptureFixture,
) -> None:
    sender = FailingSender()

    with caplog.at_level(logging.DEBUG):
        send_password_reset_email(
            sender,
            recipient="user@example.test",
            raw_token=RAW_TOKEN,
            organization_slug=None,
            frontend_public_url="http://localhost:3000",
        )

    assert RAW_TOKEN not in caplog.text
    assert "password reset email failed" in caplog.text


class FailingSender(EmailSender):
    def send(self, message: EmailMessage) -> None:
        assert RAW_TOKEN in message.body_text
        raise EmailSendError("transport unavailable")


def test_dispatch_password_reset_email_sends_via_configured_sender(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[EmailMessage] = []

    class RecordingSender(EmailSender):
        def send(self, message: EmailMessage) -> None:
            sent.append(message)

    monkeypatch.setattr("app.services.auth.build_email_sender", lambda _settings: RecordingSender())

    dispatch_password_reset_email(
        Settings(), recipient="user@example.test", raw_token=RAW_TOKEN, organization_slug=None
    )

    assert len(sent) == 1
    assert sent[0].to == "user@example.test"
    assert RAW_TOKEN in sent[0].body_text


def test_dispatch_password_reset_email_never_raises_or_logs_token_when_sender_unavailable(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def _raise_sender_unavailable(_settings: object) -> None:
        raise ValueError("SMTP_HOST must be configured outside development/test")

    monkeypatch.setattr("app.services.auth.build_email_sender", _raise_sender_unavailable)

    with caplog.at_level(logging.DEBUG):
        dispatch_password_reset_email(
            Settings(), recipient="user@example.test", raw_token=RAW_TOKEN, organization_slug=None
        )

    assert RAW_TOKEN not in caplog.text
    assert "password reset email sender unavailable" in caplog.text


def test_send_password_reset_email_applies_organization_branding() -> None:
    sender = RecordingSender()
    branding = OrganizationBranding(
        organization_name="FC Thusis-Cazis",
        organization_short_name="FCTC",
        logo_url="https://crew.example.test/branding/fctc-logo.png",
        banner_url=None,
        primary_color="#123456",
        secondary_color="#abcdef",
    )

    send_password_reset_email(
        sender,
        recipient="user@example.test",
        raw_token=RAW_TOKEN,
        organization_slug="fctc",
        frontend_public_url="https://crew.example.test",
        branding=branding,
    )

    assert len(sender.sent) == 1
    message = sender.sent[0]
    assert message.from_display_name == "FCTC Grill Helfer"
    assert message.body_html is not None
    assert "FC Thusis-Cazis" in message.body_html
    assert '<img src="https://crew.example.test/branding/fctc-logo.png"' in message.body_html
    assert RAW_TOKEN in message.body_text
    assert "Vereinshelden-Plattform im Auftrag von FC Thusis-Cazis" in message.body_html
    assert "Vereinshelden-Plattform im Auftrag von FC Thusis-Cazis" in message.body_text


def test_send_password_reset_email_uses_generic_branding_when_none_resolved() -> None:
    sender = RecordingSender()

    send_password_reset_email(
        sender,
        recipient="user@example.test",
        raw_token=RAW_TOKEN,
        organization_slug=None,
        frontend_public_url="https://crew.example.test",
        branding=None,
    )

    assert sender.sent[0].from_display_name == "Vereinshelden"
    assert sender.sent[0].body_html is not None
    assert "<img" not in sender.sent[0].body_html


class RecordingSender(EmailSender):
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


def _user(*, status: UserStatus, password_hash: str | None) -> User:
    return User(
        id=uuid.uuid4(),
        email_normalized="user@example.test",
        status=status,
        password_hash=password_hash,
    )


def _reset_token(
    *,
    user: User | None = None,
    expires_at: datetime | None = None,
    consumed_at: datetime | None = None,
) -> PasswordResetToken:
    owner = user or _user(status=UserStatus.ACTIVE, password_hash=hash_password("old-password-123"))
    token = PasswordResetToken(
        id=uuid.uuid4(),
        user_id=owner.id,
        token_hash=hash_password_reset_token(RAW_TOKEN),
        expires_at=expires_at or datetime.now(UTC) + timedelta(hours=1),
        consumed_at=consumed_at,
    )
    token.user = owner
    return token


def _only_added[AddedT](db: FakeSession, expected_type: type[AddedT]) -> AddedT:
    matches = [instance for instance in db.added if isinstance(instance, expected_type)]
    assert len(matches) == 1
    return matches[0]
