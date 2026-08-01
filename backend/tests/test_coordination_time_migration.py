import importlib.util
from pathlib import Path


def test_migration_reuses_status_enum_and_has_safe_chain() -> None:
    path = Path(__file__).parents[1] / "alembic" / "versions" / "0019_coordination_time_record.py"
    spec = importlib.util.spec_from_file_location("coordination_time_migration", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "0019"
    assert migration.down_revision == "0018"
    assert migration.PAYOUT_STATUS.create_type is False
