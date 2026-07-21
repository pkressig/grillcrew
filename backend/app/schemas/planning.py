"""Explicit API payloads for club years and seasons."""

from __future__ import annotations

import uuid
from datetime import date as date_type
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.planning import EventStatus, PlanningStatus, SeasonType, ShiftStatus


class DateRangeModel(BaseModel):  # type: ignore[explicit-any]
    @model_validator(mode="after")
    def validate_date_range(self) -> DateRangeModel:
        start = getattr(self, "start_date", None)
        end = getattr(self, "end_date", None)
        if start is not None and end is not None and start > end:
            raise ValueError("start_date must be on or before end_date")
        return self


class ClubYearCreate(DateRangeModel):  # type: ignore[explicit-any]
    label: str = Field(min_length=1, max_length=100)
    start_date: date_type
    end_date: date_type
    status: PlanningStatus = PlanningStatus.DRAFT


class ClubYearUpdate(DateRangeModel):  # type: ignore[explicit-any]
    label: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date_type | None = None
    end_date: date_type | None = None
    status: PlanningStatus | None = None


class ClubYearResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    label: str
    start_date: date_type
    end_date: date_type
    status: PlanningStatus
    created_at: datetime
    updated_at: datetime


class SeasonCreate(DateRangeModel):  # type: ignore[explicit-any]
    type: SeasonType
    name: str = Field(min_length=1, max_length=100)
    start_date: date_type
    end_date: date_type
    status: PlanningStatus = PlanningStatus.DRAFT


class SeasonUpdate(DateRangeModel):  # type: ignore[explicit-any]
    type: SeasonType | None = None
    name: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date_type | None = None
    end_date: date_type | None = None
    status: PlanningStatus | None = None


class SeasonResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    club_year_id: uuid.UUID
    type: SeasonType
    name: str
    start_date: date_type
    end_date: date_type
    status: PlanningStatus
    created_at: datetime
    updated_at: datetime


class EventCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    date: date_type
    location: str = Field(min_length=1, max_length=200)
    event_type: str = Field(min_length=1, max_length=100)
    public_description: str | None = None
    internal_note: str | None = None
    status: EventStatus = EventStatus.DRAFT
    published_at: datetime | None = None
    source_import_id: uuid.UUID | None = None


class EventUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    date: date_type | None = None
    location: str | None = Field(default=None, min_length=1, max_length=200)
    event_type: str | None = Field(default=None, min_length=1, max_length=100)
    public_description: str | None = None
    internal_note: str | None = None
    status: EventStatus | None = None
    published_at: datetime | None = None
    source_import_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> EventUpdate:
        required = {"title", "date", "location", "event_type", "status"}
        if any(name in self.model_fields_set and getattr(self, name) is None for name in required):
            raise ValueError("required event fields cannot be null")
        return self


class EventResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    season_id: uuid.UUID
    title: str
    date: date_type
    location: str
    event_type: str
    public_description: str | None
    internal_note: str | None
    status: EventStatus
    published_at: datetime | None
    source_import_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ShiftCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    starts_at: datetime
    ends_at: datetime
    required_volunteers: int = Field(gt=0)
    public_note: str | None = None
    internal_note: str | None = None
    status: ShiftStatus = ShiftStatus.OPEN
    sort_order: int = 0

    @model_validator(mode="after")
    def validate_time_range(self) -> ShiftCreate:
        if self.starts_at >= self.ends_at:
            raise ValueError("starts_at must be before ends_at")
        return self


class ShiftUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    required_volunteers: int | None = Field(default=None, gt=0)
    public_note: str | None = None
    internal_note: str | None = None
    status: ShiftStatus | None = None
    sort_order: int | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> ShiftUpdate:
        required = {"starts_at", "ends_at", "required_volunteers", "status", "sort_order"}
        if any(name in self.model_fields_set and getattr(self, name) is None for name in required):
            raise ValueError("required shift fields cannot be null")
        return self


class ShiftResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    required_volunteers: int
    public_note: str | None
    internal_note: str | None
    status: ShiftStatus
    sort_order: int
    created_at: datetime
    updated_at: datetime


class PublicShiftResponse(BaseModel):  # type: ignore[explicit-any]
    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    required_volunteers: int
    occupied_volunteers: int = 0
    public_note: str | None
    status: ShiftStatus
    volunteer_names: list[str] = []


class PublicSignupCreate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=50)
    email: str = Field(min_length=3, max_length=255)
    public_display_consent: bool
    website: str = Field(default="", max_length=500)
    form_started_at: datetime


class PublicSignupSummary(BaseModel):  # type: ignore[explicit-any]
    public_name: str
    occupied_volunteers: int
    required_volunteers: int


class PublicSignupResponse(BaseModel):  # type: ignore[explicit-any]
    message: str
    signup: PublicSignupSummary | None = None


class PublicEventResponse(BaseModel):  # type: ignore[explicit-any]
    id: uuid.UUID
    title: str
    date: date_type
    location: str
    event_type: str
    public_description: str | None
    shifts: list[PublicShiftResponse]


class PublicPlanResponse(BaseModel):  # type: ignore[explicit-any]
    events: list[PublicEventResponse]
