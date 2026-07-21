"""Public platform endpoints that do not require authentication."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.organization import Organization
from app.models.planning import ShiftStatus
from app.schemas.organization import (
    OrganizationContact,
    PublicOrganizationResponse,
    PublicOrganizationSettings,
    PublicTheme,
)
from app.schemas.planning import PublicEventResponse, PublicPlanResponse, PublicShiftResponse
from app.services.organization_context import (
    OrganizationLookup,
    build_organization_lookup,
    resolve_organization,
)
from app.services.planning import PlanningService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/organization", response_model=PublicOrganizationResponse)
@router.get("/organization/{organization_slug}", response_model=PublicOrganizationResponse)
def public_organization(
    request: Request,
    organization_slug: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
) -> PublicOrganizationResponse:
    """Return public-safe organization context and branding."""
    lookup = getattr(request.state, "organization_lookup", None)
    if not isinstance(lookup, OrganizationLookup):
        lookup = build_organization_lookup(request)
    if organization_slug:
        lookup = OrganizationLookup(
            custom_domain=lookup.custom_domain,
            subdomain=lookup.subdomain,
            path_slug=organization_slug,
            development_override=lookup.development_override,
        )

    organization = resolve_organization(db, lookup, get_settings().app_env)
    if organization is None:
        logger.info("No organization resolved for public request")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="organization not found",
        )

    return to_public_response(organization)


@router.get("/{organization_slug}/plan", response_model=PublicPlanResponse)
def public_plan(
    request: Request,
    organization_slug: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> PublicPlanResponse:
    """Return the tenant's upcoming published plan without private planning data."""
    lookup = getattr(request.state, "organization_lookup", None)
    if not isinstance(lookup, OrganizationLookup):
        lookup = build_organization_lookup(request)
    lookup = OrganizationLookup(
        custom_domain=lookup.custom_domain,
        subdomain=lookup.subdomain,
        path_slug=organization_slug,
        development_override=lookup.development_override,
    )
    organization = resolve_organization(db, lookup, get_settings().app_env)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")

    today = datetime.now(ZoneInfo(organization.timezone)).date()
    events = PlanningService(db, organization.id).list_public_events(today)
    return PublicPlanResponse(
        events=[
            PublicEventResponse(
                id=event.id,
                title=event.title,
                date=event.date,
                location=event.location,
                event_type=event.event_type,
                public_description=event.public_description,
                shifts=[
                    PublicShiftResponse(
                        id=shift.id,
                        starts_at=shift.starts_at,
                        ends_at=shift.ends_at,
                        required_volunteers=shift.required_volunteers,
                        occupied_volunteers=0,
                        public_note=shift.public_note,
                        status=shift.status,
                    )
                    for shift in sorted(
                        (item for item in event.shifts if item.status != ShiftStatus.CANCELLED),
                        key=lambda item: (item.sort_order, item.starts_at, item.id),
                    )
                ],
            )
            for event in events
        ]
    )


def to_public_response(organization: Organization) -> PublicOrganizationResponse:
    theme = organization.theme
    settings = organization.settings
    return PublicOrganizationResponse(
        name=organization.name,
        short_name=organization.short_name,
        slug=organization.slug,
        theme=PublicTheme(
            name=theme.name,
            logo_url=theme.logo_url,
            primary_color=theme.primary_color,
            secondary_color=theme.secondary_color,
        ),
        language=organization.language,
        locale=organization.locale,
        timezone=organization.timezone,
        currency=organization.currency,
        contact=OrganizationContact(
            email=organization.contact_email,
            phone=organization.contact_phone,
            url=organization.contact_url,
        ),
        settings=PublicOrganizationSettings(
            payout_rate_minor_per_hour=settings.payout_rate_minor_per_hour,
            signup_rate_limit_per_contact=settings.signup_rate_limit_per_contact,
            signup_rate_limit_window_minutes=settings.signup_rate_limit_window_minutes,
            coordination_contact_label=settings.coordination_contact_label,
        ),
    )
