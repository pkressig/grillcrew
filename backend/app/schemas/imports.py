"""Schemas for authenticated grill game-plan import administration."""

from __future__ import annotations

import uuid
from datetime import date as date_type
from datetime import datetime
from datetime import time as time_type

from pydantic import BaseModel, ConfigDict

from app.models.planning import (
    GrillShiftDecision,
    ImportBatchStatus,
    ImportRowClassification,
    ImportRowDecision,
    SpielTyp,
)


class ImportBatchResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    club_year_id: uuid.UUID
    source_filename: str
    uploaded_by_user_id: uuid.UUID
    status: ImportBatchStatus
    uploaded_at: datetime
    confirmed_at: datetime | None
    confirmed_by_user_id: uuid.UUID | None
    row_count: int
    created_at: datetime
    updated_at: datetime


class ImportRowResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    import_batch_id: uuid.UUID
    season_id: uuid.UUID
    sheet_tab: str
    spiel_typ: SpielTyp
    bezeichnung: str | None
    spielnummer: str | None
    weekday_short: str | None
    game_date: date_type
    game_time: time_type | None
    teams: str
    venue: str
    venue_normalized: str
    remark: str | None
    is_home_venue: bool
    classification: ImportRowClassification
    matched_event_id: uuid.UUID | None
    diff_details: dict[str, object] | None
    include_decision: ImportRowDecision
    grill_shift_decision: GrillShiftDecision
    verschoben_acknowledged_at: datetime | None
    applied_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ImportBatchWithRowsResponse(BaseModel):  # type: ignore[explicit-any]
    batch: ImportBatchResponse
    rows: list[ImportRowResponse]


class ImportRowUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    include_decision: ImportRowDecision | None = None
    grill_shift_decision: GrillShiftDecision | None = None
    acknowledge_verschoben: bool | None = None
