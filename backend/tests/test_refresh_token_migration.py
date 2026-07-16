"""Tests for the refresh token Alembic migration."""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

import pytest


def test_refresh_token_migration_creates_expected_table_and_indexes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)

    migration.upgrade()

    assert fake_op.created_tables == ["refresh_token"]
    assert fake_op.created_indexes["ix_refresh_token_token_hash"].unique is True
    assert fake_op.created_indexes["ix_refresh_token_token_hash"].columns == ["token_hash"]
    assert fake_op.created_indexes["ix_refresh_token_family_id"].columns == ["family_id"]
    assert fake_op.created_indexes["ix_refresh_token_user_id"].columns == ["user_id"]


def test_refresh_token_migration_downgrade_drops_indexes_and_table(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)

    migration.downgrade()

    assert fake_op.dropped_indexes == [
        "ix_refresh_token_user_id",
        "ix_refresh_token_family_id",
        "ix_refresh_token_token_hash",
    ]
    assert fake_op.dropped_tables == ["refresh_token"]


class CreatedIndex:
    def __init__(
        self,
        name: str,
        columns: Sequence[str],
        unique: bool,
    ) -> None:
        self.name = name
        self.columns = list(columns)
        self.unique = unique


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
        **_kwargs: object,
    ) -> None:
        self.created_indexes[name] = CreatedIndex(name, columns, unique)

    def drop_index(self, name: str, **_kwargs: object) -> None:
        self.dropped_indexes.append(name)


def _load_migration() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0004_refresh_token.py"
    spec = importlib.util.spec_from_file_location("refresh_token_migration", path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load refresh token migration")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
