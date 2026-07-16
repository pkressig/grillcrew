"""Tests for the core identity Alembic migration."""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType
from typing import Protocol

import pytest


class NamedEnumLike(Protocol):
    name: str


def test_core_identity_migration_creates_expected_tables_and_indexes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    _disable_enum_ddl(monkeypatch, migration)

    migration.upgrade()

    assert fake_op.created_tables == ["user", "staff_membership", "audit_event"]
    assert fake_op.created_indexes["ix_user_email_normalized"].unique is True
    assert fake_op.created_indexes["ix_user_email_normalized"].columns == ["email_normalized"]
    assert fake_op.created_indexes["ix_staff_membership_organization_user"].columns == [
        "organization_id",
        "user_id",
    ]
    assert fake_op.created_indexes["ix_staff_membership_organization_role"].columns == [
        "organization_id",
        "role",
        "active",
    ]

    active_unique = fake_op.created_indexes["uq_staff_membership_active_organization_user"]
    assert active_unique.unique is True
    assert active_unique.columns == ["organization_id", "user_id"]
    assert str(active_unique.kwargs["postgresql_where"]) == "active"

    assert fake_op.created_indexes["ix_audit_event_organization_created_at"].columns == [
        "organization_id",
        "created_at",
    ]
    assert fake_op.created_indexes["ix_audit_event_entity"].columns == ["entity_type", "entity_id"]


def test_core_identity_migration_downgrade_drops_tables_indexes_and_enums(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    enum_drops = _disable_enum_ddl(monkeypatch, migration)

    migration.downgrade()

    assert fake_op.dropped_indexes == [
        "ix_audit_event_entity",
        "ix_audit_event_organization_created_at",
        "uq_staff_membership_active_organization_user",
        "ix_staff_membership_organization_role",
        "ix_staff_membership_organization_user",
        "ix_user_email_normalized",
    ]
    assert fake_op.dropped_tables == ["audit_event", "staff_membership", "user"]
    assert enum_drops == ["staff_role", "platform_role", "user_status"]


class CreatedIndex:
    def __init__(
        self,
        name: str,
        columns: Sequence[str],
        unique: bool,
        kwargs: dict[str, object],
    ) -> None:
        self.name = name
        self.columns = list(columns)
        self.unique = unique
        self.kwargs = kwargs


class FakeOp:
    def __init__(self) -> None:
        self.created_tables: list[str] = []
        self.dropped_tables: list[str] = []
        self.created_indexes: dict[str, CreatedIndex] = {}
        self.dropped_indexes: list[str] = []

    def get_bind(self) -> object:
        return object()

    def create_table(self, name: str, *_args: object, **_kwargs: object) -> None:
        self.created_tables.append(name)

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)

    def create_index(
        self,
        name: str,
        _table_name: str,
        columns: Sequence[str],
        unique: bool = False,
        **kwargs: object,
    ) -> None:
        self.created_indexes[name] = CreatedIndex(name, columns, unique, kwargs)

    def drop_index(self, name: str, **_kwargs: object) -> None:
        self.dropped_indexes.append(name)


def _load_migration() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0003_core_identity_models.py"
    spec = importlib.util.spec_from_file_location("core_identity_migration", path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load core identity migration")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _disable_enum_ddl(monkeypatch: pytest.MonkeyPatch, migration: ModuleType) -> list[str]:
    enum_drops: list[str] = []

    def no_create(_bind: object, checkfirst: bool = False) -> None:
        assert checkfirst is True

    def record_drop(self: NamedEnumLike, _bind: object, checkfirst: bool = False) -> None:
        assert checkfirst is True
        enum_drops.append(self.name)

    for enum_name in ("USER_STATUS", "PLATFORM_ROLE", "STAFF_ROLE"):
        enum = getattr(migration, enum_name)
        monkeypatch.setattr(enum, "create", no_create)
        monkeypatch.setattr(enum, "drop", record_drop.__get__(enum, type(enum)))

    return enum_drops
