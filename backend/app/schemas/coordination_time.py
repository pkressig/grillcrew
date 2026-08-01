from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.work_record import PayoutStatus


class CoordinationTimeWrite(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    work_date: date
    duration_minutes: int = Field(gt=0, le=1440)
    hourly_rate_minor: int = Field(ge=0, le=1_000_000)
    note: str | None = Field(default=None, max_length=2000)


class CoordinationTimeStatusUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    payout_status: PayoutStatus
    mark_signature_received: bool = False
    signature_note: str | None = Field(default=None, max_length=2000)


class CoordinationTimeResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    work_date: date
    duration_minutes: int
    hourly_rate_minor: int
    payout_amount_minor: int
    payout_status: PayoutStatus
    note: str | None
    signature_received_at: datetime | None
    signature_received_by_user_id: uuid.UUID | None
    signature_note: str | None
    created_at: datetime
    updated_at: datetime
