"""Schemas for authentication endpoints."""

from pydantic import BaseModel, ConfigDict, Field

from app.models.identity import StaffRole, UserStatus


class LoginRequest(BaseModel):  # type: ignore[explicit-any]
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1)


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


class LogoutResponse(BaseModel):  # type: ignore[explicit-any]
    ok: bool = True
