"""Tests for the reversible volunteer/signup migration."""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

import pytest


def test_migration_upgrade_and_downgrade_order(monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    for enum_name in (
        "VOLUNTEER_STATUS",
        "SIGNUP_STATUS",
        "SIGNUP_OUTCOME",
        "SIGNUP_SOURCE",
    ):
        enum = getattr(migration, enum_name)
        monkeypatch.setattr(enum, "create", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(enum, "drop", lambda *_args, **_kwargs: None)
    migration.upgrade()
    assert fake_op.created_tables == ["volunteer", "signup"]
    assert set(fake_op.created_indexes) == {
        "ix_volunteer_organization_email",
        "ix_volunteer_organization_phone",
        "ix_signup_shift_status",
        "ix_signup_volunteer_shift",
    }
    migration.downgrade()
    assert fake_op.dropped_tables == ["signup", "volunteer"]


class FakeOp:
    def __init__(self) -> None:
        self.created_tables: list[str] = []
        self.created_indexes: list[str] = []
        self.dropped_tables: list[str] = []

    def get_bind(self) -> object:
        return object()

    def create_table(self, name: str, *_args: object, **_kwargs: object) -> None:
        self.created_tables.append(name)

    def create_index(
        self, name: str, _table: str, _columns: Sequence[str], **_kwargs: object
    ) -> None:
        self.created_indexes.append(name)

    def drop_index(self, _name: str, **_kwargs: object) -> None:
        pass

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)


def _load_migration() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0009_volunteer_signup.py"
    spec = importlib.util.spec_from_file_location("volunteer_signup_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
