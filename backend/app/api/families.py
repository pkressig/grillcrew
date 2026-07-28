"""Authenticated organization family administration endpoints."""

# ruff: noqa: B008

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.family import FamilyCreate, FamilyResponse
from app.services.family import FamilyService

router = APIRouter(prefix="/api/admin/{organization_slug}/families", tags=["families"])
manage = require_staff_role(StaffRole.KOORDINATION)


def _service(organization_slug: str, current: CurrentStaffMembership, db: Session) -> FamilyService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return FamilyService(db, current.organization.id)


@router.get("", response_model=list[FamilyResponse])
def list_families(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[FamilyResponse]:
    return [
        FamilyResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_active()
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
