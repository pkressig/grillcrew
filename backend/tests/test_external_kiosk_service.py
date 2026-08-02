from types import SimpleNamespace
from typing import cast
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.external_kiosk import ExternalKioskBatch
from app.models.identity import AuditEvent
from app.services.external_kiosk import ExternalKioskService


class FakeDb:
    def __init__(self, scalar_value: object) -> None:
        self.scalar_value = scalar_value
        self.deleted: list[object] = []
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, _statement: object) -> object:
        return self.scalar_value

    def delete(self, value: object) -> None:
        self.deleted.append(value)

    def add(self, value: object) -> None:
        self.added.append(value)

    def commit(self) -> None:
        self.commits += 1


def test_reupload_same_content_is_idempotent_and_does_not_write() -> None:
    organization_id = uuid4()
    existing = cast(
        ExternalKioskBatch,
        SimpleNamespace(id=uuid4(), organization_id=organization_id),
    )
    db = FakeDb(existing)
    service = ExternalKioskService(cast(Session, db), organization_id)

    result = service.stage("renamed.xlsx", b"same-content", uuid4())

    assert result is existing
    assert db.added == []
    assert db.commits == 0


def test_cleanup_cascades_batch_rows_and_retains_audit_event() -> None:
    organization_id = uuid4()
    batch = cast(
        ExternalKioskBatch,
        SimpleNamespace(id=uuid4(), organization_id=organization_id, content_sha256="a" * 64),
    )
    db = FakeDb(batch)
    service = ExternalKioskService(cast(Session, db), organization_id)

    service.cleanup(batch.id, uuid4())

    assert db.deleted == [batch]
    assert len(db.added) == 1
    audit = cast(AuditEvent, db.added[0])
    assert audit.action == "EXTERNAL_KIOSK_PLAN_DELETED"
    assert db.commits == 1
