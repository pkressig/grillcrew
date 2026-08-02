"""Organization tenant root and platform core models."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
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

if TYPE_CHECKING:
    from app.models.family import Family
    from app.models.identity import AuditEvent, Invitation, StaffMembership
    from app.models.planning import ClubYear, Volunteer


class MenuType(StrEnum):
    FRIES_NUGGETS = "FRIES_NUGGETS"
    FRIES_NUGGETS_BURGER = "FRIES_NUGGETS_BURGER"


class Theme(Base):
    __tablename__ = "theme"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    primary_color: Mapped[str] = mapped_column(String(16), nullable=False, server_default="#262626")
    secondary_color: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="#525252"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Organization(Base):
    __tablename__ = "organization"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_organization_slug"),
        UniqueConstraint("custom_domain", name="uq_organization_custom_domain"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    theme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("theme.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(50))
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    custom_domain: Mapped[str | None] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="Europe/Zurich"
    )
    locale: Mapped[str] = mapped_column(String(16), nullable=False, server_default="de-CH")
    language: Mapped[str] = mapped_column(String(16), nullable=False, server_default="de")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="CHF")
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    contact_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    theme: Mapped[Theme] = relationship()
    settings: Mapped[OrganizationSettings] = relationship(
        back_populates="organization", uselist=False
    )
    staff_memberships: Mapped[list[StaffMembership]] = relationship(back_populates="organization")
    audit_events: Mapped[list[AuditEvent]] = relationship(back_populates="organization")
    invitations: Mapped[list[Invitation]] = relationship(back_populates="organization")
    club_years: Mapped[list[ClubYear]] = relationship(back_populates="organization")
    volunteers: Mapped[list[Volunteer]] = relationship()
    families: Mapped[list[Family]] = relationship(back_populates="organization")
    home_venues: Mapped[list[HomeVenue]] = relationship(back_populates="organization")
    crew_size_rules: Mapped[list[CrewSizeRule]] = relationship(back_populates="organization")


class OrganizationSettings(Base):
    __tablename__ = "organization_settings"
    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_organization_settings_organization_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False
    )
    payout_rate_minor_per_hour: Mapped[int] = mapped_column(nullable=False, server_default="900")
    signup_rate_limit_per_contact: Mapped[int] = mapped_column(nullable=False, server_default="5")
    signup_rate_limit_window_minutes: Mapped[int] = mapped_column(
        nullable=False, server_default="60"
    )
    coordination_contact_label: Mapped[str | None] = mapped_column(String(100))
    kiosk_lead_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="30")
    kiosk_trail_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="30")
    default_game_duration_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="90"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="settings")


class HomeVenue(Base):
    __tablename__ = "home_venue"
    __table_args__ = (
        Index("ix_home_venue_organization_active", "organization_id", "is_active"),
        UniqueConstraint(
            "organization_id",
            "name_normalized",
            name="uq_home_venue_organization_name_normalized",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_normalized: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="home_venues")


class CrewSizeRule(Base):
    __tablename__ = "crew_size_rule"
    __table_args__ = (
        Index("ix_crew_size_rule_organization_sort", "organization_id", "sort_order"),
        CheckConstraint(
            "required_griller_count > 0", name="ck_crew_size_rule_griller_count_positive"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    pattern: Mapped[str | None] = mapped_column(String(200))
    menu_type: Mapped[MenuType] = mapped_column(Enum(MenuType, name="menu_type"), nullable=False)
    required_griller_count: Mapped[int] = mapped_column(Integer, nullable=False)
    min_games_per_shift: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="crew_size_rules")
