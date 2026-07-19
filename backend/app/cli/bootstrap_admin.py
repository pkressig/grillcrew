"""One-time first-admin bootstrap for production operations.

This command is intentionally not exposed through an HTTP endpoint. Run it from
the backend environment with temporary BOOTSTRAP_* environment variables.
"""

from __future__ import annotations

import os
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security.password import PasswordPolicyError, hash_password, validate_password_policy
from app.db.session import SessionLocal
from app.models.identity import AuditEvent, StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization

DEFAULT_ORGANIZATION_SLUG = "fc-thusis-cazis"
ENV_ORGANIZATION_SLUG = "BOOTSTRAP_ORGANIZATION_SLUG"
ENV_ADMIN_EMAIL = "BOOTSTRAP_ADMIN_EMAIL"
ENV_ADMIN_DISPLAY_NAME = "BOOTSTRAP_ADMIN_DISPLAY_NAME"
ENV_ADMIN_PASSWORD = "BOOTSTRAP_ADMIN_PASSWORD"  # noqa: S105


class BootstrapAdminError(RuntimeError):
    """Raised when the first-admin bootstrap cannot be completed safely."""


@dataclass(frozen=True)
class BootstrapAdminInput:
    organization_slug: str
    email: str
    display_name: str
    password: str


@dataclass(frozen=True)
class BootstrapAdminResult:
    organization_slug: str
    user_id: uuid.UUID
    membership_id: uuid.UUID
    created_user: bool
    created_membership: bool


def load_bootstrap_input_from_env() -> BootstrapAdminInput:
    organization_slug = os.environ.get(ENV_ORGANIZATION_SLUG, DEFAULT_ORGANIZATION_SLUG).strip()
    email = os.environ.get(ENV_ADMIN_EMAIL, "").strip()
    display_name = os.environ.get(ENV_ADMIN_DISPLAY_NAME, "").strip()
    password = os.environ.get(ENV_ADMIN_PASSWORD, "")

    missing = [
        name
        for name, value in (
            (ENV_ORGANIZATION_SLUG, organization_slug),
            (ENV_ADMIN_EMAIL, email),
            (ENV_ADMIN_DISPLAY_NAME, display_name),
            (ENV_ADMIN_PASSWORD, password),
        )
        if not value
    ]
    if missing:
        raise BootstrapAdminError(f"missing required environment variable(s): {', '.join(missing)}")

    return BootstrapAdminInput(
        organization_slug=organization_slug,
        email=email,
        display_name=display_name,
        password=password,
    )


def bootstrap_admin(db: Session, bootstrap: BootstrapAdminInput) -> BootstrapAdminResult:
    validate_password_policy(bootstrap.password)
    now = datetime.now(UTC)
    organization_slug = bootstrap.organization_slug.strip()
    display_name = bootstrap.display_name.strip()
    email_normalized = bootstrap.email.strip().casefold()

    organization = db.scalar(select(Organization).where(Organization.slug == organization_slug))
    if organization is None:
        raise BootstrapAdminError(f"organization not found for slug: {bootstrap.organization_slug}")

    user = db.scalar(select(User).where(User.email_normalized == email_normalized))
    created_user = user is None
    if user is None:
        user = User(
            email_normalized=email_normalized,
            display_name=display_name,
            password_hash=hash_password(bootstrap.password),
            status=UserStatus.ACTIVE,
            email_verified_at=now,
        )
        db.add(user)
        db.flush()
    else:
        if user.status == UserStatus.DISABLED:
            raise BootstrapAdminError("refusing to reactivate a disabled user")
        user.display_name = user.display_name or display_name
        user.password_hash = hash_password(bootstrap.password)
        user.status = UserStatus.ACTIVE
        user.email_verified_at = user.email_verified_at or now
        db.flush()

    membership = db.scalar(
        select(StaffMembership)
        .where(
            StaffMembership.organization_id == organization.id,
            StaffMembership.user_id == user.id,
        )
        .order_by(StaffMembership.active.desc(), StaffMembership.created_at.desc())
    )
    created_membership = membership is None
    if membership is None:
        membership = StaffMembership(
            organization_id=organization.id,
            user_id=user.id,
            role=StaffRole.ADMIN,
            active=True,
        )
        db.add(membership)
        db.flush()
    else:
        membership.role = StaffRole.ADMIN
        membership.active = True
        db.flush()

    db.add(
        AuditEvent(
            organization_id=organization.id,
            actor_user_id=None,
            action="ADMIN_BOOTSTRAPPED",
            entity_type="staff_membership",
            entity_id=membership.id,
            event_metadata={
                "organization_slug": organization.slug,
                "created_user": created_user,
                "created_membership": created_membership,
            },
        )
    )
    db.commit()

    return BootstrapAdminResult(
        organization_slug=organization.slug,
        user_id=user.id,
        membership_id=membership.id,
        created_user=created_user,
        created_membership=created_membership,
    )


def main() -> int:
    try:
        bootstrap = load_bootstrap_input_from_env()
        with SessionLocal() as db:
            result = bootstrap_admin(db, bootstrap)
    except (BootstrapAdminError, PasswordPolicyError, SQLAlchemyError) as exc:
        print(f"Admin bootstrap failed: {exc}", file=sys.stderr)
        return 1

    print(
        "Admin bootstrap completed for "
        f"{result.organization_slug}; user_id={result.user_id}; "
        f"membership_id={result.membership_id}; "
        f"created_user={result.created_user}; "
        f"created_membership={result.created_membership}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
