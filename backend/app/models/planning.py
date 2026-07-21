"""Organization-scoped club year, season, event, and shift planning models."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization


class PlanningStatus(StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    ARCHIVED = "ARCHIVED"


class SeasonType(StrEnum):
    AUTUMN = "AUTUMN"
    SPRING = "SPRING"
    OTHER = "OTHER"


class EventStatus(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    POSTPONED = "POSTPONED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class ShiftStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class VolunteerStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class SignupStatus(StrEnum):
    ACTIVE = "ACTIVE"
    CANCELLED_BY_VOLUNTEER = "CANCELLED_BY_VOLUNTEER"
    CANCELLED_BY_ADMIN = "CANCELLED_BY_ADMIN"


class SignupOutcome(StrEnum):
    OPEN = "OPEN"
    ATTENDED = "ATTENDED"
    EXCUSED_CANCELLED = "EXCUSED_CANCELLED"
    LATE_CANCELLED = "LATE_CANCELLED"
    NO_SHOW = "NO_SHOW"
    SUBSTITUTE_ORGANIZED = "SUBSTITUTE_ORGANIZED"


class SignupSource(StrEnum):
    PUBLIC_SIGNUP = "PUBLIC_SIGNUP"
    ADMIN = "ADMIN"
    IMPORT = "IMPORT"


class ClubYear(Base):
    __tablename__ = "club_year"
    __table_args__ = (
        Index("ix_club_year_organization_dates", "organization_id", "start_date", "end_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization.id", ondelete="RESTRICT"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[PlanningStatus] = mapped_column(
        Enum(PlanningStatus, name="planning_status"),
        nullable=False,
        server_default=PlanningStatus.DRAFT.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="club_years")
    seasons: Mapped[list[Season]] = relationship(
        back_populates="club_year", cascade="all, delete-orphan"
    )


class Season(Base):
    __tablename__ = "season"
    __table_args__ = (Index("ix_season_club_year_dates", "club_year_id", "start_date", "end_date"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    club_year_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("club_year.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[SeasonType] = mapped_column(Enum(SeasonType, name="season_type"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[PlanningStatus] = mapped_column(
        Enum(PlanningStatus, name="planning_status", create_type=False),
        nullable=False,
        server_default=PlanningStatus.DRAFT.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    club_year: Mapped[ClubYear] = relationship(back_populates="seasons")
    events: Mapped[list[Event]] = relationship(
        back_populates="season", cascade="all, delete-orphan"
    )


class Event(Base):
    __tablename__ = "event"
    __table_args__ = (Index("ix_event_season_date", "season_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("season.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    public_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, name="event_status"),
        nullable=False,
        server_default=EventStatus.DRAFT.value,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_import_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    season: Mapped[Season] = relationship(back_populates="events")
    shifts: Mapped[list[Shift]] = relationship(back_populates="event", cascade="all, delete-orphan")


class Shift(Base):
    __tablename__ = "shift"
    __table_args__ = (
        CheckConstraint("starts_at < ends_at", name="ck_shift_time_range"),
        CheckConstraint("required_volunteers > 0", name="ck_shift_required_volunteers_positive"),
        Index("ix_shift_event_order", "event_id", "sort_order", "starts_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("event.id", ondelete="CASCADE"), nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    required_volunteers: Mapped[int] = mapped_column(Integer, nullable=False)
    public_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ShiftStatus] = mapped_column(
        Enum(ShiftStatus, name="shift_status"),
        nullable=False,
        server_default=ShiftStatus.OPEN.value,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    event: Mapped[Event] = relationship(back_populates="shifts")
    signups: Mapped[list[Signup]] = relationship(back_populates="shift")


class Volunteer(Base):
    __tablename__ = "volunteer"
    __table_args__ = (
        Index("ix_volunteer_organization_email", "organization_id", "email_normalized"),
        Index("ix_volunteer_organization_phone", "organization_id", "phone_normalized"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone_normalized: Mapped[str] = mapped_column(String(32), nullable=False)
    phone_display: Mapped[str] = mapped_column(String(50), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(255), nullable=False)
    email_display: Mapped[str] = mapped_column(String(255), nullable=False)
    public_display_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[VolunteerStatus] = mapped_column(
        Enum(VolunteerStatus, name="volunteer_status"),
        nullable=False,
        server_default=VolunteerStatus.ACTIVE.value,
    )
    created_from: Mapped[SignupSource] = mapped_column(
        Enum(SignupSource, name="signup_source"), nullable=False
    )
    internal_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    signups: Mapped[list[Signup]] = relationship(back_populates="volunteer")


class Signup(Base):
    __tablename__ = "signup"
    __table_args__ = (
        Index("ix_signup_shift_status", "shift_id", "status"),
        Index("ix_signup_volunteer_shift", "volunteer_id", "shift_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shift.id", ondelete="CASCADE"), nullable=False
    )
    volunteer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("volunteer.id", ondelete="RESTRICT"), nullable=False
    )
    public_name_snapshot: Mapped[str] = mapped_column(String(201), nullable=False)
    status: Mapped[SignupStatus] = mapped_column(
        Enum(SignupStatus, name="signup_status"),
        nullable=False,
        server_default=SignupStatus.ACTIVE.value,
    )
    outcome: Mapped[SignupOutcome] = mapped_column(
        Enum(SignupOutcome, name="signup_outcome"),
        nullable=False,
        server_default=SignupOutcome.OPEN.value,
    )
    source: Mapped[SignupSource] = mapped_column(
        Enum(SignupSource, name="signup_source", create_type=False), nullable=False
    )
    management_token_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    shift: Mapped[Shift] = relationship(back_populates="signups")
    volunteer: Mapped[Volunteer] = relationship(back_populates="signups")
