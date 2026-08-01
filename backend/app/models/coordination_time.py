"""ADMIN-only coordination time records (D-041 Phase 4B)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.work_record import PayoutStatus

if TYPE_CHECKING:
    from app.models.identity import User


class CoordinationTimeRecord(Base):
    """A private coordination payout record, independent of signups and WorkRecords."""

    __tablename__ = "coordination_time_record"
    __table_args__ = (
        Index("ix_coordination_time_record_organization_date", "organization_id", "work_date"),
        Index(
            "ix_coordination_time_record_organization_status", "organization_id", "payout_status"
        ),
        CheckConstraint("duration_minutes > 0", name="ck_coordination_time_duration_positive"),
        CheckConstraint(
            "hourly_rate_minor >= 0", name="ck_coordination_time_hourly_rate_non_negative"
        ),
        CheckConstraint(
            "payout_amount_minor >= 0", name="ck_coordination_time_amount_non_negative"
        ),
        CheckConstraint(
            "signature_received_at IS NOT NULL OR signature_received_by_user_id IS NULL",
            name="ck_coordination_time_signature_actor_requires_receipt",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    hourly_rate_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    payout_amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    payout_status: Mapped[PayoutStatus] = mapped_column(
        Enum(PayoutStatus, name="payout_status", create_type=False), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text)
    signature_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signature_received_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL")
    )
    signature_note: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    signature_received_by: Mapped[User | None] = relationship(
        foreign_keys=[signature_received_by_user_id]
    )
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
