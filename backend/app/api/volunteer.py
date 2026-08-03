"""Self-service volunteer profile endpoints."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentUser, get_current_user, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.family import Family, FamilyMember, FamilyMemberType
from app.models.planning import (
    Event,
    Shift,
    Signup,
    SignupOutcome,
    Volunteer,
    VolunteerCompensation,
)
from app.schemas.auth import VolunteerFamilyChild, VolunteerProfileResponse, VolunteerSignupSummary

router = APIRouter(prefix="/api/volunteer", tags=["volunteer"])


class VolunteerProfileUpdate(BaseModel):  # type: ignore[explicit-any]
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=50)
    compensation_preference: VolunteerCompensation
    compensation_family_member_id: uuid.UUID | None = None


def _get_profile(user_id: uuid.UUID, db: Session) -> Volunteer:
    volunteer = db.scalar(select(Volunteer).where(Volunteer.user_id == user_id))
    if volunteer is None:
        raise HTTPException(status_code=404, detail="volunteer profile not found")
    return volunteer


@router.get("/profile", response_model=VolunteerProfileResponse)
def get_profile(
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> VolunteerProfileResponse:
    volunteer = _get_profile(current_user.user.id, db)
    return _profile_response(volunteer, db)


def _profile_response(volunteer: Volunteer, db: Session) -> VolunteerProfileResponse:
    member_name: str | None = None
    if volunteer.compensation_family_member_id is not None:
        member = db.scalar(
            select(FamilyMember)
            .join(Family, Family.id == FamilyMember.family_id)
            .where(
                FamilyMember.id == volunteer.compensation_family_member_id,
                FamilyMember.member_type == FamilyMemberType.CHILD,
                FamilyMember.family_id == volunteer_family_id(volunteer, db),
            )
        )
        if member is not None:
            member_name = f"{member.first_name} {member.last_name}"

    rows = db.execute(
        select(Signup, Shift)
        .join(Shift, Shift.id == Signup.shift_id)
        .where(Signup.volunteer_id == volunteer.id)
        .order_by(Shift.starts_at.asc())
    ).all()
    children = db.scalars(
        select(FamilyMember)
        .where(
            FamilyMember.family_id == volunteer_family_id(volunteer, db),
            FamilyMember.member_type == FamilyMemberType.CHILD,
        )
        .order_by(FamilyMember.last_name, FamilyMember.first_name)
    )
    now = datetime.now(UTC)
    upcoming: list[VolunteerSignupSummary] = []
    completed: list[VolunteerSignupSummary] = []
    for signup, shift in rows:
        event = db.get(Event, shift.event_id)
        if event is None:
            continue
        summary = VolunteerSignupSummary(
            id=str(signup.id),
            event_title=event.title,
            event_date=event.date,
            event_location=event.location,
            shift_starts_at=shift.starts_at,
            shift_ends_at=shift.ends_at,
            signup_status=signup.status,
            outcome=signup.outcome,
        )
        if shift.ends_at < now or signup.outcome != SignupOutcome.OPEN:
            completed.append(summary)
        else:
            upcoming.append(summary)

    return VolunteerProfileResponse(
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        phone=volunteer.phone_display,
        email=volunteer.email_display,
        compensation_preference=volunteer.compensation_preference,
        compensation_family_member_id=(
            str(volunteer.compensation_family_member_id)
            if volunteer.compensation_family_member_id
            else None
        ),
        compensation_family_member_name=member_name,
        upcoming_signups=upcoming,
        completed_signups=completed,
        family_children=[
            VolunteerFamilyChild(id=str(child.id), name=f"{child.first_name} {child.last_name}")
            for child in children
        ],
    )


@router.patch("/profile", response_model=VolunteerProfileResponse)
def update_profile(
    payload: VolunteerProfileUpdate,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    _csrf: None = Depends(validate_csrf),
) -> VolunteerProfileResponse:
    _ensure_origin_and_host(request, db, get_settings())
    volunteer = _get_profile(current_user.user.id, db)
    if payload.compensation_family_member_id is not None:
        member = db.scalar(
            select(FamilyMember)
            .join(Family)
            .where(
                FamilyMember.id == payload.compensation_family_member_id,
                FamilyMember.member_type == FamilyMemberType.CHILD,
                Family.id == volunteer_family_id(volunteer, db),
            )
        )
        if member is None:
            raise HTTPException(status_code=422, detail="invalid child member")
    volunteer.first_name = payload.first_name.strip()
    volunteer.last_name = payload.last_name.strip()
    volunteer.phone_display = payload.phone.strip()
    volunteer.compensation_preference = payload.compensation_preference
    volunteer.compensation_family_member_id = payload.compensation_family_member_id
    current_user.user.display_name = f"{volunteer.first_name} {volunteer.last_name}"
    db.commit()
    db.refresh(volunteer)
    return get_profile(current_user, db)


def volunteer_family_id(volunteer: Volunteer, db: Session) -> uuid.UUID:
    family_id = db.scalar(
        select(FamilyMember.family_id).where(FamilyMember.volunteer_id == volunteer.id)
    )
    if family_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="family missing"
        )
    return family_id
