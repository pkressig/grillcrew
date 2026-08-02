"""ADMIN-only read-only OneDrive synchronization endpoints."""

# ruff: noqa: B008

import hmac
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.models.onedrive_sync import OneDriveSyncConfig, OneDriveSyncRun
from app.models.organization import Organization
from app.models.planning import ClubYear
from app.schemas.onedrive_sync import (
    OneDriveConfigResponse,
    OneDriveConfigUpdate,
    OneDriveRunResponse,
)
from app.services.onedrive_sync import (
    OneDriveSyncError,
    OneDriveSyncService,
    next_run_at,
    normalize_source_url,
)

router = APIRouter(prefix="/api/admin/{organization_slug}/onedrive-sync", tags=["onedrive-sync"])
cron_router = APIRouter(prefix="/api/cron/onedrive-sync", tags=["onedrive-sync"])
admin = require_staff_role(StaffRole.ADMIN)


def service(slug: str, current: CurrentStaffMembership, db: Session) -> OneDriveSyncService:
    if current.organization.slug != slug:
        raise HTTPException(403, "not permitted")
    return OneDriveSyncService(db, current.organization.id, current.organization.timezone)


def response(config: OneDriveSyncConfig, db: Session, timezone: str) -> OneDriveConfigResponse:
    last = db.scalar(
        select(OneDriveSyncRun)
        .where(OneDriveSyncRun.config_id == config.id)
        .order_by(OneDriveSyncRun.started_at.desc())
    )
    data = OneDriveConfigResponse.model_validate(config)
    return data.model_copy(
        update={
            "last_run": OneDriveRunResponse.model_validate(last) if last else None,
            "next_run_at": next_run_at(config, timezone, datetime.now(UTC)),
        }
    )


@router.get("", response_model=OneDriveConfigResponse | None)
def get_config(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(admin),
    db: Session = Depends(get_db),
) -> OneDriveConfigResponse | None:
    item = service(organization_slug, current, db).get_config()
    return response(item, db, current.organization.timezone) if item else None


@router.put("", response_model=OneDriveConfigResponse)
def put_config(
    organization_slug: str,
    payload: OneDriveConfigUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(admin),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> OneDriveConfigResponse:
    _ensure_origin_and_host(request, db, get_settings())
    svc = service(organization_slug, current, db)
    club_year = db.scalar(
        select(ClubYear).where(
            ClubYear.id == payload.club_year_id, ClubYear.organization_id == current.organization.id
        )
    )
    if club_year is None:
        raise HTTPException(404, "club year not found")
    try:
        url = normalize_source_url(payload.source_url)
    except OneDriveSyncError as error:
        raise HTTPException(422, str(error)) from None
    item = svc.get_config()
    values = payload.model_dump(exclude={"source_url"})
    values["source_url"] = url
    if item is None:
        item = OneDriveSyncConfig(
            organization_id=current.organization.id,
            scheduler_user_id=current.user.id,
            **values,
        )
        db.add(item)
    else:
        item.scheduler_user_id = current.user.id
        for key, value in values.items():
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return response(item, db, current.organization.timezone)


@cron_router.post("/run-due")
def run_all_due(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    token = get_settings().onedrive_cron_token
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if token is None or not hmac.compare_digest(supplied, token):
        raise HTTPException(401, "not authenticated")
    now = datetime.now(UTC)
    started = 0
    failed = 0
    configs = list(
        db.scalars(select(OneDriveSyncConfig).where(OneDriveSyncConfig.enabled.is_(True)))
    )
    for config in configs:
        organization = db.get(Organization, config.organization_id)
        if organization is None:
            continue
        svc = OneDriveSyncService(db, organization.id, organization.timezone)
        try:
            if svc.run_due(config.scheduler_user_id, now) is not None:
                started += 1
        except OneDriveSyncError:
            failed += 1
    return {"started": started, "failed": failed}


@router.post("/sync", response_model=OneDriveRunResponse)
def sync_now(
    organization_slug: str,
    request: Request,
    current: CurrentStaffMembership = Depends(admin),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> OneDriveRunResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        return OneDriveRunResponse.model_validate(
            service(organization_slug, current, db).sync(current.user.id)
        )
    except OneDriveSyncError as error:
        raise HTTPException(422, str(error)) from None


@router.post("/run-due", response_model=OneDriveRunResponse | None)
def run_due(
    organization_slug: str,
    request: Request,
    current: CurrentStaffMembership = Depends(admin),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> OneDriveRunResponse | None:
    _ensure_origin_and_host(request, db, get_settings())
    svc = service(organization_slug, current, db)
    now = datetime.now(UTC)
    if not svc.is_due(now):
        return None
    try:
        result = svc.run_due(current.user.id, now)
        return OneDriveRunResponse.model_validate(result) if result is not None else None
    except OneDriveSyncError as error:
        raise HTTPException(422, str(error)) from None
