"""Self-service volunteer profile endpoints."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentUser, get_current_user, validate_csrf
from app.api.public import to_public_response
from app.core.config import get_settings
from app.db.session import get_db
from app.models.family import FamilyMember, FamilyMemberType
from app.models.identity import AuditEvent
from app.models.organization import Organization
from app.models.planning import (
    Event,
    Shift,
    Signup,
    SignupOutcome,
    SignupStatus,
    Volunteer,
    VolunteerCompensation,
)
from app.schemas.auth import (
    VolunteerChildCreate,
    VolunteerChildUpdate,
    VolunteerFamilyChild,
    VolunteerProfileResponse,
    VolunteerSignupCancelRequest,
    VolunteerSignupCompensationUpdate,
    VolunteerSignupSummary,
)
from app.services.public_signup import can_self_cancel

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


def _get_own_signup(signup_id: uuid.UUID, volunteer: Volunteer, db: Session) -> Signup:
    signup = db.scalar(
        select(Signup).where(Signup.id == signup_id, Signup.volunteer_id == volunteer.id)
    )
    if signup is None:
        raise HTTPException(status_code=404, detail="signup not found")
    return signup


def _resolve_child_name(
    family_member_id: uuid.UUID | None, family_id: uuid.UUID, db: Session
) -> str | None:
    if family_member_id is None:
        return None
    member = db.scalar(
        select(FamilyMember).where(
            FamilyMember.id == family_member_id,
            FamilyMember.member_type == FamilyMemberType.CHILD,
            FamilyMember.family_id == family_id,
        )
    )
    return f"{member.first_name} {member.last_name}" if member is not None else None


def _validate_child_member(
    family_member_id: uuid.UUID, family_id: uuid.UUID, db: Session
) -> FamilyMember:
    member = db.scalar(
        select(FamilyMember).where(
            FamilyMember.id == family_member_id,
            FamilyMember.member_type == FamilyMemberType.CHILD,
            FamilyMember.family_id == family_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=422, detail="invalid child member")
    return member


@router.get("/profile", response_model=VolunteerProfileResponse)
def get_profile(
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> VolunteerProfileResponse:
    volunteer = _get_profile(current_user.user.id, db)
    return _profile_response(volunteer, db)


def _profile_response(volunteer: Volunteer, db: Session) -> VolunteerProfileResponse:
    family_id = volunteer_family_id(volunteer, db)
    member_name = _resolve_child_name(volunteer.compensation_family_member_id, family_id, db)

    organization = db.get(Organization, volunteer.organization_id)
    if organization is None:
        raise HTTPException(status_code=500, detail="organization missing")
    timezone = organization.timezone

    rows = db.execute(
        select(Signup, Shift)
        .join(Shift, Shift.id == Signup.shift_id)
        .where(Signup.volunteer_id == volunteer.id)
        .order_by(Shift.starts_at.asc())
    ).all()
    children = db.scalars(
        select(FamilyMember)
        .where(
            FamilyMember.family_id == family_id,
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
        credited_id = signup.credited_family_member_id or volunteer.compensation_family_member_id
        summary = VolunteerSignupSummary(
            id=str(signup.id),
            event_title=event.title,
            event_date=event.date,
            shift_starts_at=shift.starts_at,
            shift_ends_at=shift.ends_at,
            signup_status=signup.status,
            outcome=signup.outcome,
            compensation_type=signup.compensation_type or volunteer.compensation_preference,
            credited_family_member_id=str(credited_id) if credited_id else None,
            credited_family_member_name=_resolve_child_name(credited_id, family_id, db),
            can_cancel=(
                signup.status == SignupStatus.ACTIVE
                and signup.outcome == SignupOutcome.OPEN
                and can_self_cancel(shift.starts_at, timezone, now)
            ),
        )
        if (
            shift.ends_at < now
            or signup.outcome != SignupOutcome.OPEN
            or signup.status != SignupStatus.ACTIVE
        ):
            completed.append(summary)
        else:
            upcoming.append(summary)

    return VolunteerProfileResponse(
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        phone=volunteer.phone_display,
        email=volunteer.email_display,
        organization=to_public_response(organization),
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
        _validate_child_member(
            payload.compensation_family_member_id, volunteer_family_id(volunteer, db), db
        )
    volunteer.first_name = payload.first_name.strip()
    volunteer.last_name = payload.last_name.strip()
    volunteer.phone_display = payload.phone.strip()
    volunteer.compensation_preference = payload.compensation_preference
    volunteer.compensation_family_member_id = payload.compensation_family_member_id
    current_user.user.display_name = f"{volunteer.first_name} {volunteer.last_name}"
    db.commit()
    db.refresh(volunteer)
    return get_profile(current_user, db)


@router.patch("/signups/{signup_id}", response_model=VolunteerProfileResponse)
def update_signup_compensation(
    signup_id: uuid.UUID,
    payload: VolunteerSignupCompensationUpdate,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    _csrf: None = Depends(validate_csrf),
) -> VolunteerProfileResponse:
    _ensure_origin_and_host(request, db, get_settings())
    volunteer = _get_profile(current_user.user.id, db)
    signup = _get_own_signup(signup_id, volunteer, db)
    credited_member = None
    if payload.credited_family_member_id is not None:
        credited_member = _validate_child_member(
            payload.credited_family_member_id, volunteer_family_id(volunteer, db), db
        )
    signup.compensation_type = payload.compensation_type
    signup.credited_family_member_id = credited_member.id if credited_member else None
    db.commit()
    return _profile_response(volunteer, db)


@router.post("/signups/{signup_id}/cancel", response_model=VolunteerProfileResponse)
def cancel_own_signup(
    signup_id: uuid.UUID,
    payload: VolunteerSignupCancelRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    _csrf: None = Depends(validate_csrf),
) -> VolunteerProfileResponse:
    _ensure_origin_and_host(request, db, get_settings())
    volunteer = _get_profile(current_user.user.id, db)
    signup = _get_own_signup(signup_id, volunteer, db)
    shift = db.get(Shift, signup.shift_id)
    if shift is None:
        raise HTTPException(status_code=404, detail="shift not found")
    if signup.status != SignupStatus.ACTIVE or signup.outcome != SignupOutcome.OPEN:
        raise HTTPException(status_code=409, detail="signup cannot be cancelled")
    organization = db.get(Organization, volunteer.organization_id)
    if organization is None:
        raise HTTPException(status_code=500, detail="organization missing")
    now = datetime.now(UTC)
    if not can_self_cancel(shift.starts_at, organization.timezone, now):
        raise HTTPException(status_code=409, detail="cancellation deadline passed")
    signup.status = SignupStatus.CANCELLED_BY_VOLUNTEER
    signup.cancelled_at = now
    signup.cancellation_reason = payload.reason or "VOLUNTEER_SELF_SERVICE"
    db.add(
        AuditEvent(
            organization_id=volunteer.organization_id,
            actor_user_id=current_user.user.id,
            action="SIGNUP_CANCELLED_BY_VOLUNTEER_SELF_SERVICE",
            entity_type="signup",
            entity_id=signup.id,
            event_metadata={"reason": payload.reason} if payload.reason else {},
        )
    )
    db.commit()
    return _profile_response(volunteer, db)


@router.post("/children", response_model=VolunteerFamilyChild, status_code=status.HTTP_201_CREATED)
def create_child(
    payload: VolunteerChildCreate,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    _csrf: None = Depends(validate_csrf),
) -> VolunteerFamilyChild:
    _ensure_origin_and_host(request, db, get_settings())
    volunteer = _get_profile(current_user.user.id, db)
    family_id = volunteer_family_id(volunteer, db)
    child = FamilyMember(
        family_id=family_id,
        member_type=FamilyMemberType.CHILD,
        first_name=payload.first_name,
        last_name=payload.last_name,
        team_name=payload.team_name,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return VolunteerFamilyChild(id=str(child.id), name=f"{child.first_name} {child.last_name}")


@router.patch("/children/{child_id}", response_model=VolunteerFamilyChild)
def update_child(
    child_id: uuid.UUID,
    payload: VolunteerChildUpdate,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    _csrf: None = Depends(validate_csrf),
) -> VolunteerFamilyChild:
    _ensure_origin_and_host(request, db, get_settings())
    volunteer = _get_profile(current_user.user.id, db)
    child = _validate_child_member(child_id, volunteer_family_id(volunteer, db), db)
    child.first_name = payload.first_name
    child.last_name = payload.last_name
    child.team_name = payload.team_name
    db.commit()
    db.refresh(child)
    return VolunteerFamilyChild(id=str(child.id), name=f"{child.first_name} {child.last_name}")


@router.delete("/children/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_child(
    child_id: uuid.UUID,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    _csrf: None = Depends(validate_csrf),
) -> None:
    _ensure_origin_and_host(request, db, get_settings())
    volunteer = _get_profile(current_user.user.id, db)
    child = _validate_child_member(child_id, volunteer_family_id(volunteer, db), db)
    db.delete(child)
    db.commit()


def volunteer_family_id(volunteer: Volunteer, db: Session) -> uuid.UUID:
    family_id = db.scalar(
        select(FamilyMember.family_id).where(FamilyMember.volunteer_id == volunteer.id)
    )
    if family_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="family missing"
        )
    return family_id
