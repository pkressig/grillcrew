"""Authentication services for login, logout, refresh, password reset, and session data."""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.core.security.csrf import derive_csrf_secret, generate_csrf_token
from app.core.security.jwt import create_access_token
from app.core.security.password import (
    hash_password,
    validate_password_policy,
    verify_password_or_dummy,
)
from app.models.identity import (
    AuditEvent,
    PasswordResetToken,
    RefreshToken,
    StaffMembership,
    User,
    UserStatus,
)
from app.schemas.auth import AuthMembershipResponse, AuthSessionResponse, AuthUserResponse
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.factory import build_email_sender

logger = logging.getLogger(__name__)

ACCESS_TOKEN_COOKIE_NAME = "gc_access_token"  # noqa: S105 - cookie name, not a secret
REFRESH_TOKEN_COOKIE_NAME = "gc_refresh_token"  # noqa: S105 - cookie name, not a secret
REFRESH_TOKEN_BYTES = 32
PASSWORD_RESET_TOKEN_BYTES = 32


class InvalidCredentialsError(Exception):
    """Raised when login credentials must be rejected generically."""


class InvalidRefreshTokenError(Exception):
    """Raised when a refresh token is missing, expired, unknown, or revoked."""


class InvalidPasswordResetTokenError(Exception):
    """Raised when a password reset token is missing, expired, unknown, or consumed."""


@dataclass(frozen=True)
class IssuedSession:
    access_token: str
    refresh_token: str
    csrf_token: str
    access_token_max_age: int
    refresh_token_max_age: int


@dataclass(frozen=True)
class RefreshTokenValidation:
    token: RefreshToken
    user: User


@dataclass(frozen=True)
class PasswordResetIssue:
    recipient: str
    raw_token: str


class LoginService:
    def __init__(self, db: Session, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    def login(self, *, email: str, password: str) -> tuple[IssuedSession, AuthSessionResponse]:
        email_normalized = normalize_email(email)
        user = self._db.scalar(
            select(User)
            .where(User.email_normalized == email_normalized)
            .options(
                selectinload(User.staff_memberships).selectinload(StaffMembership.organization)
            )
        )
        password_hash = user.password_hash if user is not None else None
        password_valid = verify_password_or_dummy(password, password_hash)
        if (
            user is None
            or not password_valid
            or user.status != UserStatus.ACTIVE
            or user.password_hash is None
        ):
            raise InvalidCredentialsError

        now = datetime.now(UTC)
        user.last_login_at = now
        session = issue_session(db=self._db, user=user, settings=self._settings, now=now)
        self._db.commit()
        return session, build_session_response(user)


class LogoutService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def logout(self, *, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        row = refresh_token_by_raw(self._db, refresh_token)
        if row is None:
            return
        if row.revoked_at is None:
            row.revoked_at = datetime.now(UTC)
            self._db.commit()


class RefreshService:
    def __init__(self, db: Session, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    def validate(self, *, refresh_token: str | None) -> RefreshTokenValidation:
        if not refresh_token:
            raise InvalidRefreshTokenError
        token = refresh_token_by_raw(self._db, refresh_token)
        if token is None:
            raise InvalidRefreshTokenError
        if token.revoked_at is not None:
            self.revoke_family(family_id=token.family_id)
            raise InvalidRefreshTokenError
        if token.expires_at <= datetime.now(UTC):
            raise InvalidRefreshTokenError
        if token.user.status != UserStatus.ACTIVE:
            raise InvalidRefreshTokenError
        return RefreshTokenValidation(token=token, user=token.user)

    def refresh(self, *, refresh_token: str) -> tuple[IssuedSession, AuthSessionResponse]:
        validated = self.validate(refresh_token=refresh_token)
        return self.refresh_validated(validated)

    def refresh_validated(
        self, validated: RefreshTokenValidation
    ) -> tuple[IssuedSession, AuthSessionResponse]:
        now = datetime.now(UTC)
        result = cast(
            "CursorResult[None]",
            self._db.execute(
                update(RefreshToken)
                .where(RefreshToken.id == validated.token.id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=now)
            ),
        )
        if result.rowcount == 0:
            # Lost a race against a concurrent refresh using the same token: the
            # other request already claimed and rotated it. Fail closed instead
            # of issuing a second token pair for the same rotation step.
            self._db.rollback()
            raise InvalidRefreshTokenError
        session = issue_session(
            db=self._db,
            user=validated.user,
            settings=self._settings,
            now=now,
            family_id=validated.token.family_id,
        )
        self._db.commit()
        return session, build_session_response(validated.user)

    def revoke_family(self, *, family_id: uuid.UUID) -> None:
        self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        self._db.commit()


class PasswordResetService:
    def __init__(self, db: Session, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    def request_reset(self, *, email: str) -> PasswordResetIssue | None:
        email_normalized = normalize_email(email)
        user = self._db.scalar(select(User).where(User.email_normalized == email_normalized))
        if user is None or user.status != UserStatus.ACTIVE or user.password_hash is None:
            return None

        now = datetime.now(UTC)
        self._db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )
        raw_token = secrets.token_urlsafe(PASSWORD_RESET_TOKEN_BYTES)
        self._db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_password_reset_token(raw_token),
                expires_at=now + timedelta(hours=self._settings.password_reset_token_ttl_hours),
            )
        )
        self._db.commit()
        return PasswordResetIssue(recipient=user.email_normalized, raw_token=raw_token)

    def reset_password(self, *, raw_token: str, new_password: str) -> None:
        validate_password_policy(new_password)
        token = self._db.scalar(
            select(PasswordResetToken)
            .where(PasswordResetToken.token_hash == hash_password_reset_token(raw_token))
            .options(selectinload(PasswordResetToken.user))
        )
        now = datetime.now(UTC)
        if (
            token is None
            or token.consumed_at is not None
            or token.expires_at <= now
            or token.user.status != UserStatus.ACTIVE
        ):
            raise InvalidPasswordResetTokenError

        token.user.password_hash = hash_password(new_password)
        token.consumed_at = now
        self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == token.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self._db.add(
            AuditEvent(
                organization_id=None,
                actor_user_id=None,
                action="PASSWORD_RESET",
                entity_type="user",
                entity_id=token.user_id,
                event_metadata={},
            )
        )
        self._db.commit()


def issue_session(
    *,
    db: Session,
    user: User,
    settings: Settings,
    now: datetime | None = None,
    family_id: uuid.UUID | None = None,
) -> IssuedSession:
    issued_at = now or datetime.now(UTC)
    refresh_ttl = timedelta(days=settings.refresh_token_ttl_days)
    family = family_id or uuid.uuid4()
    raw_refresh_token = secrets.token_urlsafe(REFRESH_TOKEN_BYTES)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh_token),
            family_id=family,
            expires_at=issued_at + refresh_ttl,
        )
    )
    access_ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    csrf_token = generate_csrf_token(
        binding_key=str(family),
        secret=derive_csrf_secret(settings.jwt_secret_key),
    )
    return IssuedSession(
        access_token=create_access_token(
            subject=str(user.id),
            secret=settings.jwt_secret_key,
            ttl=access_ttl,
        ),
        refresh_token=raw_refresh_token,
        csrf_token=csrf_token,
        access_token_max_age=int(access_ttl.total_seconds()),
        refresh_token_max_age=int(refresh_ttl.total_seconds()),
    )


