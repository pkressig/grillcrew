"""Schemas for authenticated organization settings administration."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.organization import MenuType


class OrganizationSettingsUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    payout_rate_minor_per_hour: int | None = Field(default=None, ge=0)
    signup_rate_limit_per_contact: int | None = Field(default=None, ge=1)
    signup_rate_limit_window_minutes: int | None = Field(default=None, ge=1)
    coordination_contact_label: str | None = None
    kiosk_lead_minutes: int | None = Field(default=None, ge=0, le=720)
    kiosk_trail_minutes: int | None = Field(default=None, ge=0, le=720)
    default_game_duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    volunteer_password_min_length: int | None = Field(default=None, ge=6, le=128)

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> OrganizationSettingsUpdate:
        required = {
            "payout_rate_minor_per_hour",
            "signup_rate_limit_per_contact",
            "signup_rate_limit_window_minutes",
        }
        if any(name in self.model_fields_set and getattr(self, name) is None for name in required):
            raise ValueError("required organization settings fields cannot be null")
        return self


class OrganizationSettingsResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    payout_rate_minor_per_hour: int
    signup_rate_limit_per_contact: int
    signup_rate_limit_window_minutes: int
    coordination_contact_label: str | None
    kiosk_lead_minutes: int
    kiosk_trail_minutes: int
    default_game_duration_minutes: int
    volunteer_password_min_length: int
    created_at: datetime
    updated_at: datetime


class HomeVenueCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class HomeVenueUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> HomeVenueUpdate:
        required = {"name", "is_active"}
        if any(name in self.model_fields_set and getattr(self, name) is None for name in required):
            raise ValueError("required home venue fields cannot be null")
        return self


class HomeVenueResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    name_normalized: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CrewSizeRuleCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    pattern: str | None = Field(default=None, min_length=1, max_length=200)
    menu_type: MenuType
    required_griller_count: int = Field(gt=0)
    min_games_per_shift: int = Field(default=1, ge=1)

    @field_validator("pattern", mode="before")
    @classmethod
    def trim_pattern(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class CrewSizeRuleUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    pattern: str | None = Field(default=None, min_length=1, max_length=200)
    menu_type: MenuType | None = None
    required_griller_count: int | None = Field(default=None, gt=0)
    min_games_per_shift: int | None = Field(default=None, ge=1)
    is_active: bool | None = None

    @field_validator("pattern", mode="before")
    @classmethod
    def trim_pattern(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> CrewSizeRuleUpdate:
        required = {"menu_type", "required_griller_count", "min_games_per_shift", "is_active"}
        if any(name in self.model_fields_set and getattr(self, name) is None for name in required):
            raise ValueError("required crew size rule fields cannot be null")
        return self


class CrewSizeRuleResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    sort_order: int
    pattern: str | None
    menu_type: MenuType
    required_griller_count: int
    min_games_per_shift: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CrewSizeRuleReorder(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    ordered_ids: list[uuid.UUID] = Field(min_length=1)


_HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$")


class ThemeUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    logo_url: str | None = Field(default=None, max_length=500)
    banner_url: str | None = Field(default=None, max_length=500)
    primary_color: str | None = Field(default=None, max_length=16)
    secondary_color: str | None = Field(default=None, max_length=16)

    @field_validator("logo_url", "banner_url", mode="before")
    @classmethod
    def trim_url(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("primary_color", "secondary_color")
    @classmethod
    def validate_hex_color(cls, value: str | None) -> str | None:
        if value is not None and not _HEX_COLOR_PATTERN.fullmatch(value):
            raise ValueError("color must be a hex value like #123 or #112233")
        return value

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> ThemeUpdate:
        required = {"primary_color", "secondary_color"}
        if any(name in self.model_fields_set and getattr(self, name) is None for name in required):
            raise ValueError("primary_color and secondary_color cannot be null")
        return self


class ThemeResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    logo_url: str | None
    banner_url: str | None
    primary_color: str
    secondary_color: str
