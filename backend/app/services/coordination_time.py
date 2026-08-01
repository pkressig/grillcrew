"""Tenant-scoped coordination-time business rules."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.coordination_time import CoordinationTimeRecord
from app.models.identity import AuditEvent
from app.models.work_record import PayoutStatus
from app.schemas.coordination_time import CoordinationTimeStatusUpdate, CoordinationTimeWrite
from app.services.work_record import PAYOUT_TRANSITIONS, round_half_up_minor


class CoordinationTimeNotFoundError(Exception):
    pass


class CoordinationTimeConflictError(Exception):
    pass


class CoordinationTimeService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def list(self) -> list[CoordinationTimeRecord]:
        return list(
            self.db.scalars(
                select(CoordinationTimeRecord)
                .where(CoordinationTimeRecord.organization_id == self.organization_id)
                .order_by(
                    CoordinationTimeRecord.work_date.desc(),
                    CoordinationTimeRecord.created_at.desc(),
                )
            )
        )

    def create(
        self, payload: CoordinationTimeWrite, actor_user_id: uuid.UUID
    ) -> CoordinationTimeRecord:
        record = CoordinationTimeRecord(
            organization_id=self.organization_id,
            work_date=payload.work_date,
            duration_minutes=payload.duration_minutes,
            hourly_rate_minor=payload.hourly_rate_minor,
            payout_amount_minor=round_half_up_minor(
                payload.duration_minutes, payload.hourly_rate_minor
            ),
            payout_status=PayoutStatus.OPEN,
            note=payload.note,
            created_by_user_id=actor_user_id,
        )
        self.db.add(record)
        self.db.flush()
        self._audit("COORDINATION_TIME_CREATED", record, actor_user_id, {})
        self.db.commit()
        self.db.refresh(record)
        return record

    def update(
        self, record_id: uuid.UUID, payload: CoordinationTimeWrite, actor_user_id: uuid.UUID
    ) -> CoordinationTimeRecord:
        record = self._get(record_id)
        if record.payout_status != PayoutStatus.OPEN:
            raise CoordinationTimeConflictError("approved or paid coordination time is locked")
        next_values = (
            payload.work_date,
            payload.duration_minutes,
            payload.hourly_rate_minor,
            payload.note,
        )
        current_values = (
            record.work_date,
            record.duration_minutes,
            record.hourly_rate_minor,
            record.note,
        )
        if next_values == current_values:
            return record
        previous_amount = record.payout_amount_minor
        record.work_date = payload.work_date
        record.duration_minutes = payload.duration_minutes
        record.hourly_rate_minor = payload.hourly_rate_minor
        record.payout_amount_minor = round_half_up_minor(
            payload.duration_minutes, payload.hourly_rate_minor
        )
        record.note = payload.note
        self._audit(
            "COORDINATION_TIME_UPDATED",
            record,
            actor_user_id,
            {
                "previous_payout_amount_minor": previous_amount,
                "new_payout_amount_minor": record.payout_amount_minor,
            },
        )
        self.db.commit()
        self.db.refresh(record)
        return record

    def update_status(
        self,
        record_id: uuid.UUID,
        payload: CoordinationTimeStatusUpdate,
        actor_user_id: uuid.UUID,
        now: datetime | None = None,
    ) -> CoordinationTimeRecord:
        record = self._get(record_id)
        current = record.payout_status
        if (
            payload.payout_status != current
            and payload.payout_status not in PAYOUT_TRANSITIONS[current]
        ):
            raise CoordinationTimeConflictError(
                "invalid payout status transition: "
                f"{current.value} -> {payload.payout_status.value}"
            )
        signature_changed = payload.mark_signature_received and record.signature_received_at is None
        note_changed = payload.signature_note != record.signature_note
        status_changed = payload.payout_status != current
        if not (signature_changed or note_changed or status_changed):
            return record
        record.payout_status = payload.payout_status
        record.signature_note = payload.signature_note
        if signature_changed:
            record.signature_received_at = now or datetime.now(UTC)
            record.signature_received_by_user_id = actor_user_id
        self._audit(
            "COORDINATION_TIME_PAYOUT_STATUS_CHANGED",
            record,
            actor_user_id,
            {
                "previous_payout_status": current.value,
                "new_payout_status": payload.payout_status.value,
                "signature_received": signature_changed,
            },
        )
        self.db.commit()
        self.db.refresh(record)
        return record

    def _get(self, record_id: uuid.UUID) -> CoordinationTimeRecord:
        record = self.db.scalar(
            select(CoordinationTimeRecord).where(
                CoordinationTimeRecord.id == record_id,
                CoordinationTimeRecord.organization_id == self.organization_id,
            )
        )
        if record is None:
            raise CoordinationTimeNotFoundError
        return record

    def _audit(
        self,
        action: str,
        record: CoordinationTimeRecord,
        actor_user_id: uuid.UUID,
        metadata: dict[str, object],
    ) -> None:
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action=action,
                entity_type="coordination_time_record",
                entity_id=record.id,
                event_metadata=metadata,
            )
        )
