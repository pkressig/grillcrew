"""Schemas for authenticated retroactive child assignment and compensation classification."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.work_record import CompensationType, PayoutStatus


class WorkRecordClassify(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    compensation_type: CompensationType
    credited_family_member_id: uuid.UUID | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    note: str | None = None

    @model_validator(mode="after")
    def validate_payout_duration(self) -> WorkRecordClassify:
        if self.compensation_type == CompensationType.PAYOUT and not self.duration_minutes:
            raise ValueError("duration_minutes must be a positive number of minutes for PAYOUT")
        return self


class WorkRecordPayoutStatusUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")

    payout_status: PayoutStatus
    mark_signature_received: bool = False


class WorkRecordResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    signup_id: uuid.UUID
    volunteer_id: uuid.UUID
    credited_family_member_id: uuid.UUID | None
    compensation_type: CompensationType
    duration_minutes: int | None
    payout_rate_minor_per_hour: int | None
    payout_amount_minor: int | None
    payout_status: PayoutStatus | None
    signature_received_at: datetime | None
    signature_confirmed_by_user_id: uuid.UUID | None
    note: str | None
    created_at: datetime
    updated_at: datetime
