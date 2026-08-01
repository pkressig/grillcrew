"""ADMIN-only coordination-time endpoints."""

# ruff: noqa: B008
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.coordination_time import (
    CoordinationTimeResponse,
    CoordinationTimeStatusUpdate,
    CoordinationTimeWrite,
)
from app.services.coordination_time import (
    CoordinationTimeConflictError,
    CoordinationTimeNotFoundError,
    CoordinationTimeService,
)

router = APIRouter(
    prefix="/api/admin/{organization_slug}/coordination-time-records", tags=["coordination-time"]
)
admin_only = require_staff_role(StaffRole.ADMIN)


def _service(slug: str, current: CurrentStaffMembership, db: Session) -> CoordinationTimeService:
    if current.organization.slug != slug:
        raise HTTPException(status_code=403, detail="not permitted")
    return CoordinationTimeService(db, current.organization.id)


def _translate(error: Exception) -> HTTPException:
    if isinstance(error, CoordinationTimeNotFoundError):
        return HTTPException(status_code=404, detail="coordination time record not found")
    return HTTPException(status_code=409, detail=str(error))


@router.get("", response_model=list[CoordinationTimeResponse])
def list_records(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(admin_only),
    db: Session = Depends(get_db),
) -> list[CoordinationTimeResponse]:
    return [
        CoordinationTimeResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list()
    ]


@router.post("", response_model=CoordinationTimeResponse, status_code=status.HTTP_201_CREATED)
def create_record(
    organization_slug: str,
    payload: CoordinationTimeWrite,
    request: Request,
    current: CurrentStaffMembership = Depends(admin_only),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> CoordinationTimeResponse:
    _ensure_origin_and_host(request, db, get_settings())
    return CoordinationTimeResponse.model_validate(
        _service(organization_slug, current, db).create(payload, current.user.id)
    )


@router.patch("/{record_id}", response_model=CoordinationTimeResponse)
def update_record(
    organization_slug: str,
    record_id: uuid.UUID,
    payload: CoordinationTimeWrite,
    request: Request,
    current: CurrentStaffMembership = Depends(admin_only),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> CoordinationTimeResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        return CoordinationTimeResponse.model_validate(
            _service(organization_slug, current, db).update(record_id, payload, current.user.id)
        )
    except (CoordinationTimeNotFoundError, CoordinationTimeConflictError) as error:
        raise _translate(error) from None


@router.patch("/{record_id}/payout-status", response_model=CoordinationTimeResponse)
def update_status(
    organization_slug: str,
    record_id: uuid.UUID,
    payload: CoordinationTimeStatusUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(admin_only),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> CoordinationTimeResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        return CoordinationTimeResponse.model_validate(
            _service(organization_slug, current, db).update_status(
                record_id, payload, current.user.id
            )
        )
    except (CoordinationTimeNotFoundError, CoordinationTimeConflictError) as error:
        raise _translate(error) from None
