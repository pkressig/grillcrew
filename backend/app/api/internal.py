"""Temporary internal endpoints that smoke-test organization permission guards.

These routes are not product APIs. They exist only to exercise the F002 Step 4
authentication, organization context, staff membership, and role dependencies.
"""

from fastapi import APIRouter, Depends

from app.api.dependencies import (
    CurrentOrganization,
    CurrentStaffMembership,
    CurrentUser,
    require_authenticated_user,
    require_organization_context,
    require_staff_membership,
    require_staff_role,
    validate_csrf,
)
from app.models.identity import StaffRole

router = APIRouter(prefix="/api/internal/test-support", tags=["internal-test-support"])

_ADMIN_ROLE_DEPENDENCY = Depends(require_staff_role(StaffRole.ADMIN))
_COORDINATION_ROLE_DEPENDENCY = Depends(require_staff_role(StaffRole.KOORDINATION))
_KIOSK_ROLE_DEPENDENCY = Depends(require_staff_role(StaffRole.KOORDINATION, StaffRole.KIOSK))
_REPORTS_READ_ROLE_DEPENDENCY = Depends(
    require_staff_role(StaffRole.KOORDINATION, StaffRole.VORSTAND_LESEN)
)


@router.get("/authenticated")
def authenticated_smoke(
    current_user: CurrentUser = Depends(require_authenticated_user),  # noqa: B008
) -> dict[str, str]:
    return {"user_id": str(current_user.user.id)}


@router.get("/{organization_slug}/organization")
def organization_context_smoke(
    current_organization: CurrentOrganization = Depends(require_organization_context),  # noqa: B008
) -> dict[str, str]:
    return {"organization_id": str(current_organization.organization.id)}


@router.get("/{organization_slug}/staff")
def staff_membership_smoke(
    current_membership: CurrentStaffMembership = Depends(require_staff_membership),  # noqa: B008
) -> dict[str, str]:
    return {
        "organization_id": str(current_membership.organization.id),
        "user_id": str(current_membership.user.id),
        "role": current_membership.membership.role.value,
    }


@router.get("/{organization_slug}/admin")
def admin_smoke(
    current_membership: CurrentStaffMembership = _ADMIN_ROLE_DEPENDENCY,
) -> dict[str, str]:
    return _role_response(current_membership)


@router.get("/{organization_slug}/coordination")
def coordination_smoke(
    current_membership: CurrentStaffMembership = _COORDINATION_ROLE_DEPENDENCY,
) -> dict[str, str]:
    return _role_response(current_membership)


@router.get("/{organization_slug}/kiosk")
def kiosk_smoke(
    current_membership: CurrentStaffMembership = _KIOSK_ROLE_DEPENDENCY,
) -> dict[str, str]:
    return _role_response(current_membership)


@router.get("/{organization_slug}/reports")
def reports_read_smoke(
    current_membership: CurrentStaffMembership = _REPORTS_READ_ROLE_DEPENDENCY,
) -> dict[str, str]:
    return _role_response(current_membership)


@router.post("/{organization_slug}/reports")
def reports_write_smoke(
    _csrf: None = Depends(validate_csrf),
    current_membership: CurrentStaffMembership = _COORDINATION_ROLE_DEPENDENCY,
) -> dict[str, str]:
    return _role_response(current_membership)


def _role_response(current_membership: CurrentStaffMembership) -> dict[str, str]:
    return {
        "organization_id": str(current_membership.organization.id),
        "role": current_membership.membership.role.value,
    }
