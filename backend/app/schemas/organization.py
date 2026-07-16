"""Organization schemas for public-safe tenant metadata."""

from pydantic import BaseModel, ConfigDict, Field


class PublicOrganizationSettings(BaseModel):
    """Public-safe organization settings from the dedicated settings table."""

    payout_rate_minor_per_hour: int = Field(default=900, ge=0)
    signup_rate_limit_per_contact: int = Field(default=5, ge=1)
    signup_rate_limit_window_minutes: int = Field(default=60, ge=1)
    coordination_contact_label: str | None = None


class PublicTheme(BaseModel):
    name: str
    logo_url: str | None
    primary_color: str
    secondary_color: str


class OrganizationContact(BaseModel):
    email: str | None = None
    phone: str | None = None
    url: str | None = None


class PublicOrganizationResponse(BaseModel):
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
