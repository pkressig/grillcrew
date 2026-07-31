"""Retroactive child assignment and compensation classification (F015 Phase 4A, D-041)."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.family import FamilyMember
    from app.models.identity import User
    from app.models.planning import Signup, Volunteer


class CompensationType(StrEnum):
    WORK_HOURS = "WORK_HOURS"
    VOLUNTARY = "VOLUNTARY"
    PAYOUT = "PAYOUT"


class PayoutStatus(StrEnum):
    OPEN = "OPEN"
    APPROVED = "APPROVED"
    PAID = "PAID"


class WorkRecord(Base):
    """Per-signup child credit and compensation classification.

    Deliberately smaller than the full future F010 work record (no actualStart/actualEnd,
    breakMinutes, submittedByVolunteerAt, or source yet): D-041 Phase 4A only needs enough to
    classify a completed signup and, for PAYOUT, track the calculated amount and a manual
    paper-signature receipt note. Later F010 work can extend this table without breaking Phase 4A.
    """

    __tablename__ = "work_record"
    __table_args__ = (
        UniqueConstraint("signup_id", name="uq_work_record_signup_id"),
        Index("ix_work_record_organization_id", "organization_id"),
        Index("ix_work_record_credited_family_member_id", "credited_family_member_id"),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes >= 0",
            name="ck_work_record_duration_non_negative",
        ),
        CheckConstraint(
            "compensation_type <> 'PAYOUT' OR ("
            "duration_minutes IS NOT NULL AND duration_minutes > 0 "
            "AND payout_rate_minor_per_hour IS NOT NULL "
            "AND payout_amount_minor IS NOT NULL "
            "AND payout_status IS NOT NULL)",
            name="ck_work_record_payout_requires_fields",
        ),
        CheckConstraint(
            "compensation_type = 'PAYOUT' OR ("
            "payout_rate_minor_per_hour IS NULL "
            "AND payout_amount_minor IS NULL "
            "AND payout_status IS NULL)",
            name="ck_work_record_non_payout_has_no_payout_fields",
        ),
        CheckConstraint(
            "payout_status IS NOT NULL OR ("
            "signature_received_at IS NULL AND signature_confirmed_by_user_id IS NULL)",
            name="ck_work_record_signature_requires_payout",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    signup_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("signup.id", ondelete="CASCADE"), nullable=False
    )
    volunteer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("volunteer.id", ondelete="RESTRICT"), nullable=False
    )
    credited_family_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("family_member.id", ondelete="SET NULL"), nullable=True
    )
    compensation_type: Mapped[CompensationType] = mapped_column(
        Enum(CompensationType, name="compensation_type"), nullable=False
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payout_rate_minor_per_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payout_amount_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payout_status: Mapped[PayoutStatus | None] = mapped_column(
        Enum(PayoutStatus, name="payout_status"), nullable=True
    )
    signature_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signature_confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    signup: Mapped[Signup] = relationship()
    volunteer: Mapped[Volunteer] = relationship()
    credited_family_member: Mapped[FamilyMember | None] = relationship()
    signature_confirmed_by: Mapped[User | None] = relationship()
