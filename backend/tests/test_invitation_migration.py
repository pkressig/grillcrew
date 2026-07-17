"""Tests for the invitation Alembic migration."""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

import pytest


def test_invitation_migration_creates_expected_table_and_indexes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)

    migration.upgrade()

    assert fake_op.created_tables == ["invitation"]
    assert fake_op.created_indexes["ix_invitation_token_hash"].unique
    assert fake_op.created_indexes["ix_invitation_organization_created_at"].columns == [
        "organization_id",
        "created_at",
    ]
    assert fake_op.created_indexes["ix_invitation_user_id"].columns == ["user_id"]
    pending = fake_op.created_indexes["uq_invitation_pending_organization_user"]
    assert pending.unique
    assert pending.has_postgresql_where


def test_invitation_migration_downgrade_drops_indexes_and_table(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)

    migration.downgrade()

    assert fake_op.dropped_tables == ["invitation"]
    assert fake_op.dropped_indexes[-1] == "ix_invitation_token_hash"


class CreatedIndex:
    def __init__(
        self,
        columns: Sequence[str],
        unique: bool,
        has_postgresql_where: bool,
    ) -> None:
        self.columns = list(columns)
        self.unique = unique
        self.has_postgresql_where = has_postgresql_where


class FakeOp:
    def __init__(self) -> None:
        self.created_tables: list[str] = []
        self.dropped_tables: list[str] = []
        self.created_indexes: dict[str, CreatedIndex] = {}
        self.dropped_indexes: list[str] = []

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
        self.created_indexes[name] = CreatedIndex(
            columns,
            unique,
            has_postgresql_where="postgresql_where" in kwargs,
        )

    def drop_index(self, name: str, **_kwargs: object) -> None:
        self.dropped_indexes.append(name)


def _load_migration() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0006_invitation.py"
    spec = importlib.util.spec_from_file_location("invitation_migration", path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load invitation migration")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
