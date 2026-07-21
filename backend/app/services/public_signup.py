"""Transaction-safe, tenant-scoped public signup reservation."""

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

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

    def create(self, shift_id: uuid.UUID, payload: PublicSignupCreate) -> tuple[Signup, int, int]:
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
        signup = Signup(
            shift=shift,
            volunteer=volunteer,
            public_name_snapshot=f"{first_name} {last_name}",
            status=SignupStatus.ACTIVE,
            outcome=SignupOutcome.OPEN,
            source=SignupSource.PUBLIC_SIGNUP,
        )
        self.db.add(signup)
        self.db.commit()
        self.db.refresh(signup)
        return signup, occupied + 1, shift.required_volunteers

    def _occupied(self, shift_id: uuid.UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count(Signup.id)).where(
                    Signup.shift_id == shift_id, Signup.status == SignupStatus.ACTIVE
                )
            )
            or 0
        )
