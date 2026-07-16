"""Tests for core identity ORM models."""

from typing import cast

from sqlalchemy import Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql.schema import Table

from app.models.identity import (
    AuditEvent,
    PlatformRole,
    StaffMembership,
    StaffRole,
    User,
    UserStatus,
)


def test_identity_enum_values_match_permission_documents() -> None:
    assert [status.value for status in UserStatus] == ["INVITED", "ACTIVE", "DISABLED"]
    assert [role.value for role in PlatformRole] == ["PLATFORM_OPERATOR"]
    assert [role.value for role in StaffRole] == [
        "ADMIN",
        "KOORDINATION",
        "KIOSK",
        "VORSTAND_LESEN",
    ]


def test_user_has_platform_wide_unique_normalized_email_and_nullable_password() -> None:
    table = cast(Table, User.__table__)

    assert table.c.email_normalized.nullable is False
    assert table.c.password_hash.nullable is True
    assert table.c.platform_role.nullable is True
    assert table.c.email_verified_at.nullable is True
    assert table.c.last_login_at.nullable is True
    assert _index(table.indexes, "ix_user_email_normalized").unique is True


def test_staff_membership_is_organization_scoped_with_active_unique_index() -> None:
    table = cast(Table, StaffMembership.__table__)

    assert table.c.organization_id.nullable is False
    assert table.c.user_id.nullable is False
    assert table.c.active.nullable is False
    assert table.c.scope.nullable is True

    active_unique = _index(table.indexes, "uq_staff_membership_active_organization_user")
    assert active_unique.unique is True
    assert str(active_unique.dialect_options["postgresql"]["where"]) == "active"
    assert ["organization_id", "user_id"] == [column.name for column in active_unique.columns]

    role_lookup = _index(table.indexes, "ix_staff_membership_organization_role")
    assert ["organization_id", "role", "active"] == [column.name for column in role_lookup.columns]


def test_audit_event_supports_platform_and_system_events_without_update_timestamp() -> None:
    table = cast(Table, AuditEvent.__table__)

    assert table.c.organization_id.nullable is True
    assert table.c.actor_user_id.nullable is True
    assert table.c.action.nullable is False
    assert table.c.entity_type.nullable is False
    assert table.c.entity_id.nullable is False
    assert isinstance(table.c.metadata.type, JSONB)
    assert "updated_at" not in table.c

    audit_lookup = _index(table.indexes, "ix_audit_event_organization_created_at")
    assert ["organization_id", "created_at"] == [column.name for column in audit_lookup.columns]


def _index(indexes: set[Index], name: str) -> Index:
    for index in indexes:
        if index.name == name:
            return index
    raise AssertionError(f"Missing index {name}")
