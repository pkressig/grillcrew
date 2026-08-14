"""Authenticated organization family and volunteer administration endpoints."""

# ruff: noqa: B008

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.core.security.password import PasswordPolicyError
from app.db.session import get_db
from app.models.identity import StaffRole
from app.models.organization import OrganizationSettings
from app.models.planning import Volunteer
from app.schemas.family import (
    AdminSetVolunteerPasswordRequest,
    AdminVolunteerPasswordActionResponse,
    FamilyChildResponse,
    FamilyCreate,
    FamilyListResponse,
    FamilyMemberCreate,
    FamilyMemberResponse,
    FamilyMemberVolunteerUpdate,
    FamilyResponse,
    FamilyVolunteerResponse,
    VolunteerAdminUpdate,
    VolunteerCreate,
    VolunteerDirectoryResponse,
    VolunteerFamilyMemberEntry,
    VolunteerFamilyResponse,
)
from app.services.auth import dispatch_password_reset_email
from app.services.family import (
    FamilyMemberLinkError,
    FamilyMemberNotFoundError,
    FamilyNotFoundError,
    FamilyService,
    VolunteerHasNoAccountError,
    VolunteerHasRecordsError,
    VolunteerNotFoundError,
)

router = APIRouter(prefix="/api/admin/{organization_slug}/families", tags=["families"])
manage = require_staff_role(StaffRole.KOORDINATION)


def _service(organization_slug: str, current: CurrentStaffMembership, db: Session) -> FamilyService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return FamilyService(db, current.organization.id)


def _password_minimum_length(db: Session, organization_id: uuid.UUID) -> int:
    settings_record = db.scalar(
        select(OrganizationSettings).where(OrganizationSettings.organization_id == organization_id)
    )
    return settings_record.volunteer_password_min_length if settings_record else 6


