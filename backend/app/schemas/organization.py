"""Organization schemas for public-safe tenant metadata."""

import uuid

from pydantic import BaseModel, ConfigDict, Field

# NOTE on the ignores below: pydantic.BaseModel.__init__ itself is typed as
# `**data: Any`, so mypy's disallow_any_explicit flags every subclass; this is
# inherent to pydantic and cannot be fixed from our code.


class PublicOrganizationSettings(BaseModel):  # type: ignore[explicit-any]
    """Public-safe organization settings from the dedicated settings table."""

    payout_rate_minor_per_hour: int = Field(default=900, ge=0)
    signup_rate_limit_per_contact: int = Field(default=5, ge=1)
    signup_rate_limit_window_minutes: int = Field(default=60, ge=1)
    coordination_contact_label: str | None = None
    coordination_contact_phone: str | None = None
    volunteer_password_min_length: int = Field(default=6, ge=6, le=128)


class PublicTheme(BaseModel):  # type: ignore[explicit-any]
    name: str
    logo_url: str | None
    banner_url: str | None
    primary_color: str
    secondary_color: str


class OrganizationContact(BaseModel):  # type: ignore[explicit-any]
    email: str | None = None
    phone: str | None = None
    url: str | None = None


class PublicOrganizationResponse(BaseModel):  # type: ignore[explicit-any]
    """Public organization information safe for unauthenticated clients."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    short_name: str | None
    slug: str
    theme: PublicTheme
    language: str
    locale: str
    timezone: str
    currency: str
    contact: OrganizationContact
    settings: PublicOrganizationSettings


class OrganizationIdentityUpdate(BaseModel):  # type: ignore[explicit-any]
    """Admin-submitted request to change an organization's public URL slug."""

    model_config = ConfigDict(extra="forbid")

    slug: str = Field(min_length=1, max_length=80)


class OrganizationIdentityResponse(BaseModel):  # type: ignore[explicit-any]
    """Admin-facing identity fields, including the URL slug, after an update."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    short_name: str | None
    slug: str


class OrganizationDirectoryEntry(BaseModel):  # type: ignore[explicit-any]
    """One entry in the public cross-tenant directory of all organizations."""

    slug: str
    name: str
    short_name: str | None
    logo_url: str | None
