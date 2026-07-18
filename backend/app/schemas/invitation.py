"""Schemas for organization invitation administration."""

from pydantic import BaseModel, Field

from app.models.identity import StaffRole


class CreateInvitationRequest(BaseModel):  # type: ignore[explicit-any]
    email: str = Field(min_length=3, max_length=320)
    role: StaffRole


class CreateInvitationResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True


class InvitationPreviewResponse(BaseModel):  # type: ignore[explicit-any]
    organization_name: str
    role: StaffRole
    password_required: bool
