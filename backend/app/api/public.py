"""Public platform endpoints that do not require authentication."""

import logging
import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security.rate_limit import InMemoryRateLimiter, RateLimitRule
from app.db.session import get_db
from app.models.organization import Organization
from app.models.planning import ShiftStatus, Signup, SignupStatus
from app.schemas.organization import (
    OrganizationContact,
    PublicOrganizationResponse,
    PublicOrganizationSettings,
    PublicTheme,
)
from app.schemas.planning import (
    ManagedSignupResponse,
    PublicEventResponse,
    PublicPlanResponse,
    PublicShiftResponse,
    PublicSignupCreate,
    PublicSignupResponse,
    PublicSignupSummary,
)
from app.services.organization_context import (
    OrganizationLookup,
    build_organization_lookup,
    resolve_organization,
)
from app.services.planning import PlanningService
from app.services.public_signup import (
    PublicSignupConflictError,
    PublicSignupNotFoundError,
    PublicSignupService,
    PublicSignupValidationError,
    can_self_cancel,
    cancellation_deadline,
    normalize_email,
    normalize_phone,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/public", tags=["public"])
signup_rate_limiter = InMemoryRateLimiter()
MINIMUM_FILL_SECONDS = 2


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
                        occupied_volunteers=sum(
                            signup.status == SignupStatus.ACTIVE
                            for signup in getattr(shift, "signups", [])
                        ),
                        public_note=shift.public_note,
                        status=shift.status,
                        volunteer_names=[
                            signup.public_name_snapshot
                            for signup in getattr(shift, "signups", [])
                            if signup.status == SignupStatus.ACTIVE
                        ],
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


@router.post(
    "/{organization_slug}/shifts/{shift_id}/signups",
    response_model=PublicSignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def public_signup(
    request: Request,
    organization_slug: str,
    shift_id: uuid.UUID,
    payload: PublicSignupCreate,
    db: Session = Depends(get_db),  # noqa: B008
) -> PublicSignupResponse:
    organization = _resolve_path_organization(request, organization_slug, db)
    if payload.website.strip():
        return PublicSignupResponse(message="Danke. Deine Anfrage wurde entgegengenommen.")
    now = datetime.now(UTC)
    started_at = payload.form_started_at
    if started_at.tzinfo is None or (now - started_at).total_seconds() < MINIMUM_FILL_SECONDS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="try again")
    if not payload.public_display_consent:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="consent required"
        )
    settings = organization.settings
    window_seconds = settings.signup_rate_limit_window_minutes * 60
    contact = f"{normalize_email(payload.email)}:{normalize_phone(payload.phone)}"
    client_ip = request.client.host if request.client else "unknown"
    contact_allowed = signup_rate_limiter.allow(
        key=f"signup:contact:{organization.id}:{contact}",
        rule=RateLimitRule(
            max_attempts=settings.signup_rate_limit_per_contact,
            window_seconds=window_seconds,
        ),
    )
    ip_allowed = signup_rate_limiter.allow(
        key=f"signup:ip:{organization.id}:{client_ip}",
        rule=RateLimitRule(max_attempts=20, window_seconds=window_seconds),
    )
    if not contact_allowed or not ip_allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="try again")
    try:
        created = PublicSignupService(db, organization.id).create(shift_id, payload)
    except PublicSignupNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="shift not found"
        ) from exc
    except PublicSignupConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="shift unavailable"
        ) from exc
    except PublicSignupValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid signup"
        ) from exc
    return PublicSignupResponse(
        message="Du bist eingetragen.",
        signup=PublicSignupSummary(
            public_name=created.signup.public_name_snapshot,
            occupied_volunteers=created.occupied,
            required_volunteers=created.required,
        ),
        management_url=(f"/{organization.slug}/manage-signup/{created.management_token}"),
    )


@router.get("/{organization_slug}/signups/manage/{token}", response_model=ManagedSignupResponse)
def manage_public_signup(
    request: Request,
    organization_slug: str,
    token: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> ManagedSignupResponse:
    organization = _resolve_path_organization(request, organization_slug, db)
    try:
        signup = PublicSignupService(db, organization.id).get_managed(token)
    except PublicSignupNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invalid link") from exc
    return _managed_signup_response(organization, signup)


@router.post(
    "/{organization_slug}/signups/manage/{token}/cancel",
    response_model=ManagedSignupResponse,
)
def cancel_public_signup(
    request: Request,
    organization_slug: str,
    token: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> ManagedSignupResponse:
    organization = _resolve_path_organization(request, organization_slug, db)
    service = PublicSignupService(db, organization.id)
    try:
        signup = service.cancel(token, organization.timezone)
    except PublicSignupNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invalid link") from exc
    except PublicSignupConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="signup cannot be cancelled directly",
        ) from exc
    return _managed_signup_response(organization, signup)


def _managed_signup_response(organization: Organization, signup: Signup) -> ManagedSignupResponse:
    # The token authorizes this broader projection; it must never be reused by the public plan.
    shift = signup.shift
    event = shift.event
    volunteer = signup.volunteer
    allowed = signup.status == SignupStatus.ACTIVE and can_self_cancel(
        shift.starts_at, organization.timezone, datetime.now(UTC)
    )
    guidance = None
    if signup.status == SignupStatus.ACTIVE and not allowed:
        label = organization.settings.coordination_contact_label
        guidance = (
            f"Bitte kontaktiere {label}, um deine Eintragung abzusagen."
            if label
            else "Bitte kontaktiere die Koordination, um deine Eintragung abzusagen."
        )
    return ManagedSignupResponse(
        organization_name=organization.name,
        organization_slug=organization.slug,
        event_title=event.title,
        event_type=event.event_type,
        event_date=event.date,
        event_location=event.location,
        event_public_description=event.public_description,
        shift_starts_at=shift.starts_at,
        shift_ends_at=shift.ends_at,
        shift_status=shift.status,
        public_name=signup.public_name_snapshot,
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        phone=volunteer.phone_display,
        email=volunteer.email_display,
        signup_status=signup.status,
        cancellation_deadline=cancellation_deadline(shift.starts_at, organization.timezone),
        can_cancel=allowed,
        cancellation_guidance=guidance,
        cancelled_at=signup.cancelled_at,
    )


def _resolve_path_organization(request: Request, slug: str, db: Session) -> Organization:
    lookup = getattr(request.state, "organization_lookup", None)
    if not isinstance(lookup, OrganizationLookup):
        lookup = build_organization_lookup(request)
    lookup = OrganizationLookup(
        custom_domain=lookup.custom_domain,
        subdomain=lookup.subdomain,
        path_slug=slug,
        development_override=lookup.development_override,
    )
    organization = resolve_organization(db, lookup, get_settings().app_env)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return organization


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
