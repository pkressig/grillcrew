"""Authentication services for login, logout, refresh, password reset, and session data."""

from __future__ import annotations

import hashlib
import html
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
    MIN_PASSWORD_LENGTH,
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
from app.models.organization import Organization, OrganizationSettings
from app.models.planning import Volunteer
from app.schemas.auth import AuthMembershipResponse, AuthSessionResponse, AuthUserResponse
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.branding import (
    OrganizationBranding,
    render_branded_email,
    resolve_organization_branding,
    sender_display_name,
)
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
    organization_slug: str | None
    branding: OrganizationBranding | None


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
        organization = self._resolve_organization(user.id)
        return PasswordResetIssue(
            recipient=user.email_normalized,
            raw_token=raw_token,
            organization_slug=organization.slug if organization is not None else None,
            branding=(
                resolve_organization_branding(
                    self._db, organization, frontend_public_url=self._settings.frontend_public_url
                )
                if organization is not None
                else None
            ),
        )

    def _resolve_organization(self, user_id: uuid.UUID) -> Organization | None:
        """Resolve the organization behind a password-reset request, read-only.

        `PasswordResetToken` intentionally carries no organization reference (that column
        stays untouched here). A user's `Volunteer` record already links to exactly one
        `Organization` (unique `Volunteer.user_id`), so that join is used instead of adding
        any new stored reference. Staff-only users (no `Volunteer` row, e.g. an admin
        resetting their own password) resolve to `None` rather than guessing among their
        organizations, so the reset link/email fall back to generic, unbranded behavior.
        """
        volunteer = self._db.scalar(select(Volunteer).where(Volunteer.user_id == user_id))
        if volunteer is None:
            return None
        return self._db.scalar(
            select(Organization).where(Organization.id == volunteer.organization_id)
        )

    def reset_password(
        self, *, raw_token: str, new_password: str
    ) -> tuple[IssuedSession, AuthSessionResponse]:
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

        minimum_length = self._resolve_password_minimum_length(token.user_id)
        validate_password_policy(new_password, minimum_length=minimum_length)

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
        session = issue_session(db=self._db, user=token.user, settings=self._settings, now=now)
        self._db.commit()
        return session, build_session_response(token.user)

    def _resolve_password_minimum_length(self, user_id: uuid.UUID) -> int:
        volunteer = self._db.scalar(select(Volunteer).where(Volunteer.user_id == user_id))
        if volunteer is None:
            return MIN_PASSWORD_LENGTH
        settings_record = self._db.scalar(
            select(OrganizationSettings).where(
                OrganizationSettings.organization_id == volunteer.organization_id
            )
        )
        return settings_record.volunteer_password_min_length if settings_record else 6


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


def dispatch_password_reset_email(
    settings: Settings,
    *,
    recipient: str,
    raw_token: str,
    organization_slug: str | None,
    branding: OrganizationBranding | None = None,
) -> None:
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
    send_password_reset_email(
        sender,
        recipient=recipient,
        raw_token=raw_token,
        organization_slug=organization_slug,
        frontend_public_url=settings.frontend_public_url,
        branding=branding,
    )


def send_password_reset_email(
    sender: EmailSender,
    *,
    recipient: str,
    raw_token: str,
    organization_slug: str | None,
    frontend_public_url: str,
    branding: OrganizationBranding | None = None,
) -> None:
    subject = "Passwort zurücksetzen"
    reset_url = f"{frontend_public_url}/reset-password/{raw_token}"
    if organization_slug:
        reset_url = f"{reset_url}?org={organization_slug}"
    body_text = (
        "Für dein Konto wurde ein neues Passwort angefordert.\n\n"
        f"Neues Passwort festlegen: {reset_url}\n\n"
        "Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren."
    )
    body_html = (
        "<p>Für dein Konto wurde ein neues Passwort angefordert.</p>"
        "<p>Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>"
    )
    content = render_branded_email(
        branding=branding,
        heading=subject,
        body_html=body_html,
        body_text=body_text,
        cta_label="Neues Passwort festlegen",
        cta_url=reset_url,
    )
    message = EmailMessage(
        to=recipient,
        subject=subject,
        body_text=content.text,
        body_html=content.html,
        from_display_name=sender_display_name(branding),
    )
    try:
        sender.send(message)
    except EmailSendError:
        logger.warning("password reset email failed to=%s subject=%s", recipient, subject)


def dispatch_volunteer_registration_email(
    settings: Settings,
    *,
    recipient: str,
    first_name: str,
    organization_name: str,
    organization_slug: str,
    branding: OrganizationBranding | None = None,
) -> None:
    """Build the configured `EmailSender` and send, deferred until after the response.

    Registration itself must never fail or be delayed by email delivery, so this is
    always called from a background task after the account is already committed.
    """
    try:
        sender = build_email_sender(settings)
    except ValueError:
        logger.error("volunteer registration email sender unavailable to=%s", recipient)
        return
    send_volunteer_registration_email(
        sender,
        recipient=recipient,
        first_name=first_name,
        organization_name=organization_name,
        organization_slug=organization_slug,
        frontend_public_url=settings.frontend_public_url,
        branding=branding,
    )


def send_volunteer_registration_email(
    sender: EmailSender,
    *,
    recipient: str,
    first_name: str,
    organization_name: str,
    organization_slug: str,
    frontend_public_url: str,
    branding: OrganizationBranding | None = None,
) -> None:
    subject = f"Willkommen bei {organization_name}"
    plan_url = f"{frontend_public_url}/{organization_slug}"
    body_text = (
        f"Hallo {first_name}\n\n"
        f"Dein Helferkonto bei {organization_name} wurde erstellt. Melde dich mit deiner "
        "E-Mail-Adresse und deinem Passwort an, um dich für Einsätze einzutragen.\n\n"
        f"Zum Einsatzplan: {plan_url}"
    )
    body_html = (
        f"<p>Hallo {html.escape(first_name)}</p>"
        f"<p>Dein Helferkonto bei {html.escape(organization_name)} wurde erstellt. Melde dich "
        "mit deiner E-Mail-Adresse und deinem Passwort an, um dich für Einsätze "
        "einzutragen.</p>"
    )
    content = render_branded_email(
        branding=branding,
        heading=subject,
        body_html=body_html,
        body_text=body_text,
        cta_label="Zum Einsatzplan",
        cta_url=plan_url,
    )
    message = EmailMessage(
        to=recipient,
        subject=subject,
        body_text=content.text,
        body_html=content.html,
        from_display_name=sender_display_name(branding),
    )
    try:
        sender.send(message)
    except EmailSendError:
        logger.warning("volunteer registration email failed to=%s subject=%s", recipient, subject)


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
