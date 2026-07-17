"""Tests for password reset service behavior."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import TypeVar, cast

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security.password import PasswordPolicyError, hash_password, verify_password
from app.models.identity import AuditEvent, PasswordResetToken, User, UserStatus
from app.services.auth import (
    InvalidPasswordResetTokenError,
    PasswordResetService,
    dispatch_password_reset_email,
    hash_password_reset_token,
    send_password_reset_email,
)
from app.services.email.base import EmailMessage, EmailSender, EmailSendError

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
    db = FakeSession(scalar_values=[user])
    monkeypatch.setattr("app.services.auth.secrets.token_urlsafe", lambda _bytes: RAW_TOKEN)

    issue = PasswordResetService(cast(Session, db), Settings()).request_reset(
        email=" USER@example.test "
    )

    assert issue is not None
    assert issue.recipient == "user@example.test"
    assert issue.raw_token == RAW_TOKEN
    added_token = _only_added(db, PasswordResetToken)
    assert added_token.user_id == user.id
    assert added_token.token_hash == hash_password_reset_token(RAW_TOKEN)
    assert added_token.token_hash != RAW_TOKEN
    assert len(added_token.token_hash) == 64
    assert db.executed
    assert db.committed is True


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
    db = FakeSession(scalar_values=[token])

    PasswordResetService(cast(Session, db), Settings()).reset_password(
        raw_token=RAW_TOKEN,
        new_password="new-password-123",
    )

    assert token.consumed_at is not None
    assert user.password_hash is not None
    assert verify_password("new-password-123", user.password_hash)
    assert len(db.executed) == 1
    assert _only_added(db, AuditEvent).action == "PASSWORD_RESET"
    assert db.committed is True


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


def test_reset_password_enforces_password_policy_before_token_lookup() -> None:
    db = FakeSession(scalar_values=[])

    with pytest.raises(PasswordPolicyError):
        PasswordResetService(cast(Session, db), Settings()).reset_password(
            raw_token=RAW_TOKEN,
            new_password="short",
        )

    assert db.added == []
    assert db.executed == []
    assert db.committed is False


def test_send_password_reset_email_failure_never_logs_raw_token(
    caplog: pytest.LogCaptureFixture,
) -> None:
    sender = FailingSender()

    with caplog.at_level(logging.DEBUG):
        send_password_reset_email(sender, recipient="user@example.test", raw_token=RAW_TOKEN)

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

    dispatch_password_reset_email(Settings(), recipient="user@example.test", raw_token=RAW_TOKEN)

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
            Settings(), recipient="user@example.test", raw_token=RAW_TOKEN
        )

    assert RAW_TOKEN not in caplog.text
    assert "password reset email sender unavailable" in caplog.text


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
