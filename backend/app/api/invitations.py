"""Public token-gated invitation preview endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.invitation import InvitationPreviewResponse
from app.services.invitation import InvalidInvitationTokenError, InvitationService

router = APIRouter(prefix="/api/invitations", tags=["invitations"])


@router.get("/{token}", response_model=InvitationPreviewResponse)
def preview_invitation(
    token: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> InvitationPreviewResponse:
    try:
        preview = InvitationService(db, get_settings()).preview(raw_token=token)
    except InvalidInvitationTokenError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="invitation not found",
        ) from None
    return InvitationPreviewResponse(
        organization_name=preview.organization_name,
        role=preview.role,
        password_required=preview.password_required,
    )
