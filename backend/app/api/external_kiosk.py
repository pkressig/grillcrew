"""Private external Kiosk/Grill workbook review endpoints."""

# ruff: noqa: B008

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.external_kiosk import (
    ExternalKioskBatchResponse,
    ExternalKioskComparisonResponse,
    ExternalKioskImportResponse,
    ExternalKioskReviewUpdate,
    ExternalKioskRowResponse,
)
from app.services.external_kiosk import (
    ExternalKioskConflictError,
    ExternalKioskNotFoundError,
    ExternalKioskService,
    ExternalKioskValidationError,
)

router = APIRouter(
    prefix="/api/admin/{organization_slug}/external-kiosk-plans", tags=["external-kiosk"]
)
manage = require_staff_role(StaffRole.KOORDINATION)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _service(slug: str, current: CurrentStaffMembership, db: Session) -> ExternalKioskService:
    if current.organization.slug != slug:
        raise HTTPException(status_code=403, detail="not permitted")
    return ExternalKioskService(db, current.organization.id)


def _error(error: Exception) -> HTTPException:
    if isinstance(error, ExternalKioskNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, ExternalKioskConflictError):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


def _response(service: ExternalKioskService, batch_id: uuid.UUID) -> ExternalKioskImportResponse:
    batch, rows = service.get(batch_id)
    return ExternalKioskImportResponse(
        batch=ExternalKioskBatchResponse.model_validate(batch),
        rows=[ExternalKioskRowResponse.model_validate(row) for row in rows],
    )


@router.post("", response_model=ExternalKioskImportResponse, status_code=201)
async def upload_external_kiosk_plan(
    organization_slug: str,
    request: Request,
    file: UploadFile = File(...),
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ExternalKioskImportResponse:
    _ensure_origin_and_host(request, db, get_settings())
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413, detail="Die Excel-Datei darf maximal 10 MiB gross sein."
        )
    service = _service(organization_slug, current, db)
    try:
        batch = service.stage(file.filename or "kiosk-plan.xlsx", content, current.user.id)
        return _response(service, batch.id)
    except (
        ExternalKioskNotFoundError,
        ExternalKioskConflictError,
        ExternalKioskValidationError,
    ) as error:
        raise _error(error) from None


@router.get("/{batch_id}", response_model=ExternalKioskImportResponse)
def get_external_kiosk_plan(
    organization_slug: str,
    batch_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ExternalKioskImportResponse:
    try:
        return _response(_service(organization_slug, current, db), batch_id)
    except ExternalKioskNotFoundError as error:
        raise _error(error) from None


@router.get("/latest/comparison", response_model=ExternalKioskComparisonResponse | None)
def latest_external_kiosk_comparison(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ExternalKioskComparisonResponse | None:
    service = _service(organization_slug, current, db)
    batch = service.latest()
    if batch is None:
        return None
    return ExternalKioskComparisonResponse(
        batch=ExternalKioskBatchResponse.model_validate(batch), items=service.compare(batch.id)
    )


@router.get("/{batch_id}/comparison", response_model=ExternalKioskComparisonResponse)
def compare_external_kiosk_plan(
    organization_slug: str,
    batch_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ExternalKioskComparisonResponse:
    service = _service(organization_slug, current, db)
    try:
        batch, _ = service.get(batch_id)
        return ExternalKioskComparisonResponse(
            batch=ExternalKioskBatchResponse.model_validate(batch), items=service.compare(batch_id)
        )
    except ExternalKioskNotFoundError as error:
        raise _error(error) from None


@router.patch("/{batch_id}/comparison/{row_id}/review", response_model=ExternalKioskRowResponse)
def review_external_kiosk_row(
    organization_slug: str,
    batch_id: uuid.UUID,
    row_id: uuid.UUID,
    payload: ExternalKioskReviewUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ExternalKioskRowResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        row = _service(organization_slug, current, db).review(
            batch_id, row_id, payload.review_state, payload.note, current.user.id
        )
        return ExternalKioskRowResponse.model_validate(row)
    except ExternalKioskNotFoundError as error:
        raise _error(error) from None


@router.delete("/{batch_id}", status_code=204)
def delete_external_kiosk_plan(
    organization_slug: str,
    batch_id: uuid.UUID,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> Response:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        _service(organization_slug, current, db).cleanup(batch_id, current.user.id)
    except ExternalKioskNotFoundError as error:
        raise _error(error) from None
    return Response(status_code=204)
