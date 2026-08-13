import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProposalGameResponse(BaseModel):  # type: ignore[explicit-any]
    title: str
    match_description: str | None = None
    kickoff_at: datetime
    venue: str


class ProposalShiftSplitResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = {"from_attributes": True}
    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    required_volunteers: int


class ProposalWindowResponse(BaseModel):  # type: ignore[explicit-any]
    id: str
    date: date
    start_at: datetime
    end_at: datetime
    kiosk_open: bool
    grill_required: bool
    proposed_grill_slots: int
    proposed_kiosk_slots: int = 1
    override_state: Literal["PROPOSAL", "MANUAL"]
    is_overridden: bool
    split_reason: str | None
    venues: list[str]
    crew_rule_context: str | None
    covered_event_ids: list[uuid.UUID]
    games: list[ProposalGameResponse]
    kiosk_confirmed: bool = False
    grill_confirmed: bool = False
    grill_shift_splits: list[ProposalShiftSplitResponse] = []
    kiosk_shift_splits: list[ProposalShiftSplitResponse] = []


class ProposalResponse(BaseModel):  # type: ignore[explicit-any]
    windows: list[ProposalWindowResponse]


class ProposalOverrideUpdate(BaseModel):  # type: ignore[explicit-any]
    model_config = {"extra": "forbid"}
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    kiosk_open: bool | None = None
    grill_required: bool | None = None
    proposed_grill_slots: int | None = Field(default=None, ge=0, le=20)
    proposed_kiosk_slots: int | None = Field(default=None, ge=1, le=20)

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


class ProposalShiftSplitInput(BaseModel):  # type: ignore[explicit-any]
    model_config = {"extra": "forbid"}
    starts_at: datetime
    ends_at: datetime
    required_volunteers: int = Field(ge=1, le=20)

    @model_validator(mode="after")
    def validate_times(self) -> "ProposalShiftSplitInput":
        if self.starts_at >= self.ends_at:
            raise ValueError("starts_at must be before ends_at")
        return self


class ProposalGrillSplitsUpdate(BaseModel):  # type: ignore[explicit-any]
    """Full replacement of a window's grill sub-shifts (empty list clears them)."""

    model_config = {"extra": "forbid"}
    shifts: list[ProposalShiftSplitInput] = Field(max_length=12)


class ProposalKioskSplitsUpdate(ProposalGrillSplitsUpdate):  # type: ignore[explicit-any]
    """Full replacement of a window's Kiosk sub-shifts (empty list clears them).

    Same shape as ProposalGrillSplitsUpdate (a plain alias would work just as
    well) but kept as its own named schema so the OpenAPI/Kiosk route reads
    clearly rather than importing something literally named "Grill"."""