def refresh_token_by_raw(db: Session, raw_token: str) -> RefreshToken | None:
    return db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .options(
            selectinload(RefreshToken.user)
            .selectinload(User.staff_memberships)
            .selectinload(StaffMembership.organization)
        )
    )


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def hash_password_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def dispatch_password_reset_email(settings: Settings, *, recipient: str, raw_token: str) -> None:
    """Build the configured `EmailSender` and send, deferred until after the response.

    Building the sender can fail if SMTP is not configured outside development/test.
    That failure must never surface as a different HTTP response for existing vs.
    missing accounts (a user-enumeration oracle), so construction happens here,
    inside the background task, which only ever runs after the generic 202
    response has already been sent to the caller.
    """
    try:
        sender = build_email_sender(settings)
    except ValueError:
        logger.error("password reset email sender unavailable to=%s", recipient)
        return
    send_password_reset_email(sender, recipient=recipient, raw_token=raw_token)


def send_password_reset_email(sender: EmailSender, *, recipient: str, raw_token: str) -> None:
    subject = "Reset your password"
    message = EmailMessage(
        to=recipient,
        subject=subject,
        body_text=(
            "A password reset was requested for your account.\n\n"
            f"Open /reset-password/{raw_token} to choose a new password.\n\n"
            "If you did not request this, ignore this email."
        ),
    )
    try:
        sender.send(message)
    except EmailSendError:
        logger.warning("password reset email failed to=%s subject=%s", recipient, subject)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def build_session_response(user: User) -> AuthSessionResponse:
    return AuthSessionResponse(
        user=AuthUserResponse(
            id=str(user.id),
            email_normalized=user.email_normalized,
            display_name=user.display_name,
            status=user.status,
        ),
        memberships=[
            AuthMembershipResponse(
                organization_id=str(membership.organization_id),
                organization_slug=membership.organization.slug,
                organization_name=membership.organization.name,
                role=membership.role,
            )
            for membership in user.staff_memberships
            if membership.active
        ],
    )
