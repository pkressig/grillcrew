"""Private tenant-scoped kiosk/grill proposal endpoints."""

# ruff: noqa: B008

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.proposals import ProposalOverrideUpdate, ProposalResponse, ProposalWindowResponse
from app.services.proposals import ProposalNotFoundError, ProposalService, ProposalValidationError

router = APIRouter(prefix="/api/admin/{organization_slug}/proposals", tags=["proposals"])
manage = require_staff_role(StaffRole.KOORDINATION)


def _service(slug: str, current: CurrentStaffMembership, db: Session) -> ProposalService:
    if current.organization.slug != slug:
        raise HTTPException(status_code=403, detail="not permitted")
    return ProposalService(db, current.organization.id)


@router.get("", response_model=ProposalResponse)
def list_proposals(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ProposalResponse:
    return ProposalResponse(windows=_service(organization_slug, current, db).list_windows())


@router.post("/refresh", response_model=ProposalResponse)
def refresh_proposals(
    organization_slug: str,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ProposalResponse:
    _ensure_origin_and_host(request, db, get_settings())
    return ProposalResponse(windows=_service(organization_slug, current, db).list_windows())


@router.patch("/{window_id}", response_model=ProposalWindowResponse)
def update_proposal(
    organization_slug: str,
    window_id: str,
    payload: ProposalOverrideUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ProposalWindowResponse:
    _ensure_origin_and_host(request, db, get_settings())
    try:
        return _service(organization_slug, current, db).update(window_id, payload, current.user.id)
    except ProposalNotFoundError:
        raise HTTPException(status_code=404, detail="proposal not found") from None
    except ProposalValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
