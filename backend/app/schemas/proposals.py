import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProposalGameResponse(BaseModel):  # type: ignore[explicit-any]
    title: str
    kickoff_at: datetime
    venue: str


class ProposalWindowResponse(BaseModel):  # type: ignore[explicit-any]
    id: str
    date: date
    start_at: datetime
    end_at: datetime
    kiosk_open: bool
    grill_required: bool
    proposed_grill_slots: int
    override_state: Literal["PROPOSAL", "MANUAL"]
    is_overridden: bool
    split_reason: str | None
    venues: list[str]
    crew_rule_context: str | None
    covered_event_ids: list[uuid.UUID]
    games: list[ProposalGameResponse]
    kiosk_confirmed: bool = False
    grill_confirmed: bool = False


class ProposalResponse(BaseModel):  # type: ignore[explicit-any]
    windows: list[ProposalWindowResponse]


class ProposalOverrideUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = {"extra": "forbid"}
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    kiosk_open: bool | None = None
    grill_required: bool | None = None
    proposed_grill_slots: int | None = Field(default=None, ge=0, le=20)

    @model_validator(mode="after")
    def validate_times(self) -> "ProposalOverrideUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one override field is required")
        if (
            self.starts_at is not None
            and self.ends_at is not None
            and self.starts_at >= self.ends_at
        ):
            raise ValueError("starts_at must be before ends_at")
        return self
