"""Review-only staging records for external kiosk workbooks."""

import uuid
from datetime import date, datetime, time
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExternalKioskCategory(StrEnum):
    KIOSK = "KIOSK"
    GRILL = "GRILL"


class ExternalKioskReviewState(StrEnum):
    PENDING = "PENDING"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    OVERRIDDEN = "OVERRIDDEN"


class ExternalKioskBatch(Base):
    __tablename__ = "external_kiosk_batch"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "content_sha256", name="uq_external_kiosk_batch_org_hash"
        ),
        Index("ix_external_kiosk_batch_organization_uploaded", "organization_id", "uploaded_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_sheet: Mapped[str] = mapped_column(String(100), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    rows: Mapped[list["ExternalKioskRow"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan"
    )


class ExternalKioskRow(Base):
    __tablename__ = "external_kiosk_row"
    __table_args__ = (Index("ix_external_kiosk_row_batch_date", "batch_id", "plan_date"),)
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("external_kiosk_batch.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_row: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time | None]
    end_time: Mapped[time | None]
    category: Mapped[ExternalKioskCategory] = mapped_column(
        Enum(ExternalKioskCategory, name="external_kiosk_category"), nullable=False
    )
    assigned_person_text: Mapped[str | None] = mapped_column(Text)
    source_note: Mapped[str | None] = mapped_column(Text)
    raw_date: Mapped[str] = mapped_column(Text, nullable=False)
    raw_time: Mapped[str] = mapped_column(Text, nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    acknowledged_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL")
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_state: Mapped[ExternalKioskReviewState] = mapped_column(
        Enum(ExternalKioskReviewState, name="external_kiosk_review_state"),
        nullable=False,
        server_default=ExternalKioskReviewState.PENDING.value,
    )
    review_note: Mapped[str | None] = mapped_column(Text)
    batch: Mapped[ExternalKioskBatch] = relationship(back_populates="rows")
