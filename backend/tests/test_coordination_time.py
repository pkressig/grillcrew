from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.coordination_time import CoordinationTimeRecord
from app.models.identity import AuditEvent
from app.models.work_record import PayoutStatus
from app.schemas.coordination_time import CoordinationTimeStatusUpdate, CoordinationTimeWrite
from app.services.coordination_time import (
    CoordinationTimeConflictError,
    CoordinationTimeNotFoundError,
    CoordinationTimeService,
)
from app.services.work_record import round_half_up_minor


def test_write_validation_and_amount_not_client_controlled() -> None:
    payload = CoordinationTimeWrite(
        work_date=date(2026, 8, 1), duration_minutes=1, hourly_rate_minor=870
    )
    assert payload.model_dump() == {
        "work_date": date(2026, 8, 1),
        "duration_minutes": 1,
        "hourly_rate_minor": 870,
        "note": None,
    }
    with pytest.raises(ValidationError):
        CoordinationTimeWrite.model_validate({**payload.model_dump(), "payout_amount_minor": 1})
    with pytest.raises(ValidationError):
        CoordinationTimeWrite(work_date=date(2026, 8, 1), duration_minutes=0, hourly_rate_minor=870)


def test_commercial_rounding_is_shared_with_work_records() -> None:
    assert round_half_up_minor(1, 870) == 15
    assert round_half_up_minor(1, 30) == 1


def test_status_schema_uses_work_record_semantics() -> None:
    payload = CoordinationTimeStatusUpdate(payout_status=PayoutStatus.APPROVED)
    assert payload.payout_status == PayoutStatus.APPROVED


def test_service_lookup_is_tenant_scoped() -> None:
    class Db:
        def scalar(self, statement: object) -> None:
            sql = str(statement)
            assert "coordination_time_record.organization_id" in sql
            return None

    service = CoordinationTimeService(Db(), __import__("uuid").uuid4())  # type: ignore[arg-type]
    with pytest.raises(CoordinationTimeNotFoundError):
        service.update_status(
            __import__("uuid").uuid4(),
            CoordinationTimeStatusUpdate(payout_status=PayoutStatus.APPROVED),
            __import__("uuid").uuid4(),
        )


def test_invalid_transition_error_is_explicit() -> None:
    error = CoordinationTimeConflictError("invalid payout status transition: OPEN -> PAID")
    assert "OPEN -> PAID" in str(error)


class FakeDb:
    def __init__(self, scalar: CoordinationTimeRecord | None = None) -> None:
        self.result = scalar
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, _statement: object) -> CoordinationTimeRecord | None:
        return self.result

    def add(self, value: object) -> None:
        self.added.append(value)

    def flush(self) -> None:
        record = self.added[0]
        if isinstance(record, CoordinationTimeRecord):
            record.id = uuid4()

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _record: object) -> None:
        pass


def record(status: PayoutStatus = PayoutStatus.OPEN) -> CoordinationTimeRecord:
    now = datetime.now(UTC)
    return CoordinationTimeRecord(
        id=uuid4(),
        organization_id=uuid4(),
        work_date=date(2026, 8, 1),
        duration_minutes=60,
        hourly_rate_minor=900,
        payout_amount_minor=900,
        payout_status=status,
        note=None,
        signature_received_at=None,
        signature_received_by_user_id=None,
        signature_note=None,
        created_by_user_id=uuid4(),
        created_at=now,
        updated_at=now,
    )


def test_create_snapshots_own_rate_rounds_and_audits() -> None:
    db = FakeDb()
    organization_id = uuid4()
    service = CoordinationTimeService(db, organization_id)  # type: ignore[arg-type]
    created = service.create(
        CoordinationTimeWrite(
            work_date=date(2026, 8, 1), duration_minutes=1, hourly_rate_minor=870
        ),
        uuid4(),
    )
    assert created.organization_id == organization_id
    assert created.hourly_rate_minor == 870
    assert created.payout_amount_minor == 15
    assert created.payout_status == PayoutStatus.OPEN
    assert db.commits == 1
    assert isinstance(db.added[-1], AuditEvent)


def test_update_is_idempotent_and_approved_financials_are_locked() -> None:
    existing = record()
    db = FakeDb(existing)
    service = CoordinationTimeService(db, existing.organization_id)  # type: ignore[arg-type]
    unchanged = CoordinationTimeWrite(
        work_date=existing.work_date,
        duration_minutes=existing.duration_minutes,
        hourly_rate_minor=existing.hourly_rate_minor,
        note=existing.note,
    )
    assert service.update(existing.id, unchanged, uuid4()) is existing
    assert db.commits == 0
    existing.payout_status = PayoutStatus.APPROVED
    with pytest.raises(CoordinationTimeConflictError, match="locked"):
        service.update(existing.id, unchanged, uuid4())


def test_status_transitions_signature_audit_and_idempotency() -> None:
    existing = record()
    db = FakeDb(existing)
    actor_id = uuid4()
    now = datetime.now(UTC)
    service = CoordinationTimeService(db, existing.organization_id)  # type: ignore[arg-type]
    with pytest.raises(CoordinationTimeConflictError, match="OPEN -> PAID"):
        service.update_status(
            existing.id,
            CoordinationTimeStatusUpdate(payout_status=PayoutStatus.PAID),
            actor_id,
        )
    updated = service.update_status(
        existing.id,
        CoordinationTimeStatusUpdate(
            payout_status=PayoutStatus.APPROVED,
            mark_signature_received=True,
            signature_note="Papierliste",
        ),
        actor_id,
        now=now,
    )
    assert updated.signature_received_at == now
    assert updated.signature_received_by_user_id == actor_id
    assert updated.signature_note == "Papierliste"
    assert isinstance(db.added[-1], AuditEvent)
    assert db.commits == 1
    assert (
        service.update_status(
            existing.id,
            CoordinationTimeStatusUpdate(
                payout_status=PayoutStatus.APPROVED,
                signature_note="Papierliste",
            ),
            actor_id,
        )
        is existing
    )
    assert db.commits == 1
