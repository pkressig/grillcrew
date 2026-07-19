"""Tests for the first-admin bootstrap command."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import cast

import pytest
from sqlalchemy.orm import Session

from app.cli.bootstrap_admin import (
    BootstrapAdminError,
    BootstrapAdminInput,
    bootstrap_admin,
    load_bootstrap_input_from_env,
)
from app.core.security.password import PasswordPolicyError, verify_password
from app.models.identity import AuditEvent, StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization, Theme


class FakeSession:
    def __init__(self, scalar_values: list[object | None]) -> None:
        self.scalar_values = scalar_values
        self.added: list[object] = []
        self.committed = False
        self.flushed = False

    def scalar(self, _statement: object) -> object | None:
        if not self.scalar_values:
            raise AssertionError("unexpected scalar call")
        return self.scalar_values.pop(0)

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def flush(self) -> None:
        self.flushed = True
        for instance in self.added:
            if getattr(instance, "id", None) is None:
                cast(User | StaffMembership | AuditEvent, instance).id = uuid.uuid4()

    def commit(self) -> None:
        self.committed = True


def test_load_bootstrap_input_from_env_defaults_to_fctc(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", " admin@example.test ")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_DISPLAY_NAME", " Pascal ")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "secure-password-123")
    monkeypatch.delenv("BOOTSTRAP_ORGANIZATION_SLUG", raising=False)

    bootstrap = load_bootstrap_input_from_env()

    assert bootstrap.organization_slug == "fc-thusis-cazis"
    assert bootstrap.email == "admin@example.test"
    assert bootstrap.display_name == "Pascal"
    assert bootstrap.password == "secure-password-123"


def test_load_bootstrap_input_from_env_requires_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BOOTSTRAP_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_DISPLAY_NAME", raising=False)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_PASSWORD", raising=False)

    with pytest.raises(BootstrapAdminError, match="BOOTSTRAP_ADMIN_EMAIL"):
        load_bootstrap_input_from_env()


def test_bootstrap_admin_creates_active_admin_user_and_membership() -> None:
    organization = _organization()
    db = FakeSession([organization, None, None])

    result = bootstrap_admin(cast(Session, db), _input())

    user = _only_added(db, User)
    membership = _only_added(db, StaffMembership)
    audit_event = _only_added(db, AuditEvent)
    assert user.email_normalized == "admin@example.test"
    assert user.display_name == "Pascal"
    assert user.status == UserStatus.ACTIVE
    assert user.email_verified_at is not None
    assert user.password_hash is not None
    assert verify_password("secure-password-123", user.password_hash)
    assert membership.organization_id == organization.id
    assert membership.user_id == user.id
    assert membership.role == StaffRole.ADMIN
    assert membership.active is True
    assert audit_event.action == "ADMIN_BOOTSTRAPPED"
    assert audit_event.event_metadata["created_user"] is True
    assert result.created_user is True
    assert result.created_membership is True
    assert db.committed


def test_bootstrap_admin_updates_invited_user_and_inactive_membership() -> None:
    organization = _organization()
    user = _user(status=UserStatus.INVITED, display_name=None)
    membership = StaffMembership(
        id=uuid.uuid4(),
        organization_id=organization.id,
        user_id=user.id,
        role=StaffRole.KIOSK,
        active=False,
    )
    db = FakeSession([organization, user, membership])

    result = bootstrap_admin(cast(Session, db), _input())

    assert user.status == UserStatus.ACTIVE
    assert user.display_name == "Pascal"
    assert user.password_hash is not None
    assert verify_password("secure-password-123", user.password_hash)
    assert membership.role == StaffRole.ADMIN
    assert membership.active is True
    assert result.created_user is False
    assert result.created_membership is False
    assert db.committed


def test_bootstrap_admin_refuses_disabled_user() -> None:
    db = FakeSession([_organization(), _user(status=UserStatus.DISABLED)])

    with pytest.raises(BootstrapAdminError, match="disabled user"):
        bootstrap_admin(cast(Session, db), _input())


def test_bootstrap_admin_rejects_missing_organization() -> None:
    db = FakeSession([None])

    with pytest.raises(BootstrapAdminError, match="organization not found"):
        bootstrap_admin(cast(Session, db), _input())


def test_bootstrap_admin_enforces_password_policy() -> None:
    db = FakeSession([_organization(), None, None])

    with pytest.raises(PasswordPolicyError):
        bootstrap_admin(cast(Session, db), _input(password="too-short"))


def _input(password: str = "secure-password-123") -> BootstrapAdminInput:
    return BootstrapAdminInput(
        organization_slug="fc-thusis-cazis",
        email=" Admin@Example.Test ",
        display_name="Pascal",
        password=password,
    )


def _organization() -> Organization:
    theme = Theme(id=uuid.uuid4(), name="Theme")
    return Organization(
        id=uuid.uuid4(),
        theme_id=theme.id,
        theme=theme,
        name="FC Thusis-Cazis",
        slug="fc-thusis-cazis",
        timezone="Europe/Zurich",
        locale="de-CH",
        language="de",
        currency="CHF",
    )


def _user(status: UserStatus, display_name: str | None = "Existing Admin") -> User:
    return User(
        id=uuid.uuid4(),
        email_normalized="admin@example.test",
        display_name=display_name,
        password_hash=None,
        status=status,
        email_verified_at=datetime.now(UTC),
    )


def _only_added[T](db: FakeSession, expected_type: type[T]) -> T:
    matches = [item for item in db.added if isinstance(item, expected_type)]
    assert len(matches) == 1
    return matches[0]
