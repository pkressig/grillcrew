"""Migration coverage for F007 Step 1 family persistence."""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa


class FakeOp:
    def __init__(self) -> None:
        self.created_tables: list[tuple[str, tuple[object, ...]]] = []
        self.created_indexes: dict[str, list[str]] = {}
        self.dropped_indexes: list[str] = []
        self.dropped_tables: list[str] = []

    def get_bind(self) -> object:
        return object()

    def create_table(self, name: str, *args: object, **_kwargs: object) -> None:
        self.created_tables.append((name, args))

    def create_index(
        self, name: str, _table: str, columns: Sequence[str], **_kwargs: object
    ) -> None:
        self.created_indexes[name] = list(columns)

    def drop_index(self, name: str, **_kwargs: object) -> None:
        self.dropped_indexes.append(name)

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)


def _load() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0011_family.py"
    spec = importlib.util.spec_from_file_location("family_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_family_migration_upgrade_and_downgrade(monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load()
    fake_op = FakeOp()
    enum_calls: list[tuple[str, bool]] = []
    monkeypatch.setattr(migration, "op", fake_op)
    monkeypatch.setattr(
        migration.FAMILY_STATUS,
        "create",
        lambda _bind, checkfirst=False: enum_calls.append(("create", checkfirst)),
    )
    monkeypatch.setattr(
        migration.FAMILY_STATUS,
        "drop",
        lambda _bind, checkfirst=False: enum_calls.append(("drop", checkfirst)),
    )

    migration.upgrade()
    name, columns = fake_op.created_tables[0]
    assert name == "family"
    assert {column.name for column in columns if isinstance(column, sa.Column)} == {
        "id",
        "organization_id",
        "display_name",
        "status",
        "internal_note",
        "created_at",
        "updated_at",
    }
    assert fake_op.created_indexes == {
        "ix_family_organization_status": ["organization_id", "status"]
    }

    migration.downgrade()
    assert fake_op.dropped_indexes == ["ix_family_organization_status"]
    assert fake_op.dropped_tables == ["family"]
    assert enum_calls == [("create", True), ("drop", True)]
