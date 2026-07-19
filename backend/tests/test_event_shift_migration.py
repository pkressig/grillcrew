"""Tests for the event and shift Alembic migration."""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa


def test_migration_creates_expected_tables_indexes_and_constraints(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    _disable_enum_ddl(monkeypatch, migration)
    migration.upgrade()
    assert fake_op.created_tables == ["event", "shift"]
    assert fake_op.created_indexes == {
        "ix_event_season_date": ["season_id", "date"],
        "ix_shift_event_order": ["event_id", "sort_order", "starts_at"],
    }
    assert fake_op.check_constraint_names == [
        "ck_shift_time_range",
        "ck_shift_required_volunteers_positive",
    ]


def test_migration_downgrade_drops_in_safe_order(monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    enum_drops = _disable_enum_ddl(monkeypatch, migration)
    migration.downgrade()
    assert fake_op.dropped_indexes == ["ix_shift_event_order", "ix_event_season_date"]
    assert fake_op.dropped_tables == ["shift", "event"]
    assert enum_drops == ["shift_status", "event_status"]


class FakeOp:
    def __init__(self) -> None:
        self.created_tables: list[str] = []
        self.dropped_tables: list[str] = []
        self.created_indexes: dict[str, list[str]] = {}
        self.dropped_indexes: list[str] = []
        self.check_constraint_names: list[str] = []

    def get_bind(self) -> object:
        return object()

    def f(self, name: str) -> str:
        return name

    def create_table(self, name: str, *args: object, **_kwargs: object) -> None:
        self.created_tables.append(name)
        self.check_constraint_names.extend(
            str(arg.name) for arg in args if isinstance(arg, sa.CheckConstraint)
        )

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)

    def create_index(
        self, name: str, _table: str, columns: Sequence[str], **_kwargs: object
    ) -> None:
        self.created_indexes[name] = list(columns)

    def drop_index(self, name: str, **_kwargs: object) -> None:
        self.dropped_indexes.append(name)


def _load_migration() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0008_event_shift.py"
    spec = importlib.util.spec_from_file_location("event_shift_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _disable_enum_ddl(monkeypatch: pytest.MonkeyPatch, migration: ModuleType) -> list[str]:
    enum_drops: list[str] = []

    def no_create(_bind: object, checkfirst: bool = False) -> None:
        assert checkfirst is True

    def record_drop(self: object, _bind: object, checkfirst: bool = False) -> None:
        assert checkfirst is True
        enum_drops.append(self.name)  # type: ignore[attr-defined]

    for enum_name in ("EVENT_STATUS", "SHIFT_STATUS"):
        enum = getattr(migration, enum_name)
        monkeypatch.setattr(enum, "create", no_create)
        monkeypatch.setattr(enum, "drop", record_drop.__get__(enum, type(enum)))
    return enum_drops
