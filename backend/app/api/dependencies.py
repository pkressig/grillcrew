"""Shared FastAPI dependencies for authenticated and tenant-scoped endpoints."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.security.csrf import CSRF_HEADER_NAME, derive_csrf_secret, verify_csrf_token
from app.core.security.jwt import InvalidAccessTokenError, decode_access_token
from app.db.session import get_db
from app.models.identity import StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization
from app.services.auth import (
    ACCESS_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
    InvalidRefreshTokenError,
    RefreshService,
)
from app.services.organization_context import (
    OrganizationLookup,
    build_organization_lookup,
    resolve_organization,
)


@dataclass(frozen=True)
class CurrentOrganization:
    organization: Organization


@dataclass(frozen=True)
class CurrentUser:
    user: User


@dataclass(frozen=True)
class CurrentStaffMembership:
    organization: Organization
    user: User
    membership: StaffMembership


def get_current_organization(
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
) -> CurrentOrganization:
    lookup = getattr(request.state, "organization_lookup", None)
    if not isinstance(lookup, OrganizationLookup):
        lookup = build_organization_lookup(request)
    organization = resolve_organization(db, lookup, get_settings().app_env)
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="organization not found",
        )
    return CurrentOrganization(organization=organization)


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
) -> CurrentUser:
    raw_token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
    if not raw_token:
        raise _unauthorized()
    try:
        claims = decode_access_token(raw_token, secret=get_settings().jwt_secret_key)
        user_id = uuid.UUID(claims.subject)
    except (InvalidAccessTokenError, ValueError):
        raise _unauthorized() from None

    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.staff_memberships).selectinload(StaffMembership.organization))
    )
    if user is None or user.status != UserStatus.ACTIVE:
        raise _unauthorized()
    return CurrentUser(user=user)


def require_authenticated_user(
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
) -> CurrentUser:
    """Require a valid active user session loaded from the database."""
    return current_user


def require_organization_context(
    current_organization: CurrentOrganization = Depends(get_current_organization),  # noqa: B008
) -> CurrentOrganization:
    """Require a resolved tenant organization for an organization-scoped request."""
    return current_organization


def require_staff_membership(
    current_user: CurrentUser = Depends(require_authenticated_user),  # noqa: B008
    current_organization: CurrentOrganization = Depends(require_organization_context),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> CurrentStaffMembership:
    """Require an active staff membership in the resolved organization."""
    membership = db.scalar(
        select(StaffMembership).where(
            StaffMembership.user_id == current_user.user.id,
            StaffMembership.organization_id == current_organization.organization.id,
        )
    )
    if (
        membership is None
        or not membership.active
        or membership.organization_id != current_organization.organization.id
        or membership.user_id != current_user.user.id
    ):
        raise _forbidden()
    return CurrentStaffMembership(
        organization=current_organization.organization,
        user=current_user.user,
        membership=membership,
    )


def require_staff_role(
    *allowed_roles: StaffRole,
) -> Callable[[CurrentStaffMembership], CurrentStaffMembership]:
    """Require a staff role for the resolved organization.

    ADMIN is intentionally accepted for every organization staff/admin guard.
    Organization roles are always read from StaffMembership, never from JWT claims.
    """
    allowed = set(allowed_roles)

    def dependency(
        current_membership: CurrentStaffMembership = Depends(require_staff_membership),  # noqa: B008
    ) -> CurrentStaffMembership:
        role = current_membership.membership.role
        if role == StaffRole.ADMIN or role in allowed:
            return current_membership
        raise _forbidden()

    return dependency


def validate_csrf(
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
) -> None:
    raw_refresh = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if not raw_refresh or not header_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="csrf validation failed")

    refresh_service = RefreshService(db, get_settings())
    try:
        validated = refresh_service.validate(refresh_token=raw_refresh)
    except InvalidRefreshTokenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="csrf validation failed",
        ) from None

    is_valid = verify_csrf_token(
        header_token,
        binding_key=str(validated.token.family_id),
        secret=derive_csrf_secret(get_settings().jwt_secret_key),
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="csrf validation failed")


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
