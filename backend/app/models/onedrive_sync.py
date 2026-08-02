"""Read-only OneDrive workbook source configuration and immutable run history."""

from __future__ import annotations

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
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.planning import ImportBatch


class OneDriveSyncStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    SKIPPED_UNCHANGED = "SKIPPED_UNCHANGED"


class OneDriveSyncConfig(Base):
    __tablename__ = "onedrive_sync_config"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_onedrive_sync_config_org"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    club_year_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("club_year.id", ondelete="RESTRICT"), nullable=False
    )
    scheduler_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    daily_time: Mapped[time] = mapped_column(Time, nullable=False, server_default="03:00:00")
    import_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    import_end_date: Mapped[date | None] = mapped_column(Date)
    future_only: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class OneDriveSyncRun(Base):
    __tablename__ = "onedrive_sync_run"
    __table_args__ = (
        Index("ix_onedrive_sync_run_org_started", "organization_id", "started_at"),
        Index(
            "uq_onedrive_sync_run_success_idempotency",
            "config_id",
            "content_sha256",
            "effective_start_date",
            "effective_end_date",
            unique=True,
            postgresql_where=text("status IN ('RUNNING', 'SUCCESS')"),
        ),
        UniqueConstraint("config_id", "scheduled_date", name="uq_onedrive_sync_run_daily_claim"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("onedrive_sync_config.id", ondelete="RESTRICT"),
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    triggered_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL")
    )
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("import_batch.id", ondelete="SET NULL")
    )
    status: Mapped[OneDriveSyncStatus] = mapped_column(
        Enum(OneDriveSyncStatus, name="onedrive_sync_status"), nullable=False
    )
    source_filename: Mapped[str | None] = mapped_column(String(255))
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    effective_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    effective_end_date: Mapped[date | None] = mapped_column(Date)
    scheduled_date: Mapped[date | None] = mapped_column(Date)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    comparison_summary: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(String(1000))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    import_batch: Mapped[ImportBatch | None] = relationship()
