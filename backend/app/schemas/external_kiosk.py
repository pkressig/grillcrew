# mypy: disable-error-code=explicit-any

import uuid
from datetime import date, datetime, time
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.models.external_kiosk import ExternalKioskCategory, ExternalKioskReviewState
from app.schemas.proposals import ProposalWindowResponse


class ComparisonStatus(StrEnum):
    MATCH = "MATCH"
    MISSING_IN_EXTERNAL = "MISSING_IN_EXTERNAL"
    EXTRA_IN_EXTERNAL = "EXTRA_IN_EXTERNAL"
    TIME_MISMATCH = "TIME_MISMATCH"
    PERSON_ASSIGNMENT_PRESENT = "PERSON_ASSIGNMENT_PRESENT"


class ExternalKioskRowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    source_row: int
    plan_date: date
    start_time: time | None
    end_time: time | None
    category: ExternalKioskCategory
    assigned_person_text: str | None
    source_note: str | None
    raw_date: str
    raw_time: str
    acknowledged: bool
    review_state: ExternalKioskReviewState
    review_note: str | None


class ExternalKioskBatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    source_filename: str
    source_sheet: str
    content_sha256: str
    uploaded_at: datetime
    row_count: int


class ExternalKioskImportResponse(BaseModel):
    batch: ExternalKioskBatchResponse
    rows: list[ExternalKioskRowResponse]


class ExternalKioskReviewUpdate(BaseModel):
    review_state: ExternalKioskReviewState
    note: str | None = Field(default=None, max_length=1000)


class ExternalKioskComparisonItem(BaseModel):
    proposal_window_id: str | None
    proposal: ProposalWindowResponse | None
    external_row: ExternalKioskRowResponse | None
    category: ExternalKioskCategory
    statuses: list[ComparisonStatus]


class ExternalKioskComparisonResponse(BaseModel):
    batch: ExternalKioskBatchResponse
    items: list[ExternalKioskComparisonItem]
