"""Tests for the club year and season Alembic migration."""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa


def test_club_year_season_migration_creates_expected_tables_and_indexes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    _disable_enum_ddl(monkeypatch, migration)

    migration.upgrade()

    assert fake_op.created_tables == ["club_year", "season"]
    assert fake_op.created_indexes["ix_club_year_organization_dates"].columns == [
        "organization_id",
        "start_date",
        "end_date",
    ]
    assert fake_op.created_indexes["ix_season_club_year_dates"].columns == [
        "club_year_id",
        "start_date",
        "end_date",
    ]
    assert fake_op.check_constraint_names == [
        "ck_club_year_date_range",
        "ck_season_date_range",
    ]


def test_club_year_season_migration_downgrade_drops_tables_indexes_and_enums(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)
    enum_drops = _disable_enum_ddl(monkeypatch, migration)

    migration.downgrade()

    assert fake_op.dropped_indexes == [
        "ix_season_club_year_dates",
        "ix_club_year_organization_dates",
    ]
    assert fake_op.dropped_tables == ["season", "club_year"]
    assert enum_drops == ["season_type", "planning_status"]


class CreatedIndex:
    def __init__(self, name: str, columns: Sequence[str]) -> None:
        self.name = name
        self.columns = list(columns)


class FakeOp:
    def __init__(self) -> None:
        self.created_tables: list[str] = []
        self.dropped_tables: list[str] = []
        self.created_indexes: dict[str, CreatedIndex] = {}
        self.dropped_indexes: list[str] = []
        self.check_constraint_names: list[str] = []

    def get_bind(self) -> object:
        return object()

    def f(self, name: str) -> str:
        return name

    def create_table(self, name: str, *args: object, **_kwargs: object) -> None:
        self.created_tables.append(name)
        for arg in args:
            if isinstance(arg, sa.CheckConstraint):
                assert arg.name is not None
                self.check_constraint_names.append(str(arg.name))

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)

    def create_index(
        self,
        name: str,
        _table_name: str,
        columns: Sequence[str],
        **_kwargs: object,
    ) -> None:
        self.created_indexes[name] = CreatedIndex(name, columns)

    def drop_index(self, name: str, **_kwargs: object) -> None:
        self.dropped_indexes.append(name)


def _load_migration() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0007_club_year_season.py"
    spec = importlib.util.spec_from_file_location("club_year_season_migration", path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load club year season migration")
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

    for enum_name in ("PLANNING_STATUS", "SEASON_TYPE"):
        enum = getattr(migration, enum_name)
        monkeypatch.setattr(enum, "create", no_create)
        monkeypatch.setattr(enum, "drop", record_drop.__get__(enum, type(enum)))

    return enum_drops
