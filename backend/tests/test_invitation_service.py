"""Tests for secure invitation issuance and acceptance."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import TypeVar, cast

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security.password import PasswordPolicyError, hash_password, verify_password
from app.models.identity import AuditEvent, Invitation, StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.invitation import (
    DuplicateInvitationError,
    InvalidInvitationTokenError,
    InvitationService,
    dispatch_invitation_email,
    hash_invitation_token,
    send_invitation_email,
)

RAW_TOKEN = "raw-invitation-token-that-must-not-be-stored-or-logged"
AddedT = TypeVar("AddedT")


class FakeResult:
    def __init__(self, rowcount: int = 1) -> None:
        self.rowcount = rowcount


class FakeSession:
    def __init__(self, scalar_values: list[object | None], claim_rowcount: int = 1) -> None:
        self.scalar_values = scalar_values
        self.claim_rowcount = claim_rowcount
        self.added: list[object] = []
        self.executed: list[object] = []
        self.committed = False
        self.rolled_back = False

    def scalar(self, _statement: object) -> object | None:
        if not self.scalar_values:
            raise AssertionError("unexpected scalar call")
        return self.scalar_values.pop(0)

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def flush(self) -> None:
        for instance in self.added:
            if getattr(instance, "id", None) is None:
                cast(User | Invitation | StaffMembership | AuditEvent, instance).id = uuid.uuid4()

    def execute(self, statement: object) -> FakeResult:
        self.executed.append(statement)
        return FakeResult(rowcount=self.claim_rowcount)

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True


def test_create_invitation_reuses_existing_user_and_stores_only_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user(UserStatus.ACTIVE)
    db = FakeSession([user, None])
    monkeypatch.setattr("app.services.invitation.secrets.token_urlsafe", lambda _size: RAW_TOKEN)

    issue = InvitationService(cast(Session, db), Settings()).create(
        email=" USER@example.test ",
        role=StaffRole.KIOSK,
        organization=_organization(),
        created_by=_user(UserStatus.ACTIVE),
    )

    invitation = _only_added(db, Invitation)
    assert issue.raw_token == RAW_TOKEN
    assert invitation.user_id == user.id
    assert invitation.token_hash == hash_invitation_token(RAW_TOKEN)
    assert invitation.token_hash != RAW_TOKEN
    assert RAW_TOKEN not in repr(invitation.__dict__)
    assert not any(isinstance(item, User) for item in db.added)
    assert db.committed


def test_create_invitation_creates_invited_user_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = FakeSession([None, None])
    monkeypatch.setattr("app.services.invitation.secrets.token_urlsafe", lambda _size: RAW_TOKEN)

    InvitationService(cast(Session, db), Settings()).create(
        email=" NEW@example.test ",
        role=StaffRole.KOORDINATION,
        organization=_organization(),
        created_by=_user(UserStatus.ACTIVE),
    )

    user = _only_added(db, User)
    assert user.email_normalized == "new@example.test"
    assert user.status == UserStatus.INVITED
    assert user.password_hash is None


def test_create_invitation_rejects_duplicate_pending_invitation() -> None:
    db = FakeSession([_user(UserStatus.ACTIVE), uuid.uuid4()])

    with pytest.raises(DuplicateInvitationError):
        InvitationService(cast(Session, db), Settings()).create(
            email="user@example.test",
            role=StaffRole.KIOSK,
            organization=_organization(),
            created_by=_user(UserStatus.ACTIVE),
        )

    assert db.rolled_back
    assert not any(isinstance(item, Invitation) for item in db.added)


def test_accept_invitation_activates_user_creates_membership_and_consumes_token() -> None:
    user = _user(UserStatus.INVITED)
    invitation = _invitation(user=user)
    db = FakeSession([invitation, None])

    InvitationService(cast(Session, db), Settings()).accept(
        raw_token=RAW_TOKEN,
        display_name=" Invited Person ",
        password="secure-password-123",
    )

    membership = _only_added(db, StaffMembership)
    assert user.status == UserStatus.ACTIVE
    assert user.display_name == "Invited Person"
    assert user.password_hash is not None
    assert verify_password("secure-password-123", user.password_hash)
    assert membership.organization_id == invitation.organization_id
    assert membership.role == invitation.role
    assert len(db.executed) == 1
    assert _only_added(db, AuditEvent).action == "STAFF_MEMBERSHIP_GRANTED"
    assert db.committed


def test_accept_invitation_activates_existing_inactive_membership() -> None:
    user = _user(UserStatus.ACTIVE)
    old_hash = hash_password("existing-password-123")
    user.password_hash = old_hash
    invitation = _invitation(user=user, role=StaffRole.ADMIN)
    membership = StaffMembership(
        id=uuid.uuid4(),
        organization_id=invitation.organization_id,
        user_id=user.id,
        role=StaffRole.KIOSK,
        active=False,
    )
    db = FakeSession([invitation, membership])

    InvitationService(cast(Session, db), Settings()).accept(
        raw_token=RAW_TOKEN,
        display_name="Ignored",
        password=None,
    )

    assert membership.active
    assert membership.role == StaffRole.ADMIN
    assert user.password_hash == old_hash
    assert not any(
        isinstance(item, StaffMembership) and item is not membership for item in db.added
    )


def test_accept_invitation_fails_closed_when_concurrent_claim_loses_race() -> None:
    """A losing concurrent accept must reject and roll back, never granting membership.

    Mirrors the equivalent race-loss coverage for refresh-token rotation in
    test_refresh_service.py: the atomic UPDATE ... WHERE accepted_at IS NULL claim is
    what makes concurrent accept attempts fail closed, so it must be exercised directly
    rather than only ever observed with rowcount == 1.
    """
    user = _user(UserStatus.INVITED)
    invitation = _invitation(user=user)
    db = FakeSession([invitation], claim_rowcount=0)

    with pytest.raises(InvalidInvitationTokenError):
        InvitationService(cast(Session, db), Settings()).accept(
            raw_token=RAW_TOKEN,
            display_name="Person",
            password="secure-password-123",
        )

    assert db.rolled_back
    assert not db.committed
    assert not any(isinstance(item, StaffMembership) for item in db.added)
    assert not any(isinstance(item, AuditEvent) for item in db.added)


@pytest.mark.parametrize("state", ["unknown", "expired", "consumed", "revoked", "disabled"])
def test_accept_invitation_rejects_every_invalid_token_state(state: str) -> None:
    invitation: Invitation | None = _invitation()
    if state == "unknown":
        invitation = None
    else:
        assert invitation is not None
        if state == "expired":
            invitation.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        elif state == "consumed":
            invitation.accepted_at = datetime.now(UTC)
        elif state == "revoked":
            invitation.revoked_at = datetime.now(UTC)
        else:
            invitation.user.status = UserStatus.DISABLED
    db = FakeSession([invitation])

    with pytest.raises(InvalidInvitationTokenError):
        InvitationService(cast(Session, db), Settings()).accept(
            raw_token=RAW_TOKEN,
            display_name="Person",
            password="secure-password-123",
        )

    assert not db.committed


def test_accept_invitation_enforces_password_policy_for_invited_user() -> None:
    db = FakeSession([_invitation()])

    with pytest.raises(PasswordPolicyError):
        InvitationService(cast(Session, db), Settings()).accept(
            raw_token=RAW_TOKEN,
            display_name="Person",
            password="short",
        )


def test_invitation_email_failures_never_log_raw_token(
    caplog: pytest.LogCaptureFixture,
) -> None:
    class FailingSender(EmailSender):
        def send(self, message: EmailMessage) -> None:
            assert RAW_TOKEN in message.body_text
            raise EmailSendError("transport unavailable")

    with caplog.at_level(logging.DEBUG):
        send_invitation_email(
            FailingSender(),
            recipient="user@example.test",
            organization_name="Example Org",
            raw_token=RAW_TOKEN,
        )

    assert RAW_TOKEN not in caplog.text
    assert "invitation email failed" in caplog.text


def test_unavailable_invitation_sender_never_logs_or_raises_token(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def unavailable(_settings: object) -> None:
        raise ValueError("sender unavailable")

    monkeypatch.setattr("app.services.invitation.build_email_sender", unavailable)
    with caplog.at_level(logging.DEBUG):
        dispatch_invitation_email(
            Settings(),
            recipient="user@example.test",
            organization_name="Example Org",
            raw_token=RAW_TOKEN,
        )

    assert RAW_TOKEN not in caplog.text
    assert "invitation email sender unavailable" in caplog.text


def _user(status: UserStatus) -> User:
    return User(
        id=uuid.uuid4(),
        email_normalized="user@example.test",
        status=status,
        password_hash=None,
    )


def _organization() -> Organization:
    return Organization(id=uuid.uuid4(), theme_id=uuid.uuid4(), name="Example Org", slug="example")


def _invitation(
    *,
    user: User | None = None,
    role: StaffRole = StaffRole.KIOSK,
) -> Invitation:
    owner = user or _user(UserStatus.INVITED)
    invitation = Invitation(
        id=uuid.uuid4(),
        user_id=owner.id,
        organization_id=uuid.uuid4(),
        role=role,
        token_hash=hash_invitation_token(RAW_TOKEN),
        expires_at=datetime.now(UTC) + timedelta(days=1),
        created_by_user_id=uuid.uuid4(),
    )
    invitation.user = owner
    return invitation


def _only_added[AddedT](db: FakeSession, expected_type: type[AddedT]) -> AddedT:
    matches = [instance for instance in db.added if isinstance(instance, expected_type)]
    assert len(matches) == 1
    return matches[0]
