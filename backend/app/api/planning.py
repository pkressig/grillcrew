"""Organization-scoped club year and season administration endpoints."""

# ruff: noqa: B008

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.planning import (
    ClubYearCreate,
    ClubYearResponse,
    ClubYearUpdate,
    SeasonCreate,
    SeasonResponse,
    SeasonUpdate,
)
from app.services.planning import (
    PlanningConflictError,
    PlanningNotFoundError,
    PlanningService,
    PlanningValidationError,
)

router = APIRouter(prefix="/api/admin/{organization_slug}", tags=["planning"])
manage = require_staff_role(StaffRole.KOORDINATION)


def _service(
    organization_slug: str, current: CurrentStaffMembership, db: Session
) -> PlanningService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return PlanningService(db, current.organization.id)


def _write_service(
    organization_slug: str, current: CurrentStaffMembership, db: Session, request: Request
) -> PlanningService:
    _ensure_origin_and_host(request, db, get_settings())
    return _service(organization_slug, current, db)


def _translate(error: Exception) -> HTTPException:
    if isinstance(error, PlanningNotFoundError):
        return HTTPException(status_code=404, detail="planning record not found")
    if isinstance(error, PlanningConflictError):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


@router.get("/club-years", response_model=list[ClubYearResponse])
def list_club_years(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[ClubYearResponse]:
    return [
        ClubYearResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_club_years()
    ]


@router.post("/club-years", response_model=ClubYearResponse, status_code=201)
def create_club_year(
    organization_slug: str,
    payload: ClubYearCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ClubYearResponse:
    return ClubYearResponse.model_validate(
        _write_service(organization_slug, current, db, request).create_club_year(payload)
    )


@router.get("/club-years/{club_year_id}", response_model=ClubYearResponse)
def get_club_year(
    organization_slug: str,
    club_year_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ClubYearResponse:
    try:
        return ClubYearResponse.model_validate(
            _service(organization_slug, current, db).get_club_year(club_year_id)
        )
    except PlanningNotFoundError as error:
        raise _translate(error) from None


@router.patch("/club-years/{club_year_id}", response_model=ClubYearResponse)
def update_club_year(
    organization_slug: str,
    club_year_id: uuid.UUID,
    payload: ClubYearUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ClubYearResponse:
    try:
        item = _write_service(organization_slug, current, db, request).update_club_year(
            club_year_id, payload
        )
        return ClubYearResponse.model_validate(item)
    except (PlanningNotFoundError, PlanningConflictError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.get("/seasons/current", response_model=SeasonResponse)
def current_season(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> SeasonResponse:
    try:
        today = datetime.now(ZoneInfo(current.organization.timezone)).date()
        return SeasonResponse.model_validate(
            _service(organization_slug, current, db).current_season(today)
        )
    except PlanningNotFoundError as error:
        raise _translate(error) from None


@router.get("/seasons", response_model=list[SeasonResponse])
def list_seasons(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[SeasonResponse]:
    return [
        SeasonResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_seasons()
    ]


@router.post("/club-years/{club_year_id}/seasons", response_model=SeasonResponse, status_code=201)
def create_season(
    organization_slug: str,
    club_year_id: uuid.UUID,
    payload: SeasonCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> SeasonResponse:
    try:
        item = _write_service(organization_slug, current, db, request).create_season(
            club_year_id, payload
        )
        return SeasonResponse.model_validate(item)
    except (PlanningNotFoundError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.patch("/seasons/{season_id}", response_model=SeasonResponse)
def update_season(
    organization_slug: str,
    season_id: uuid.UUID,
    payload: SeasonUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> SeasonResponse:
    try:
        item = _write_service(organization_slug, current, db, request).update_season(
            season_id, payload
        )
        return SeasonResponse.model_validate(item)
    except (PlanningNotFoundError, PlanningConflictError, PlanningValidationError) as error:
        raise _translate(error) from None
