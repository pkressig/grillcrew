"""Retroactive child assignment and compensation classification (F015 Phase 4A, D-041)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.family import Family, FamilyMember, FamilyMemberType, FamilyStatus
from app.models.identity import AuditEvent
from app.models.planning import (
    ClubYear,
    Event,
    Season,
    Shift,
    Signup,
    SignupOutcome,
    SignupStatus,
)
from app.models.work_record import CompensationType, PayoutStatus, WorkRecord
from app.schemas.work_record import WorkRecordClassify, WorkRecordPayoutStatusUpdate
from app.services.settings import SettingsService

PAYOUT_TRANSITIONS = {
    PayoutStatus.OPEN: {PayoutStatus.APPROVED},
    PayoutStatus.APPROVED: {PayoutStatus.PAID},
    PayoutStatus.PAID: set(),
}


class WorkRecordNotFoundError(Exception):
    pass


class WorkRecordConflictError(Exception):
    pass


class WorkRecordValidationError(Exception):
    pass


def round_half_up_minor(duration_minutes: int, rate_minor_per_hour: int) -> int:
    """Commercial rounding to 1 Rappen, per BR-003/D-028."""
    exact = Decimal(duration_minutes) * Decimal(rate_minor_per_hour) / Decimal(60)
    return int(exact.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


class WorkRecordService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def get_for_signup(self, signup_id: uuid.UUID) -> WorkRecord:
        self._get_signup(signup_id)
        record = self._get_record(signup_id)
        if record is None:
            raise WorkRecordNotFoundError
        return record

    def classify(
        self, signup_id: uuid.UUID, payload: WorkRecordClassify, actor_user_id: uuid.UUID
    ) -> WorkRecord:
        signup = self._get_signup(signup_id)
        if signup.status != SignupStatus.ACTIVE or signup.outcome != SignupOutcome.ATTENDED:
            raise WorkRecordConflictError(
                "work-record classification requires an active signup marked as attended"
            )

        family_member_id = self._validate_family_member(payload.credited_family_member_id)
        existing = self._get_record(signup_id)
        if existing is not None and existing.payout_status in {
            PayoutStatus.APPROVED,
            PayoutStatus.PAID,
        }:
            raise WorkRecordConflictError(
                "classification cannot change once the payout has been approved or paid"
            )

        payout_rate: int | None = None
        payout_amount: int | None = None
        payout_status: PayoutStatus | None = None
        if payload.compensation_type == CompensationType.PAYOUT:
            payout_rate = (
                SettingsService(self.db, self.organization_id)
                .get_organization_settings()
                .payout_rate_minor_per_hour
            )
            payout_amount = round_half_up_minor(payload.duration_minutes or 0, payout_rate)
            payout_status = (
                existing.payout_status
                if existing is not None and existing.payout_status is not None
                else PayoutStatus.OPEN
            )

        if existing is not None:
            unchanged = (
                existing.compensation_type == payload.compensation_type
                and existing.credited_family_member_id == family_member_id
                and existing.duration_minutes == payload.duration_minutes
                and existing.note == payload.note
            )
            if unchanged:
                return existing
            previous_compensation_type: str | None = existing.compensation_type.value
            previous_family_member_id = existing.credited_family_member_id
            record = existing
        else:
            previous_compensation_type = None
            previous_family_member_id = None
            record = WorkRecord(
                organization_id=self.organization_id,
                signup_id=signup_id,
                volunteer_id=signup.volunteer_id,
            )
            self.db.add(record)

        record.compensation_type = payload.compensation_type
        record.credited_family_member_id = family_member_id
        record.duration_minutes = payload.duration_minutes
        record.note = payload.note
        record.payout_rate_minor_per_hour = payout_rate
        record.payout_amount_minor = payout_amount
        record.payout_status = payout_status
        if payload.compensation_type != CompensationType.PAYOUT:
            record.signature_received_at = None
            record.signature_confirmed_by_user_id = None

        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="WORK_RECORD_CLASSIFIED",
                entity_type="signup",
                entity_id=signup_id,
                event_metadata={
                    "previous_compensation_type": previous_compensation_type,
                    "new_compensation_type": payload.compensation_type.value,
                    "previous_credited_family_member_id": str(previous_family_member_id)
                    if previous_family_member_id
                    else None,
                    "new_credited_family_member_id": str(family_member_id)
                    if family_member_id
                    else None,
                },
            )
        )
        self.db.commit()
        self.db.refresh(record)
        return record

    def update_payout_status(
        self,
        signup_id: uuid.UUID,
        payload: WorkRecordPayoutStatusUpdate,
        actor_user_id: uuid.UUID,
        now: datetime | None = None,
    ) -> WorkRecord:
        self._get_signup(signup_id)
        record = self._get_record(signup_id)
        if record is None:
            raise WorkRecordNotFoundError
        if record.compensation_type != CompensationType.PAYOUT or record.payout_status is None:
            raise WorkRecordConflictError("payout status requires a PAYOUT classification")

        current = record.payout_status
        if (
            payload.payout_status != current
            and payload.payout_status not in PAYOUT_TRANSITIONS[current]
        ):
            raise WorkRecordConflictError(
                f"invalid payout status transition: {current.value} -> "
                f"{payload.payout_status.value}"
            )

        status_changed = payload.payout_status != current
        signature_changed = payload.mark_signature_received and record.signature_received_at is None
        if not status_changed and not signature_changed:
            return record

        record.payout_status = payload.payout_status
        if payload.mark_signature_received:
            record.signature_received_at = now or datetime.now(UTC)
            record.signature_confirmed_by_user_id = actor_user_id

        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="WORK_RECORD_PAYOUT_STATUS_CHANGED",
                entity_type="signup",
                entity_id=signup_id,
                event_metadata={
                    "previous_payout_status": current.value,
                    "new_payout_status": payload.payout_status.value,
                    "signature_received": payload.mark_signature_received,
                },
            )
        )
        self.db.commit()
        self.db.refresh(record)
        return record

    def _validate_family_member(self, family_member_id: uuid.UUID | None) -> uuid.UUID | None:
        if family_member_id is None:
            return None
        member = self.db.scalar(
            select(FamilyMember)
            .join(Family, FamilyMember.family_id == Family.id)
            .where(
                FamilyMember.id == family_member_id,
                FamilyMember.member_type == FamilyMemberType.CHILD,
                Family.organization_id == self.organization_id,
                Family.status == FamilyStatus.ACTIVE,
            )
        )
        if member is None:
            raise WorkRecordValidationError(
                "credited family member must be a child in this organization"
            )
        return member.id

    def _get_signup(self, signup_id: uuid.UUID) -> Signup:
        signup = self.db.scalar(
            select(Signup)
            .join(Shift)
            .join(Event)
            .join(Season)
            .join(ClubYear)
            .where(Signup.id == signup_id, ClubYear.organization_id == self.organization_id)
        )
        if signup is None:
            raise WorkRecordNotFoundError
        return signup

    def _get_record(self, signup_id: uuid.UUID) -> WorkRecord | None:
        return self.db.scalar(
            select(WorkRecord).where(
                WorkRecord.signup_id == signup_id,
                WorkRecord.organization_id == self.organization_id,
            )
        )
