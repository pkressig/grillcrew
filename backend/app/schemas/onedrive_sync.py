"""API contracts for read-only OneDrive synchronization."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.onedrive_sync import OneDriveSyncStatus


class OneDriveConfigUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(extra="forbid")
    club_year_id: uuid.UUID
    source_url: str = Field(max_length=2048)
    enabled: bool
    daily_time: time
    import_start_date: date
    import_end_date: date | None = None
    future_only: bool

    @model_validator(mode="after")
    def dates(self) -> "OneDriveConfigUpdate":
        if self.import_end_date is not None and self.import_end_date < self.import_start_date:
            raise ValueError("Das Enddatum darf nicht vor dem Startdatum liegen.")
        return self


class OneDriveRunResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    status: OneDriveSyncStatus
    source_filename: str | None
    content_sha256: str
    effective_start_date: date
    effective_end_date: date | None
    scheduled_date: date | None
    row_count: int
    comparison_summary: dict[str, object] | None
    error_message: str | None
    import_batch_id: uuid.UUID | None
    started_at: datetime
    finished_at: datetime | None


class OneDriveConfigResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    club_year_id: uuid.UUID
    source_url: str
    enabled: bool
    daily_time: time
    import_start_date: date
    import_end_date: date | None
    future_only: bool
    next_run_at: datetime | None = None
    last_run: OneDriveRunResponse | None = None
