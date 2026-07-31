"""Migration coverage for the work_record table (F015 Phase 4A)."""

import importlib.util
from pathlib import Path
from types import ModuleType


class FakeOp:
    def __init__(self) -> None:
        self.created_tables: list[tuple[str, list[str]]] = []
        self.created_indexes: list[tuple[str, str, list[str]]] = []
        self.dropped_indexes: list[str] = []
        self.dropped_tables: list[str] = []

    def create_table(self, name: str, *columns: object, **_kwargs: object) -> None:
        self.created_tables.append((name, [getattr(c, "name", str(c)) for c in columns]))

    def create_index(self, name: str, table: str, columns: list[str], **_kwargs: object) -> None:
        self.created_indexes.append((name, table, columns))

    def drop_index(self, name: str, table_name: str) -> None:
        self.dropped_indexes.append(name)

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)

    def get_bind(self) -> None:
        return None


def _load() -> ModuleType:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0018_work_record.py"
    spec = importlib.util.spec_from_file_location("work_record_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_creates_table_and_indexes_and_downgrade_reverses(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    migration = _load()
    fake = FakeOp()
    monkeypatch.setattr(migration, "op", fake)
    monkeypatch.setattr(migration.COMPENSATION_TYPE, "create", lambda *_a, **_k: None)
    monkeypatch.setattr(migration.PAYOUT_STATUS, "create", lambda *_a, **_k: None)

    migration.upgrade()

    assert fake.created_tables[0][0] == "work_record"
    created_columns = fake.created_tables[0][1]
    assert "signup_id" in created_columns
    assert "credited_family_member_id" in created_columns
    assert "compensation_type" in created_columns
    assert "payout_status" in created_columns
    assert "signature_received_at" in created_columns
    assert fake.created_indexes == [
        ("ix_work_record_organization_id", "work_record", ["organization_id"]),
        (
            "ix_work_record_credited_family_member_id",
            "work_record",
            ["credited_family_member_id"],
        ),
    ]

    monkeypatch.setattr(migration.COMPENSATION_TYPE, "drop", lambda *_a, **_k: None)
    monkeypatch.setattr(migration.PAYOUT_STATUS, "drop", lambda *_a, **_k: None)
    migration.downgrade()

    assert fake.dropped_indexes == [
        "ix_work_record_credited_family_member_id",
        "ix_work_record_organization_id",
    ]
    assert fake.dropped_tables == ["work_record"]


def test_revision_chain_follows_0017() -> None:
    migration = _load()
    assert migration.revision == "0018"
    assert migration.down_revision == "0017"
