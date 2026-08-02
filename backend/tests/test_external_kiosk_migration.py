import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

import pytest


def _load() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0021_external_kiosk_plan.py"
    spec = importlib.util.spec_from_file_location("external_kiosk_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeOp:
    def __init__(self) -> None:
        self.tables: list[str] = []
        self.indexes: list[str] = []
        self.dropped_tables: list[str] = []

    def get_bind(self) -> object:
        return object()

    def create_table(self, name: str, *_args: object, **_kwargs: object) -> None:
        self.tables.append(name)

    def create_index(self, name: str, _table: str, _columns: Sequence[str]) -> None:
        self.indexes.append(name)

    def drop_index(self, _name: str, **_kwargs: object) -> None:
        pass

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)


def test_external_kiosk_migration_upgrade_and_cleanup(monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load()
    fake = FakeOp()
    monkeypatch.setattr(migration, "op", fake)
    for enum_name in ("CATEGORY", "REVIEW_STATE"):
        enum = getattr(migration, enum_name)
        monkeypatch.setattr(enum, "create", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(enum, "drop", lambda *_args, **_kwargs: None)
    migration.upgrade()
    assert fake.tables == ["external_kiosk_batch", "external_kiosk_row"]
    assert fake.indexes == [
        "ix_external_kiosk_batch_organization_uploaded",
        "ix_external_kiosk_row_batch_date",
    ]
    migration.downgrade()
    assert fake.dropped_tables == ["external_kiosk_row", "external_kiosk_batch"]
