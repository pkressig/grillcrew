"""Persisted manual adjustments to otherwise derived planning proposals."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ProposalOverride(Base):
    __tablename__ = "proposal_override"
    __table_args__ = (
        Index("ix_proposal_override_organization_date", "organization_id", "proposal_date"),
        UniqueConstraint(
            "organization_id", "window_key", name="uq_proposal_override_organization_window"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    window_key: Mapped[str] = mapped_column(String(64), nullable=False)
    proposal_date: Mapped[date] = mapped_column(Date, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    kiosk_open: Mapped[bool | None] = mapped_column(Boolean)
    grill_required: Mapped[bool | None] = mapped_column(Boolean)
    proposed_grill_slots: Mapped[int | None] = mapped_column(Integer)
    proposed_kiosk_slots: Mapped[int | None] = mapped_column(Integer)
    kiosk_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    grill_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    splits: Mapped[list["ProposalShiftSplit"]] = relationship(
        back_populates="proposal_override",
        cascade="all, delete-orphan",
        order_by="ProposalShiftSplit.sort_order",
    )


class ProposalShiftSplit(Base):
    """One admin-defined grill sub-shift within a proposal window.

    A window like "10:00-20:00, 3 games" derives a single grill headcount by
    default. When an admin instead wants e.g. two shorter shifts with their own
    times and headcounts, each becomes one row here; ProposalService.confirm()
    materialises one real Shift per row instead of the single window-wide shift.
    """

    __tablename__ = "proposal_shift_split"
    __table_args__ = (
        Index("ix_proposal_shift_split_override", "proposal_override_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    proposal_override_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposal_override.id", ondelete="CASCADE"), nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    required_volunteers: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    proposal_override: Mapped[ProposalOverride] = relationship(back_populates="splits")
