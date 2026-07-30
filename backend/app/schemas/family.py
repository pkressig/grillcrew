"""Schemas for authenticated family administration."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.family import FamilyMemberType, FamilyStatus


class FamilyCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=160)
    internal_note: str | None = None

    @field_validator("display_name", mode="before")
    @classmethod
    def trim_display_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class FamilyResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    display_name: str
    status: FamilyStatus
    internal_note: str | None
    created_at: datetime
    updated_at: datetime


class FamilyMemberCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    member_type: FamilyMemberType
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class FamilyMemberResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    member_type: FamilyMemberType
    first_name: str
    last_name: str
    volunteer_id: uuid.UUID | None


class FamilyVolunteerResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str


class FamilyMemberVolunteerUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    volunteer_id: uuid.UUID | None
