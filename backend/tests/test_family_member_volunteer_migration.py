"""Migration coverage for optional family-member volunteer links."""

import importlib.util
from pathlib import Path
from types import ModuleType


class FakeOp:
    def __init__(self) -> None:
        self.added: list[tuple[str, str, bool]] = []
        self.foreign_keys: list[tuple[object, ...]] = []
        self.indexes: list[tuple[str, str, list[str], bool]] = []
        self.dropped: list[tuple[str, str]] = []

    def add_column(self, table: str, column: object) -> None:
        self.added.append((table, column.name, column.nullable))  # type: ignore[attr-defined]

    def create_foreign_key(self, *args: object, **_kwargs: object) -> None:
        self.foreign_keys.append(args)

    def create_index(self, name: str, table: str, columns: list[str], unique: bool) -> None:
        self.indexes.append((name, table, columns, unique))

    def drop_index(self, name: str, table_name: str) -> None:
        self.dropped.append(("index", name))

    def drop_constraint(self, name: str, _table: str, type_: str) -> None:
        self.dropped.append((type_, name))

    def drop_column(self, table: str, column: str) -> None:
        self.dropped.append((table, column))


def _load() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0013_family_member_volunteer.py"
    spec = importlib.util.spec_from_file_location("family_member_volunteer_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_is_nullable_without_backfill_and_downgrade_reverses(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    migration = _load()
    fake = FakeOp()
    monkeypatch.setattr(migration, "op", fake)
    migration.upgrade()
    assert fake.added == [("family_member", "volunteer_id", True)]
    assert fake.foreign_keys == [
        (
            "fk_family_member_volunteer_id_volunteer",
            "family_member",
            "volunteer",
            ["volunteer_id"],
            ["id"],
        )
    ]
    assert fake.indexes == [
        ("ix_family_member_volunteer_id", "family_member", ["volunteer_id"], False)
    ]
    migration.downgrade()
    assert fake.dropped == [
        ("index", "ix_family_member_volunteer_id"),
        ("foreignkey", "fk_family_member_volunteer_id_volunteer"),
        ("family_member", "volunteer_id"),
    ]
