"""Authenticated organization settings administration endpoints."""

# ruff: noqa: B008

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.settings import (
    CrewSizeRuleCreate,
    CrewSizeRuleReorder,
    CrewSizeRuleResponse,
    CrewSizeRuleUpdate,
    HomeVenueCreate,
    HomeVenueResponse,
    HomeVenueUpdate,
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
    ThemeResponse,
    ThemeUpdate,
)
from app.services.settings import (
    SettingsConflictError,
    SettingsNotFoundError,
    SettingsService,
    SettingsValidationError,
)

router = APIRouter(prefix="/api/admin/{organization_slug}/settings", tags=["settings"])
manage = require_staff_role(StaffRole.ADMIN)


def _service(
    organization_slug: str, current: CurrentStaffMembership, db: Session
) -> SettingsService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return SettingsService(db, current.organization.id)


def _translate(error: Exception) -> HTTPException:
    if isinstance(error, SettingsNotFoundError):
        return HTTPException(status_code=404, detail="settings record not found")
    if isinstance(error, SettingsConflictError):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


@router.get("/organization-settings", response_model=OrganizationSettingsResponse)
def get_organization_settings(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> OrganizationSettingsResponse:
    try:
        settings = _service(organization_slug, current, db).get_organization_settings()
        return OrganizationSettingsResponse.model_validate(settings)
    except SettingsNotFoundError as error:
        raise _translate(error) from None


@router.patch("/organization-settings", response_model=OrganizationSettingsResponse)
def update_organization_settings(
    organization_slug: str,
    payload: OrganizationSettingsUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> OrganizationSettingsResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        settings = _service(organization_slug, current, db).update_organization_settings(payload)
        return OrganizationSettingsResponse.model_validate(settings)
    except (SettingsNotFoundError, SettingsConflictError, SettingsValidationError) as error:
        raise _translate(error) from None


@router.get("/theme", response_model=ThemeResponse)
def get_theme(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ThemeResponse:
    try:
        theme = _service(organization_slug, current, db).get_theme()
        return ThemeResponse.model_validate(theme)
    except SettingsNotFoundError as error:
        raise _translate(error) from None


@router.patch("/theme", response_model=ThemeResponse)
def update_theme(
    organization_slug: str,
    payload: ThemeUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ThemeResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        theme = _service(organization_slug, current, db).update_theme(payload)
        return ThemeResponse.model_validate(theme)
    except SettingsNotFoundError as error:
        raise _translate(error) from None


@router.get("/home-venues", response_model=list[HomeVenueResponse])
def list_home_venues(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[HomeVenueResponse]:
    return [
        HomeVenueResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_home_venues()
    ]


@router.post("/home-venues", response_model=HomeVenueResponse, status_code=201)
def create_home_venue(
    organization_slug: str,
    payload: HomeVenueCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> HomeVenueResponse:
    _ensure_origin_and_host(request, db, get_settings())
    venue = _service(organization_slug, current, db).create_home_venue(payload)
    return HomeVenueResponse.model_validate(venue)


@router.patch("/home-venues/{venue_id}", response_model=HomeVenueResponse)
def update_home_venue(
    organization_slug: str,
    venue_id: uuid.UUID,
    payload: HomeVenueUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> HomeVenueResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        venue = _service(organization_slug, current, db).update_home_venue(venue_id, payload)
        return HomeVenueResponse.model_validate(venue)
    except (SettingsNotFoundError, SettingsConflictError) as error:
        raise _translate(error) from None


@router.get("/crew-size-rules", response_model=list[CrewSizeRuleResponse])
def list_crew_size_rules(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[CrewSizeRuleResponse]:
    return [
        CrewSizeRuleResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_crew_size_rules()
    ]


@router.post("/crew-size-rules", response_model=CrewSizeRuleResponse, status_code=201)
def create_crew_size_rule(
    organization_slug: str,
    payload: CrewSizeRuleCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> CrewSizeRuleResponse:
    _ensure_origin_and_host(request, db, get_settings())
    rule = _service(organization_slug, current, db).create_crew_size_rule(payload)
    return CrewSizeRuleResponse.model_validate(rule)


@router.patch("/crew-size-rules/{rule_id}", response_model=CrewSizeRuleResponse)
def update_crew_size_rule(
    organization_slug: str,
    rule_id: uuid.UUID,
    payload: CrewSizeRuleUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> CrewSizeRuleResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        rule = _service(organization_slug, current, db).update_crew_size_rule(rule_id, payload)
        return CrewSizeRuleResponse.model_validate(rule)
    except (SettingsNotFoundError, SettingsValidationError) as error:
        raise _translate(error) from None


@router.post("/crew-size-rules/reorder", response_model=list[CrewSizeRuleResponse])
def reorder_crew_size_rules(
    organization_slug: str,
    payload: CrewSizeRuleReorder,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> list[CrewSizeRuleResponse]:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        rules = _service(organization_slug, current, db).reorder_crew_size_rules(
            payload.ordered_ids
        )
        return [CrewSizeRuleResponse.model_validate(item) for item in rules]
    except SettingsValidationError as error:
        raise _translate(error) from None
