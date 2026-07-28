"""Organization-scoped family models."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization


class FamilyStatus(StrEnum):
    ACTIVE = "ACTIVE"


class FamilyMemberType(StrEnum):
    CHILD = "CHILD"
    HELPER = "HELPER"


class Family(Base):
    __tablename__ = "family"
    __table_args__ = (Index("ix_family_organization_status", "organization_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[FamilyStatus] = mapped_column(
        Enum(FamilyStatus, name="family_status"),
        nullable=False,
        server_default=FamilyStatus.ACTIVE.value,
    )
    internal_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="families")
    members: Mapped[list[FamilyMember]] = relationship(back_populates="family")


class FamilyMember(Base):
    __tablename__ = "family_member"
    __table_args__ = (
        Index(
            "ix_family_member_family_name",
            "family_id",
            "last_name",
            "first_name",
            "member_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("family.id", ondelete="RESTRICT"), nullable=False
    )
    member_type: Mapped[FamilyMemberType] = mapped_column(
        Enum(FamilyMemberType, name="family_member_type"), nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)

    family: Mapped[Family] = relationship(back_populates="members")
