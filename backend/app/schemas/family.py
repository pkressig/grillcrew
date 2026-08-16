"""Schemas for authenticated family administration."""

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.family import FamilyMemberType, FamilyStatus
from app.models.planning import VolunteerCompensation, VolunteerStatus

_EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")


def _validate_email_format(value: str) -> str:
    if not _EMAIL_PATTERN.fullmatch(value):
        raise ValueError("invalid email address")
    return value


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


class FamilyListResponse(FamilyResponse):  # type: ignore[explicit-any]
    children_count: int
    helpers_count: int


class FamilyMemberCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    member_type: FamilyMemberType
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    team_name: str | None = Field(default=None, max_length=100)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("team_name", mode="before")
    @classmethod
    def trim_team_name(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @model_validator(mode="after")
    def team_name_only_for_children(self) -> "FamilyMemberCreate":
        if self.team_name is not None and self.member_type != FamilyMemberType.CHILD:
            raise ValueError("team_name is only allowed for CHILD members")
        return self


class FamilyMemberResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    member_type: FamilyMemberType
    first_name: str
    last_name: str
    volunteer_id: uuid.UUID | None
    team_name: str | None


class FamilyVolunteerResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    phone: str
    email: str
    compensation_preference: VolunteerCompensation
    compensation_family_member_id: uuid.UUID | None
    internal_note: str | None
    status: VolunteerStatus
    is_grill_helper: bool
    is_kiosk_helper: bool


class VolunteerDirectoryResponse(FamilyVolunteerResponse):  # type: ignore[explicit-any]
    """Broader admin browse row: every org volunteer, plus account/family badges."""

    has_account: bool
    family_display_name: str | None


class VolunteerAdminUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=50)
    email: str = Field(min_length=3, max_length=320)
    compensation_preference: VolunteerCompensation
    compensation_family_member_id: uuid.UUID | None = None
    internal_note: str | None = Field(default=None, max_length=2000)
    status: VolunteerStatus
    is_grill_helper: bool = True
    is_kiosk_helper: bool = False

    @field_validator("first_name", "last_name", "phone", "email", mode="before")
    @classmethod
    def trim(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _validate_email_format(value)

    @field_validator("internal_note", mode="before")
    @classmethod
    def trim_note(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class VolunteerCreate(BaseModel):  # type: ignore[explicit-any]
    """Direct admin volunteer creation, without first creating a family member."""

    model_config = ConfigDict(extra="forbid")

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=50)
    email: str = Field(min_length=3, max_length=320)
    compensation_preference: VolunteerCompensation = VolunteerCompensation.WORK_HOURS
    compensation_family_member_id: uuid.UUID | None = None
    internal_note: str | None = Field(default=None, max_length=2000)
    status: VolunteerStatus = VolunteerStatus.ACTIVE
    is_grill_helper: bool = True
    is_kiosk_helper: bool = False

    @field_validator("first_name", "last_name", "phone", "email", mode="before")
    @classmethod
    def trim(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return _validate_email_format(value)

    @field_validator("internal_note", mode="before")
    @classmethod
    def trim_note(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class FamilyChildResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    family_display_name: str
    first_name: str
    last_name: str
    team_name: str | None


class FamilyMemberVolunteerUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    volunteer_id: uuid.UUID | None


class VolunteerFamilyMemberEntry(BaseModel):  # type: ignore[explicit-any]
    """One member row within a volunteer's reverse family lookup."""

    id: uuid.UUID
    member_type: FamilyMemberType
    first_name: str
    last_name: str
    team_name: str | None
    volunteer_id: uuid.UUID | None
    volunteer_first_name: str | None
    volunteer_last_name: str | None


class VolunteerFamilyResponse(BaseModel):  # type: ignore[explicit-any]
    family_id: uuid.UUID
    family_display_name: str
    family_internal_note: str | None
    members: list[VolunteerFamilyMemberEntry]


class AdminSetVolunteerPasswordRequest(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    new_password: str = Field(min_length=1, max_length=1024)


class AdminVolunteerPasswordActionResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True
