"""Tenant-scoped, review-only external kiosk staging and comparison."""

import hashlib
import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.external_kiosk import (
    ExternalKioskBatch,
    ExternalKioskCategory,
    ExternalKioskReviewState,
    ExternalKioskRow,
)
from app.models.identity import AuditEvent
from app.models.organization import Organization
from app.schemas.external_kiosk import (
    ComparisonStatus,
    ExternalKioskComparisonItem,
    ExternalKioskRowResponse,
)
from app.services.external_kiosk_parser import ExternalKioskParseError, parse_external_kiosk_plan
from app.services.proposals import ProposalService


class ExternalKioskNotFoundError(Exception):
    pass


class ExternalKioskValidationError(Exception):
    pass


class ExternalKioskConflictError(Exception):
    pass


class ExternalKioskService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def stage(self, filename: str, content: bytes, actor_id: uuid.UUID) -> ExternalKioskBatch:
        digest = hashlib.sha256(content).hexdigest()
        existing = self.db.scalar(
            select(ExternalKioskBatch).where(
                ExternalKioskBatch.organization_id == self.organization_id,
                ExternalKioskBatch.content_sha256 == digest,
            )
        )
        if existing is not None:
            return existing
        try:
            parsed = parse_external_kiosk_plan(content)
        except ExternalKioskParseError as error:
            raise ExternalKioskValidationError(str(error)) from error
        batch = ExternalKioskBatch(
            organization_id=self.organization_id,
            source_filename=filename[:255],
            source_sheet=parsed[0].sheet_name,
            content_sha256=digest,
            uploaded_by_user_id=actor_id,
            row_count=len(parsed),
        )
        self.db.add(batch)
        self.db.flush()
        for item in parsed:
            self.db.add(
                ExternalKioskRow(
                    batch_id=batch.id,
                    source_row=item.source_row,
                    plan_date=item.plan_date,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    category=ExternalKioskCategory(item.category.value),
                    assigned_person_text=item.assigned_person_text,
                    source_note=item.source_note,
                    raw_date=item.raw_date,
                    raw_time=item.raw_time,
                )
            )
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_id,
                action="EXTERNAL_KIOSK_PLAN_STAGED",
                entity_type="external_kiosk_batch",
                entity_id=batch.id,
                event_metadata={"content_sha256": digest, "row_count": len(parsed)},
            )
        )
        try:
            self.db.commit()
        except IntegrityError as error:
            self.db.rollback()
            raise ExternalKioskConflictError(
                "Die Arbeitsmappe wurde bereits importiert."
            ) from error
        self.db.refresh(batch)
        return batch

    def get(self, batch_id: uuid.UUID) -> tuple[ExternalKioskBatch, list[ExternalKioskRow]]:
        batch = self._batch(batch_id)
        rows = list(
            self.db.scalars(
                select(ExternalKioskRow)
                .where(ExternalKioskRow.batch_id == batch.id)
                .order_by(
                    ExternalKioskRow.plan_date, ExternalKioskRow.source_row, ExternalKioskRow.id
                )
            )
        )
        return batch, rows

    def latest(self) -> ExternalKioskBatch | None:
        return self.db.scalar(
            select(ExternalKioskBatch)
            .where(ExternalKioskBatch.organization_id == self.organization_id)
            .order_by(ExternalKioskBatch.uploaded_at.desc(), ExternalKioskBatch.id.desc())
            .limit(1)
        )

    def compare(self, batch_id: uuid.UUID) -> list[ExternalKioskComparisonItem]:
        _, rows = self.get(batch_id)
        organization = self.db.get(Organization, self.organization_id)
        if organization is None:
            raise ExternalKioskNotFoundError("organization not found")
        timezone = ZoneInfo(organization.timezone)
        proposals = ProposalService(self.db, self.organization_id).list_windows()
        unmatched = set(row.id for row in rows)
        result: list[ExternalKioskComparisonItem] = []
        for proposal in proposals:
            categories = [ExternalKioskCategory.KIOSK]
            if proposal.grill_required:
                categories.append(ExternalKioskCategory.GRILL)
            for category in categories:
                same_day = [
                    row
                    for row in rows
                    if row.plan_date == proposal.date and row.category == category
                ]
                coverage = [row for row in same_day if row.assigned_person_text is None]
                compared = coverage or same_day
                overlaps = [
                    row
                    for row in compared
                    if self._overlaps(row, proposal.start_at, proposal.end_at, timezone)
                ]
                row = overlaps[0] if overlaps else (compared[0] if compared else None)
                statuses = (
                    [ComparisonStatus.MATCH]
                    if overlaps
                    else [
                        ComparisonStatus.TIME_MISMATCH
                        if same_day
                        else ComparisonStatus.MISSING_IN_EXTERNAL
                    ]
                )
                for source_row in same_day:
                    unmatched.discard(source_row.id)
                if any(source_row.assigned_person_text for source_row in same_day):
                    statuses.append(ComparisonStatus.PERSON_ASSIGNMENT_PRESENT)
                result.append(
                    ExternalKioskComparisonItem(
                        proposal_window_id=proposal.id,
                        proposal=proposal,
                        external_row=ExternalKioskRowResponse.model_validate(row) if row else None,
                        category=category,
                        statuses=statuses,
                    )
                )
        for row in rows:
            if row.id in unmatched:
                result.append(
                    ExternalKioskComparisonItem(
                        proposal_window_id=None,
                        proposal=None,
                        external_row=ExternalKioskRowResponse.model_validate(row),
                        category=row.category,
                        statuses=[ComparisonStatus.EXTRA_IN_EXTERNAL]
                        + (
                            [ComparisonStatus.PERSON_ASSIGNMENT_PRESENT]
                            if row.assigned_person_text
                            else []
                        ),
                    )
                )
        return result

    def review(
        self,
        batch_id: uuid.UUID,
        row_id: uuid.UUID,
        state: ExternalKioskReviewState,
        note: str | None,
        actor_id: uuid.UUID,
    ) -> ExternalKioskRow:
        batch = self._batch(batch_id)
        row = self.db.scalar(
            select(ExternalKioskRow).where(
                ExternalKioskRow.id == row_id, ExternalKioskRow.batch_id == batch.id
            )
        )
        if row is None:
            raise ExternalKioskNotFoundError("external kiosk row not found")
        normalized_note = note.strip() if note else None
        if row.review_state == state and row.review_note == normalized_note:
            return row
        row.review_state = state
        row.review_note = normalized_note
        row.acknowledged = state != ExternalKioskReviewState.PENDING
        row.acknowledged_by_user_id = actor_id if row.acknowledged else None
        row.acknowledged_at = datetime.now(UTC) if row.acknowledged else None
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_id,
                action="EXTERNAL_KIOSK_ROW_REVIEWED",
                entity_type="external_kiosk_row",
                entity_id=row.id,
                event_metadata={
                    "review_state": state.value,
                    "note_present": normalized_note is not None,
                },
            )
        )
        self.db.commit()
        self.db.refresh(row)
        return row

    def cleanup(self, batch_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        batch = self._batch(batch_id)
        event = AuditEvent(
            organization_id=self.organization_id,
            actor_user_id=actor_id,
            action="EXTERNAL_KIOSK_PLAN_DELETED",
            entity_type="external_kiosk_batch",
            entity_id=batch.id,
            event_metadata={"content_sha256": batch.content_sha256},
        )
        self.db.delete(batch)
        self.db.add(event)
        self.db.commit()

    def _batch(self, batch_id: uuid.UUID) -> ExternalKioskBatch:
        batch = self.db.scalar(
            select(ExternalKioskBatch).where(
                ExternalKioskBatch.id == batch_id,
                ExternalKioskBatch.organization_id == self.organization_id,
            )
        )
        if batch is None:
            raise ExternalKioskNotFoundError("external kiosk batch not found")
        return batch

    @staticmethod
    def _overlaps(
        row: ExternalKioskRow, starts_at: datetime, ends_at: datetime, timezone: ZoneInfo
    ) -> bool:
        if row.start_time is None or row.end_time is None:
            return False
        external_start = datetime.combine(row.plan_date, row.start_time, timezone)
        external_end = datetime.combine(row.plan_date, row.end_time, timezone)
        return external_start < ends_at and starts_at < external_end
