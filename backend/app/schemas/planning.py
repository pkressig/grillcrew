"""Explicit API payloads for club years and seasons."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.planning import PlanningStatus, SeasonType


class DateRangeModel(BaseModel):  # type: ignore[explicit-any]
    @model_validator(mode="after")
    def validate_date_range(self) -> "DateRangeModel":
        start = getattr(self, "start_date", None)
        end = getattr(self, "end_date", None)
        if start is not None and end is not None and start > end:
            raise ValueError("start_date must be on or before end_date")
        return self


class ClubYearCreate(DateRangeModel):  # type: ignore[explicit-any]
    label: str = Field(min_length=1, max_length=100)
    start_date: date
    end_date: date
    status: PlanningStatus = PlanningStatus.DRAFT


class ClubYearUpdate(DateRangeModel):  # type: ignore[explicit-any]
    label: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    status: PlanningStatus | None = None


class ClubYearResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    label: str
    start_date: date
    end_date: date
    status: PlanningStatus
    created_at: datetime
    updated_at: datetime


class SeasonCreate(DateRangeModel):  # type: ignore[explicit-any]
    type: SeasonType
    name: str = Field(min_length=1, max_length=100)
    start_date: date
    end_date: date
    status: PlanningStatus = PlanningStatus.DRAFT


class SeasonUpdate(DateRangeModel):  # type: ignore[explicit-any]
    type: SeasonType | None = None
    name: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    status: PlanningStatus | None = None


class SeasonResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    club_year_id: uuid.UUID
    type: SeasonType
    name: str
    start_date: date
    end_date: date
    status: PlanningStatus
    created_at: datetime
    updated_at: datetime
