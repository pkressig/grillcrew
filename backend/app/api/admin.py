"""Organization-admin API endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.schemas.invitation import CreateInvitationRequest, CreateInvitationResponse
from app.services.invitation import (
    DuplicateInvitationError,
    InvitationService,
    dispatch_invitation_email,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post(
    "/{organization_slug}/invitations",
    response_model=CreateInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    organization_slug: str,
    payload: CreateInvitationRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentStaffMembership = Depends(require_staff_role(StaffRole.ADMIN)),  # noqa: B008
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),  # noqa: B008
) -> CreateInvitationResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    try:
        issue = InvitationService(db, settings).create(
            email=payload.email,
            role=payload.role,
            organization=current.organization,
            created_by=current.user,
        )
    except DuplicateInvitationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="pending invitation already exists",
        ) from None
    background_tasks.add_task(
        dispatch_invitation_email,
        settings,
        recipient=issue.recipient,
        organization_name=issue.organization_name,
        raw_token=issue.raw_token,
    )
    return CreateInvitationResponse()