@router.get("", response_model=list[FamilyListResponse])
def list_families(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[FamilyListResponse]:
    return [
        FamilyListResponse(
            **FamilyResponse.model_validate(family).model_dump(),
            children_count=children_count,
            helpers_count=helpers_count,
        )
        for family, children_count, helpers_count in _service(
            organization_slug, current, db
        ).list_active()
    ]


@router.post("", response_model=FamilyResponse, status_code=201)
def create_family(
    organization_slug: str,
    payload: FamilyCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> FamilyResponse:
    _ensure_origin_and_host(request, db, get_settings())
    return FamilyResponse.model_validate(_service(organization_slug, current, db).create(payload))


def _volunteer_response(volunteer: Volunteer) -> FamilyVolunteerResponse:
    return FamilyVolunteerResponse(
        id=volunteer.id,
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        phone=volunteer.phone_display,
        email=volunteer.email_display,
        compensation_preference=volunteer.compensation_preference,
        compensation_family_member_id=volunteer.compensation_family_member_id,
        internal_note=volunteer.internal_note,
        status=volunteer.status,
    )


@router.get("/volunteers", response_model=list[FamilyVolunteerResponse])
def list_family_volunteers(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[FamilyVolunteerResponse]:
    return [
        _volunteer_response(item)
        for item in _service(organization_slug, current, db).list_family_volunteers()
    ]


@router.get("/all-volunteers", response_model=list[VolunteerDirectoryResponse])
def list_all_volunteers(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[VolunteerDirectoryResponse]:
    return [
        VolunteerDirectoryResponse(
            **_volunteer_response(volunteer).model_dump(),
            has_account=volunteer.user_id is not None,
            family_display_name=family_display_name,
        )
        for volunteer, family_display_name in _service(
            organization_slug, current, db
        ).list_all_volunteers()
    ]


@router.post("/volunteers", response_model=FamilyVolunteerResponse, status_code=201)
def create_volunteer(
    organization_slug: str,
    payload: VolunteerCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> FamilyVolunteerResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        volunteer = _service(organization_slug, current, db).create_volunteer(
            payload, current.user.id
        )
        return _volunteer_response(volunteer)
    except FamilyMemberLinkError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None


@router.patch("/volunteers/{volunteer_id}", response_model=FamilyVolunteerResponse)
def update_family_volunteer(
    organization_slug: str,
    volunteer_id: uuid.UUID,
    payload: VolunteerAdminUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> FamilyVolunteerResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        volunteer = _service(organization_slug, current, db).update_volunteer(
            volunteer_id, payload, current.user.id
        )
        return _volunteer_response(volunteer)
    except VolunteerNotFoundError:
        raise HTTPException(status_code=404, detail="volunteer not found") from None
    except FamilyMemberLinkError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None


@router.delete("/volunteers/{volunteer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_volunteer(
    organization_slug: str,
    volunteer_id: uuid.UUID,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> None:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        _service(organization_slug, current, db).delete_volunteer(volunteer_id, current.user.id)
    except VolunteerNotFoundError:
        raise HTTPException(status_code=404, detail="volunteer not found") from None
    except VolunteerHasRecordsError:
        raise HTTPException(
            status_code=409,
            detail="volunteer has signups or work records and cannot be deleted",
        ) from None


@router.get("/volunteers/{volunteer_id}/family", response_model=VolunteerFamilyResponse | None)
def get_volunteer_family(
    organization_slug: str,
    volunteer_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> VolunteerFamilyResponse | None:
    try:
        result = _service(organization_slug, current, db).get_volunteer_family(volunteer_id)
    except VolunteerNotFoundError:
        raise HTTPException(status_code=404, detail="volunteer not found") from None
    if result is None:
        return None
    family, members = result
    return VolunteerFamilyResponse(
        family_id=family.id,
        family_display_name=family.display_name,
        family_internal_note=family.internal_note,
        members=[
            VolunteerFamilyMemberEntry(
                id=member.id,
                member_type=member.member_type,
                first_name=member.first_name,
                last_name=member.last_name,
                team_name=member.team_name,
                volunteer_id=member.volunteer_id,
                volunteer_first_name=linked_volunteer.first_name if linked_volunteer else None,
                volunteer_last_name=linked_volunteer.last_name if linked_volunteer else None,
            )
            for member, linked_volunteer in members
        ],
    )


@router.post(
    "/volunteers/{volunteer_id}/send-password-reset",
    response_model=AdminVolunteerPasswordActionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def send_volunteer_password_reset(
    organization_slug: str,
    volunteer_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> AdminVolunteerPasswordActionResponse:
    _ensure_origin_and_host(request, db, get_settings())
    settings = get_settings()
    try:
        issue = _service(organization_slug, current, db).send_volunteer_password_reset(
            volunteer_id, current.user.id, settings
        )
    except VolunteerNotFoundError:
        raise HTTPException(status_code=404, detail="volunteer not found") from None
    except VolunteerHasNoAccountError:
        raise HTTPException(status_code=409, detail="volunteer has no login account") from None
    if issue is not None:
        background_tasks.add_task(
            dispatch_password_reset_email,
            settings,
            recipient=issue.recipient,
            raw_token=issue.raw_token,
        )
    return AdminVolunteerPasswordActionResponse()


@router.post(
    "/volunteers/{volunteer_id}/set-password",
    response_model=AdminVolunteerPasswordActionResponse,
)
def set_volunteer_password(
    organization_slug: str,
    volunteer_id: uuid.UUID,
    payload: AdminSetVolunteerPasswordRequest,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> AdminVolunteerPasswordActionResponse:
    _ensure_origin_and_host(request, db, get_settings())
    service = _service(organization_slug, current, db)
    minimum_length = _password_minimum_length(db, current.organization.id)
    try:
        service.set_volunteer_password(
            volunteer_id,
            payload.new_password,
            current.user.id,
            minimum_length=minimum_length,
        )
    except VolunteerNotFoundError:
        raise HTTPException(status_code=404, detail="volunteer not found") from None
    except VolunteerHasNoAccountError:
        raise HTTPException(status_code=409, detail="volunteer has no login account") from None
    except PasswordPolicyError:
        raise HTTPException(status_code=422, detail="password policy violation") from None
    return AdminVolunteerPasswordActionResponse()


@router.get("/children", response_model=list[FamilyChildResponse])
def list_family_children(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[FamilyChildResponse]:
    return [
        FamilyChildResponse(
            id=member.id,
            family_id=family.id,
            family_display_name=family.display_name,
            first_name=member.first_name,
            last_name=member.last_name,
            team_name=member.team_name,
        )
        for member, family in _service(organization_slug, current, db).list_active_children()
    ]


@router.get("/{family_id}/members", response_model=list[FamilyMemberResponse])
def list_family_members(
    organization_slug: str,
    family_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[FamilyMemberResponse]:
    try:
        return [
            FamilyMemberResponse.model_validate(item)
            for item in _service(organization_slug, current, db).list_members(family_id)
        ]
    except FamilyNotFoundError:
        raise HTTPException(status_code=404, detail="family not found") from None


@router.post("/{family_id}/members", response_model=FamilyMemberResponse, status_code=201)
def create_family_member(
    organization_slug: str,
    family_id: uuid.UUID,
    payload: FamilyMemberCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> FamilyMemberResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        member = _service(organization_slug, current, db).create_member(family_id, payload)
        return FamilyMemberResponse.model_validate(member)
    except FamilyNotFoundError:
        raise HTTPException(status_code=404, detail="family not found") from None


@router.patch("/{family_id}/members/{member_id}/volunteer", response_model=FamilyMemberResponse)
def update_family_member_volunteer(
    organization_slug: str,
    family_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: FamilyMemberVolunteerUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> FamilyMemberResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        member = _service(organization_slug, current, db).update_member_volunteer(
            family_id, member_id, payload, current.user.id
        )
        return FamilyMemberResponse.model_validate(member)
    except (FamilyNotFoundError, FamilyMemberNotFoundError):
        raise HTTPException(status_code=404, detail="family member not found") from None
    except FamilyMemberLinkError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
