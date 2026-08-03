"""Schemas for authentication endpoints."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.models.identity import StaffRole, UserStatus
from app.models.planning import VolunteerCompensation


class LoginRequest(BaseModel):  # type: ignore[explicit-any]
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1)


class VolunteerRegisterRequest(BaseModel):  # type: ignore[explicit-any]
    organization_slug: str = Field(min_length=1, max_length=100)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=50)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    compensation_preference: VolunteerCompensation = VolunteerCompensation.WORK_HOURS
    child_first_name: str | None = Field(default=None, max_length=100)
    child_last_name: str | None = Field(default=None, max_length=100)


class VolunteerRegisterResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True
    session: AuthSessionResponse


class VolunteerProfileResponse(BaseModel):  # type: ignore[explicit-any]
    first_name: str
    last_name: str
    phone: str
    email: str
    compensation_preference: VolunteerCompensation
    compensation_family_member_id: str | None


class AuthUserResponse(BaseModel):  # type: ignore[explicit-any]
    model_config = ConfigDict(from_attributes=True)

    id: str
    email_normalized: str
    display_name: str | None
    status: UserStatus


class AuthMembershipResponse(BaseModel):  # type: ignore[explicit-any]
    organization_id: str
    organization_slug: str
    organization_name: str
    role: StaffRole


class AuthSessionResponse(BaseModel):  # type: ignore[explicit-any]
    user: AuthUserResponse
    memberships: list[AuthMembershipResponse]


class CsrfTokenResponse(BaseModel):  # type: ignore[explicit-any]
    csrf_token: str


class LogoutResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True


class ForgotPasswordRequest(BaseModel):  # type: ignore[explicit-any]
    email: str = Field(min_length=3, max_length=320)


class ForgotPasswordResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True


class ResetPasswordRequest(BaseModel):  # type: ignore[explicit-any]
    token: str = Field(min_length=1, max_length=512)
    new_password: str = Field(min_length=1, max_length=1024)


class ResetPasswordResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True


class AcceptInvitationRequest(BaseModel):  # type: ignore[explicit-any]
    token: str = Field(min_length=1, max_length=512)
    display_name: str = Field(min_length=1, max_length=200)
    password: str | None = Field(default=None, min_length=1, max_length=1024)


class AcceptInvitationResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True
