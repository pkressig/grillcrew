"""Authenticated organization family administration endpoints."""

# ruff: noqa: B008

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.family import (
    FamilyChildResponse,
    FamilyCreate,
    FamilyListResponse,
    FamilyMemberCreate,
    FamilyMemberResponse,
    FamilyMemberVolunteerUpdate,
    FamilyResponse,
    FamilyVolunteerResponse,
)
from app.services.family import (
    FamilyMemberLinkError,
    FamilyMemberNotFoundError,
    FamilyNotFoundError,
    FamilyService,
)

router = APIRouter(prefix="/api/admin/{organization_slug}/families", tags=["families"])
manage = require_staff_role(StaffRole.KOORDINATION)


def _service(organization_slug: str, current: CurrentStaffMembership, db: Session) -> FamilyService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return FamilyService(db, current.organization.id)


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


@router.get("/volunteers", response_model=list[FamilyVolunteerResponse])
def list_family_volunteers(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[FamilyVolunteerResponse]:
    return [
        FamilyVolunteerResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_active_volunteers()
    ]


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
