"""Tests for the reversible signup cancellation metadata migration."""

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest


def test_migration_adds_and_removes_cancellation_columns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    migration.upgrade()
    assert fake_op.added == ["cancelled_at", "cancellation_reason"]
    migration.downgrade()
    assert fake_op.dropped == ["cancellation_reason", "cancelled_at"]


class FakeOp:
    def __init__(self) -> None:
        self.added: list[str] = []
        self.dropped: list[str] = []

    def add_column(self, _table: str, column: object) -> None:
        self.added.append(column.name)  # type: ignore[attr-defined]

    def drop_column(self, _table: str, name: str) -> None:
        self.dropped.append(name)


def _load_migration() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0010_signup_cancellation.py"
    spec = importlib.util.spec_from_file_location("signup_cancellation_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
