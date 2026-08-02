"""Authenticated grill game-plan import administration endpoints."""

# ruff: noqa: B008

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.models.planning import ImportBatch, ImportRow
from app.schemas.imports import (
    ImportBatchResponse,
    ImportBatchWithRowsResponse,
    ImportRowResponse,
    ImportRowUpdate,
)
from app.services.imports import (
    ImportConflictError,
    ImportNotFoundError,
    ImportService,
    ImportValidationError,
)

router = APIRouter(prefix="/api/admin/{organization_slug}/imports", tags=["imports"])
manage = require_staff_role(StaffRole.ADMIN)
# A complete season-plan workbook is expected to be small; 10 MiB leaves ample room for formatting
# while bounding the multipart file data retained in application memory.
MAX_IMPORT_UPLOAD_BYTES = 10 * 1024 * 1024


def _service(organization_slug: str, current: CurrentStaffMembership, db: Session) -> ImportService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return ImportService(db, current.organization.id)


def _translate(error: Exception) -> HTTPException:
    if isinstance(error, ImportNotFoundError):
        return HTTPException(status_code=404, detail="import record not found")
    if isinstance(error, ImportConflictError):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


def _with_rows(batch: ImportBatch, rows: list[ImportRow]) -> ImportBatchWithRowsResponse:
    return ImportBatchWithRowsResponse(
        batch=ImportBatchResponse.model_validate(batch),
        rows=[ImportRowResponse.model_validate(row) for row in rows],
    )


async def _read_upload_content(file: UploadFile) -> bytes:
    content = await file.read(MAX_IMPORT_UPLOAD_BYTES + 1)
    if len(content) > MAX_IMPORT_UPLOAD_BYTES:
        raise ImportValidationError("Die Excel-Datei darf maximal 10 MiB gross sein.")
    return content


@router.post("", response_model=ImportBatchWithRowsResponse, status_code=201)
async def upload_import(
    organization_slug: str,
    request: Request,
    club_year_id: uuid.UUID = Form(...),
    import_start_date: date | None = Form(default=None),
    import_end_date: date | None = Form(default=None),
    future_only: bool = Form(default=False),
    home_only: bool = Form(default=False),
    file: UploadFile = File(...),
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ImportBatchWithRowsResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        content = await _read_upload_content(file)
    except ImportValidationError as error:
        raise _translate(error) from None
    service = _service(organization_slug, current, db)
    try:
        effective_start = import_start_date
        if future_only:
            effective_start = max(effective_start or date.min, datetime.now().date())
        if (
            import_end_date is not None
            and effective_start is not None
            and import_end_date < effective_start
        ):
            raise ImportValidationError("Das Enddatum muss am oder nach dem Startdatum liegen.")
        batch = service.create_batch(
            club_year_id,
            file.filename or "spielplan.xlsx",
            content,
            current.user.id,
            start_date=effective_start,
            end_date=import_end_date,
            home_only=home_only,
        )
    except (ImportNotFoundError, ImportValidationError) as error:
        raise _translate(error) from None
    batch, rows = service.list_rows(batch.id)
    return _with_rows(batch, rows)


@router.get("/{batch_id}/rows", response_model=ImportBatchWithRowsResponse)
def get_import_rows(
    organization_slug: str,
    batch_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ImportBatchWithRowsResponse:
    try:
        batch, rows = _service(organization_slug, current, db).list_rows(batch_id)
    except ImportNotFoundError as error:
        raise _translate(error) from None
    return _with_rows(batch, rows)


@router.patch("/{batch_id}/rows/{row_id}", response_model=ImportRowResponse)
def update_import_row(
    organization_slug: str,
    batch_id: uuid.UUID,
    row_id: uuid.UUID,
    payload: ImportRowUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ImportRowResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        row = _service(organization_slug, current, db).update_row_decision(
            batch_id, row_id, payload
        )
        return ImportRowResponse.model_validate(row)
    except (ImportNotFoundError, ImportConflictError, ImportValidationError) as error:
        raise _translate(error) from None


@router.post("/{batch_id}/confirm", response_model=ImportBatchWithRowsResponse)
def confirm_import(
    organization_slug: str,
    batch_id: uuid.UUID,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ImportBatchWithRowsResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        batch, rows = _service(organization_slug, current, db).confirm(batch_id, current.user.id)
    except (ImportNotFoundError, ImportConflictError) as error:
        raise _translate(error) from None
    return _with_rows(batch, rows)
