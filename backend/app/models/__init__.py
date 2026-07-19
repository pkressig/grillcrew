"""Alle ORM-Modelle importieren, damit Alembic sie in Base.metadata findet."""

from app.models.identity import (
    AuditEvent,
    Invitation,
    PasswordResetToken,
    PlatformRole,
    RefreshToken,
    StaffMembership,
    StaffRole,
    User,
    UserStatus,
)
from app.models.organization import Organization, OrganizationSettings, Theme
from app.models.planning import ClubYear, PlanningStatus, Season, SeasonType

__all__ = [
    "AuditEvent",
    "ClubYear",
    "Invitation",
    "Organization",
    "OrganizationSettings",
    "PasswordResetToken",
    "PlanningStatus",
    "PlatformRole",
    "RefreshToken",
    "Season",
    "SeasonType",
    "StaffMembership",
    "StaffRole",
    "Theme",
    "User",
    "UserStatus",
]
