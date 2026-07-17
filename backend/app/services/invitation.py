"""Single-use organization invitation issuance and acceptance."""

from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.core.security.password import PasswordPolicyError, hash_password, validate_password_policy
from app.models.identity import AuditEvent, Invitation, StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization
from app.services.auth import normalize_email
from app.services.email.base import EmailMessage, EmailSender, EmailSendError
from app.services.email.factory import build_email_sender

logger = logging.getLogger(__name__)
INVITATION_TOKEN_BYTES = 32


class DuplicateInvitationError(Exception):
    """Raised when the same user already has a pending tenant invitation."""


class InvalidInvitationTokenError(Exception):
    """Raised for every unknown or unusable invitation token."""


@dataclass(frozen=True)
class InvitationIssue:
    recipient: str
    organization_name: str
    raw_token: str


class InvitationService:
    def __init__(self, db: Session, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    def create(
        self,
        *,
        email: str,
        role: StaffRole,
        organization: Organization,
        created_by: User,
    ) -> InvitationIssue:
        email_normalized = normalize_email(email)
        user = self._db.scalar(select(User).where(User.email_normalized == email_normalized))
        if user is None:
            user = User(
                email_normalized=email_normalized,
                password_hash=None,
                status=UserStatus.INVITED,
            )
            self._db.add(user)
            self._db.flush()

        pending = self._db.scalar(
            select(Invitation.id).where(
                Invitation.organization_id == organization.id,
                Invitation.user_id == user.id,
                Invitation.accepted_at.is_(None),
                Invitation.revoked_at.is_(None),
            )
        )
        if pending is not None:
            self._db.rollback()
            raise DuplicateInvitationError

        now = datetime.now(UTC)
        raw_token = secrets.token_urlsafe(INVITATION_TOKEN_BYTES)
        self._db.add(
            Invitation(
                user_id=user.id,
                organization_id=organization.id,
                role=role,
                token_hash=hash_invitation_token(raw_token),
                expires_at=now + timedelta(days=self._settings.invitation_token_ttl_days),
                created_by_user_id=created_by.id,
            )
        )
        self._db.commit()
        return InvitationIssue(
            recipient=user.email_normalized,
            organization_name=organization.name,
            raw_token=raw_token,
        )

    def accept(self, *, raw_token: str, display_name: str, password: str | None) -> None:
        invitation = self._db.scalar(
            select(Invitation)
            .where(Invitation.token_hash == hash_invitation_token(raw_token))
            .options(selectinload(Invitation.user))
        )
        now = datetime.now(UTC)
        if (
            invitation is None
            or invitation.accepted_at is not None
            or invitation.revoked_at is not None
            or invitation.expires_at <= now
            or invitation.user.status == UserStatus.DISABLED
        ):
            raise InvalidInvitationTokenError

        if invitation.user.status == UserStatus.INVITED:
            if password is None:
                raise PasswordPolicyError("password is required for an invited user")
            validate_password_policy(password)
            invitation.user.password_hash = hash_password(password)
            invitation.user.display_name = display_name.strip()
            invitation.user.status = UserStatus.ACTIVE

        claimed = cast(
            "CursorResult[None]",
            self._db.execute(
                update(Invitation)
                .where(
                    Invitation.id == invitation.id,
                    Invitation.accepted_at.is_(None),
                    Invitation.revoked_at.is_(None),
                    Invitation.expires_at > now,
                )
                .values(accepted_at=now)
            ),
        )
        if claimed.rowcount != 1:
            self._db.rollback()
            raise InvalidInvitationTokenError

        membership = self._db.scalar(
            select(StaffMembership)
            .where(
                StaffMembership.organization_id == invitation.organization_id,
                StaffMembership.user_id == invitation.user_id,
            )
            .order_by(StaffMembership.created_at.desc())
            .limit(1)
        )
        if membership is None:
            membership = StaffMembership(
                organization_id=invitation.organization_id,
                user_id=invitation.user_id,
                role=invitation.role,
                active=True,
            )
            self._db.add(membership)
            self._db.flush()
        else:
            membership.role = invitation.role
            membership.active = True

        self._db.add(
            AuditEvent(
                organization_id=invitation.organization_id,
                actor_user_id=invitation.created_by_user_id,
                action="STAFF_MEMBERSHIP_GRANTED",
                entity_type="staff_membership",
                entity_id=membership.id,
                event_metadata={},
            )
        )
        self._db.commit()


def hash_invitation_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def dispatch_invitation_email(
    settings: Settings,
    *,
    recipient: str,
    organization_name: str,
    raw_token: str,
) -> None:
    try:
        sender = build_email_sender(settings)
    except ValueError:
        logger.error("invitation email sender unavailable to=%s", recipient)
        return
    send_invitation_email(
        sender,
        recipient=recipient,
        organization_name=organization_name,
        raw_token=raw_token,
    )


def send_invitation_email(
    sender: EmailSender,
    *,
    recipient: str,
    organization_name: str,
    raw_token: str,
) -> None:
    subject = f"Invitation to {organization_name}"
    message = EmailMessage(
        to=recipient,
        subject=subject,
        body_text=(
            f"You have been invited to {organization_name}.\n\n"
            f"Open /invite/{raw_token} to accept the invitation."
        ),
    )
    try:
        sender.send(message)
    except EmailSendError:
        logger.warning("invitation email failed to=%s subject=%s", recipient, subject)
