"""Transaction-safe, tenant-scoped public signup reservation."""

import hashlib
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.planning import (
    ClubYear,
    Event,
    EventStatus,
    Season,
    Shift,
    ShiftStatus,
    Signup,
    SignupOutcome,
    SignupSource,
    SignupStatus,
    Volunteer,
)
from app.schemas.planning import PublicSignupCreate


class PublicSignupNotFoundError(Exception):
    pass


class PublicSignupConflictError(Exception):
    pass


class PublicSignupValidationError(Exception):
    pass


@dataclass(frozen=True)
class CreatedPublicSignup:
    signup: Signup
    occupied: int
    required: int
    management_token: str


def hash_management_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def cancellation_deadline(shift_start: datetime, timezone: str) -> datetime:
    local_shift_date = shift_start.astimezone(ZoneInfo(timezone)).date()
    deadline_date = local_shift_date - timedelta(days=8)
    return datetime.combine(deadline_date, time(23, 59, 59), ZoneInfo(timezone))


def can_self_cancel(shift_start: datetime, timezone: str, now: datetime) -> bool:
    return now.astimezone(ZoneInfo(timezone)) <= cancellation_deadline(shift_start, timezone)


def normalize_email(value: str) -> str:
    return value.strip().casefold()


def normalize_phone(value: str) -> str:
    stripped = value.strip()
    prefix = "+" if stripped.startswith("+") else ""
    return prefix + "".join(character for character in stripped if character.isdigit())


def validate_contact(email: str, phone: str) -> None:
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise PublicSignupValidationError("invalid contact")
    if len(phone.lstrip("+")) < 7:
        raise PublicSignupValidationError("invalid contact")


class PublicSignupService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def create(self, shift_id: uuid.UUID, payload: PublicSignupCreate) -> CreatedPublicSignup:
        email = normalize_email(payload.email)
        phone = normalize_phone(payload.phone)
        validate_contact(email, phone)
        shift = self.db.scalar(
            select(Shift)
            .join(Event)
            .join(Season)
            .join(ClubYear)
            .where(
                Shift.id == shift_id,
                ClubYear.organization_id == self.organization_id,
                Event.status == EventStatus.PUBLISHED,
            )
            .with_for_update(of=Shift)
        )
        if shift is None:
            raise PublicSignupNotFoundError
        if shift.status != ShiftStatus.OPEN:
            raise PublicSignupConflictError("shift unavailable")
        occupied = self._occupied(shift.id)
        if occupied >= shift.required_volunteers:
            raise PublicSignupConflictError("shift full")
        duplicate = self.db.scalar(
            select(Signup.id)
            .join(Volunteer)
            .where(
                Signup.shift_id == shift.id,
                Signup.status == SignupStatus.ACTIVE,
                Volunteer.organization_id == self.organization_id,
                or_(Volunteer.email_normalized == email, Volunteer.phone_normalized == phone),
            )
        )
        if duplicate is not None:
            raise PublicSignupConflictError("duplicate signup")
        now = datetime.now(UTC)
        first_name = payload.first_name.strip()
        last_name = payload.last_name.strip()
        if not first_name or not last_name:
            raise PublicSignupValidationError("invalid name")
        volunteer = Volunteer(
            organization_id=self.organization_id,
            first_name=first_name,
            last_name=last_name,
            phone_normalized=phone,
            phone_display=payload.phone.strip(),
            email_normalized=email,
            email_display=payload.email.strip(),
            public_display_consent_at=now,
            created_from=SignupSource.PUBLIC_SIGNUP,
        )
        management_token = secrets.token_urlsafe(32)
        signup = Signup(
            shift=shift,
            volunteer=volunteer,
            public_name_snapshot=f"{first_name} {last_name}",
            status=SignupStatus.ACTIVE,
            outcome=SignupOutcome.OPEN,
            source=SignupSource.PUBLIC_SIGNUP,
            management_token_hash=hash_management_token(management_token),
        )
        self.db.add(signup)
        self.db.commit()
        self.db.refresh(signup)
        return CreatedPublicSignup(
            signup, occupied + 1, shift.required_volunteers, management_token
        )

    def get_managed(self, token: str) -> Signup:
        signup = self.db.scalar(
            select(Signup)
            .join(Shift)
            .join(Event)
            .join(Season)
            .join(ClubYear)
            .options(
                joinedload(Signup.volunteer),
                joinedload(Signup.shift).joinedload(Shift.event),
            )
            .where(
                Signup.management_token_hash == hash_management_token(token),
                ClubYear.organization_id == self.organization_id,
            )
        )
        if signup is None:
            raise PublicSignupNotFoundError
        return signup

    def cancel(self, token: str, timezone: str, now: datetime | None = None) -> Signup:
        signup = self.get_managed(token)
        if signup.status == SignupStatus.CANCELLED_BY_VOLUNTEER:
            return signup
        if signup.status != SignupStatus.ACTIVE:
            raise PublicSignupConflictError("signup unavailable")
        cancellation_time = now or datetime.now(UTC)
        if not can_self_cancel(signup.shift.starts_at, timezone, cancellation_time):
            raise PublicSignupConflictError("cancellation deadline passed")
        signup.status = SignupStatus.CANCELLED_BY_VOLUNTEER
        signup.cancelled_at = cancellation_time
        signup.cancellation_reason = "VOLUNTEER_SELF_SERVICE"
        self.db.commit()
        self.db.refresh(signup)
        return signup

    def _occupied(self, shift_id: uuid.UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count(Signup.id)).where(
                    Signup.shift_id == shift_id, Signup.status == SignupStatus.ACTIVE
                )
            )
            or 0
        )
