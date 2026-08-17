"""Organization-scoped club year and season administration endpoints."""

# ruff: noqa: B008

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import _ensure_origin_and_host
from app.api.dependencies import CurrentStaffMembership, require_staff_role, validate_csrf
from app.core.config import get_settings
from app.db.session import get_db
from app.models.identity import StaffRole
from app.models.planning import Shift, Signup, SignupStatus
from app.schemas.planning import (
    AdminShiftResponse,
    AdminSignupResponse,
    ClubYearCreate,
    ClubYearResponse,
    ClubYearUpdate,
    EventCreate,
    EventDeleteConfirmation,
    EventResponse,
    EventUpdate,
    EventWithShiftsResponse,
    SeasonCreate,
    SeasonResponse,
    SeasonUpdate,
    ShiftAssignVolunteer,
    ShiftCreate,
    ShiftCrewSuggestion,
    ShiftResponse,
    ShiftUpdate,
    SignupAttendanceUpdate,
)
from app.schemas.work_record import (
    WorkRecordClassify,
    WorkRecordPayoutStatusUpdate,
    WorkRecordResponse,
)
from app.services.email.branding import resolve_organization_branding
from app.services.planning import (
    PlanningConflictError,
    PlanningNotFoundError,
    PlanningService,
    PlanningValidationError,
)
from app.services.signup_confirmation import dispatch_signup_confirmation_email
from app.services.work_record import (
    WorkRecordConflictError,
    WorkRecordNotFoundError,
    WorkRecordService,
    WorkRecordValidationError,
)

router = APIRouter(prefix="/api/admin/{organization_slug}", tags=["planning"])
manage = require_staff_role(StaffRole.KOORDINATION)
admin_only = require_staff_role(StaffRole.ADMIN)


def _admin_shift_response(shift: Shift) -> AdminShiftResponse:
    active_signups = sorted(
        (signup for signup in shift.signups if signup.status == SignupStatus.ACTIVE),
        key=lambda signup: (signup.created_at, signup.id),
    )
    occupied = len(active_signups)
    return AdminShiftResponse(
        **ShiftResponse.model_validate(shift).model_dump(),
        occupied_volunteers=occupied,
        open_places=max(shift.required_volunteers - occupied, 0),
        signups=[_admin_signup_response(signup) for signup in active_signups],
    )


def _admin_signup_response(signup: Signup) -> AdminSignupResponse:
    return AdminSignupResponse(
        id=signup.id,
        public_name=signup.public_name_snapshot,
        first_name=signup.volunteer.first_name,
        last_name=signup.volunteer.last_name,
        phone=signup.volunteer.phone_display,
        email=signup.volunteer.email_display,
        outcome=signup.outcome,
        created_at=signup.created_at,
    )


def _service(
    organization_slug: str, current: CurrentStaffMembership, db: Session
) -> PlanningService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return PlanningService(db, current.organization.id)


def _write_service(
    organization_slug: str, current: CurrentStaffMembership, db: Session, request: Request
) -> PlanningService:
    _ensure_origin_and_host(request, db, get_settings())
    return _service(organization_slug, current, db)


def _translate(error: Exception) -> HTTPException:
    if isinstance(error, PlanningNotFoundError):
        return HTTPException(status_code=404, detail="planning record not found")
    if isinstance(error, PlanningConflictError):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


def _work_record_service(
    organization_slug: str, current: CurrentStaffMembership, db: Session
) -> WorkRecordService:
    if current.organization.slug != organization_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not permitted")
    return WorkRecordService(db, current.organization.id)


def _write_work_record_service(
    organization_slug: str, current: CurrentStaffMembership, db: Session, request: Request
) -> WorkRecordService:
    _ensure_origin_and_host(request, db, get_settings())
    return _work_record_service(organization_slug, current, db)


def _translate_work_record(error: Exception) -> HTTPException:
    if isinstance(error, WorkRecordNotFoundError):
        return HTTPException(status_code=404, detail="work record not found")
    if isinstance(error, WorkRecordConflictError):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


@router.get("/club-years", response_model=list[ClubYearResponse])
def list_club_years(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[ClubYearResponse]:
    return [
        ClubYearResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_club_years()
    ]


@router.post("/club-years", response_model=ClubYearResponse, status_code=201)
def create_club_year(
    organization_slug: str,
    payload: ClubYearCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ClubYearResponse:
    return ClubYearResponse.model_validate(
        _write_service(organization_slug, current, db, request).create_club_year(payload)
    )


@router.get("/club-years/{club_year_id}", response_model=ClubYearResponse)
def get_club_year(
    organization_slug: str,
    club_year_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ClubYearResponse:
    try:
        return ClubYearResponse.model_validate(
            _service(organization_slug, current, db).get_club_year(club_year_id)
        )
    except PlanningNotFoundError as error:
        raise _translate(error) from None


@router.patch("/club-years/{club_year_id}", response_model=ClubYearResponse)
def update_club_year(
    organization_slug: str,
    club_year_id: uuid.UUID,
    payload: ClubYearUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> ClubYearResponse:
    try:
        item = _write_service(organization_slug, current, db, request).update_club_year(
            club_year_id, payload, current.user.id
        )
        return ClubYearResponse.model_validate(item)
    except (PlanningNotFoundError, PlanningConflictError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.get("/seasons/current", response_model=SeasonResponse)
def current_season(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> SeasonResponse:
    try:
        today = datetime.now(ZoneInfo(current.organization.timezone)).date()
        return SeasonResponse.model_validate(
            _service(organization_slug, current, db).current_season(today)
        )
    except PlanningNotFoundError as error:
        raise _translate(error) from None


@router.get("/seasons", response_model=list[SeasonResponse])
def list_seasons(
    organization_slug: str,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[SeasonResponse]:
    return [
        SeasonResponse.model_validate(item)
        for item in _service(organization_slug, current, db).list_seasons()
    ]


@router.post("/club-years/{club_year_id}/seasons", response_model=SeasonResponse, status_code=201)
def create_season(
    organization_slug: str,
    club_year_id: uuid.UUID,
    payload: SeasonCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> SeasonResponse:
    try:
        item = _write_service(organization_slug, current, db, request).create_season(
            club_year_id, payload
        )
        return SeasonResponse.model_validate(item)
    except (PlanningNotFoundError, PlanningConflictError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.patch("/seasons/{season_id}", response_model=SeasonResponse)
def update_season(
    organization_slug: str,
    season_id: uuid.UUID,
    payload: SeasonUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> SeasonResponse:
    try:
        item = _write_service(organization_slug, current, db, request).update_season(
            season_id, payload, current.user.id
        )
        return SeasonResponse.model_validate(item)
    except (PlanningNotFoundError, PlanningConflictError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.delete("/club-years/{club_year_id}", status_code=204)
def delete_club_year(
    organization_slug: str,
    club_year_id: uuid.UUID,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> None:
    try:
        _write_service(organization_slug, current, db, request).delete_club_year(
            club_year_id, current.user.id
        )
    except (PlanningNotFoundError, PlanningConflictError) as error:
        raise _translate(error) from None


@router.delete("/seasons/{season_id}", status_code=204)
def delete_season(
    organization_slug: str,
    season_id: uuid.UUID,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> None:
    try:
        _write_service(organization_slug, current, db, request).delete_season(
            season_id, current.user.id
        )
    except (PlanningNotFoundError, PlanningConflictError) as error:
        raise _translate(error) from None


@router.get("/seasons/{season_id}/events", response_model=list[EventResponse])
def list_events(
    organization_slug: str,
    season_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[EventResponse]:
    try:
        return [
            EventResponse.model_validate(item)
            for item in _service(organization_slug, current, db).list_events(season_id)
        ]
    except PlanningNotFoundError as error:
        raise _translate(error) from None


@router.get("/seasons/{season_id}/events-with-shifts", response_model=list[EventWithShiftsResponse])
def list_events_with_shifts(
    organization_slug: str,
    season_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[EventWithShiftsResponse]:
    try:
        return [
            EventWithShiftsResponse(
                **EventResponse.model_validate(event).model_dump(),
                shifts=[
                    _admin_shift_response(shift)
                    for shift in sorted(
                        event.shifts, key=lambda s: (s.sort_order, s.starts_at, s.id)
                    )
                ],
            )
            for event in _service(organization_slug, current, db).list_events_with_shifts(season_id)
        ]
    except PlanningNotFoundError as error:
        raise _translate(error) from None


@router.post("/seasons/{season_id}/events", response_model=EventResponse, status_code=201)
def create_event(
    organization_slug: str,
    season_id: uuid.UUID,
    payload: EventCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> EventResponse:
    try:
        return EventResponse.model_validate(
            _write_service(organization_slug, current, db, request).create_event(season_id, payload)
        )
    except (PlanningNotFoundError, PlanningConflictError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.patch("/events/{event_id}", response_model=EventResponse)
def update_event(
    organization_slug: str,
    event_id: uuid.UUID,
    payload: EventUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> EventResponse:
    try:
        return EventResponse.model_validate(
            _write_service(organization_slug, current, db, request).update_event(event_id, payload)
        )
    except (PlanningNotFoundError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    organization_slug: str,
    event_id: uuid.UUID,
    payload: EventDeleteConfirmation,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> None:
    try:
        _write_service(organization_slug, current, db, request).delete_event(
            event_id, current.user.id
        )
    except PlanningConflictError as error:
        raise _translate(error) from None


@router.post("/events/{event_id}/force-delete", status_code=204)
def force_delete_historical_event(
    organization_slug: str,
    event_id: uuid.UUID,
    payload: EventDeleteConfirmation,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> None:
    try:
        _write_service(organization_slug, current, db, request).force_delete_historical_event(
            event_id, current.user.id
        )
    except (PlanningNotFoundError, PlanningConflictError) as error:
        raise _translate(error) from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Der Anlass konnte wegen einer nicht sicher löschbaren Abhängigkeit nicht "
                "gelöscht werden. Alle Daten bleiben erhalten."
            ),
        ) from None


@router.get("/events/{event_id}/shift-suggestion", response_model=ShiftCrewSuggestion)
def get_shift_crew_suggestion(
    organization_slug: str,
    event_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> ShiftCrewSuggestion:
    try:
        rule = _service(organization_slug, current, db).suggest_shift_crew(event_id)
    except PlanningNotFoundError as error:
        raise _translate(error) from None
    if rule is None:
        return ShiftCrewSuggestion(menu_type=None, required_volunteers=None, matched_rule_id=None)
    return ShiftCrewSuggestion(
        menu_type=rule.menu_type,
        required_volunteers=rule.required_griller_count,
        matched_rule_id=rule.id,
    )


@router.get("/events/{event_id}/shifts", response_model=list[AdminShiftResponse])
def list_shifts(
    organization_slug: str,
    event_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> list[AdminShiftResponse]:
    try:
        return [
            _admin_shift_response(item)
            for item in _service(organization_slug, current, db).list_shifts(event_id)
        ]
    except PlanningNotFoundError as error:
        raise _translate(error) from None


@router.post("/events/{event_id}/shifts", response_model=AdminShiftResponse, status_code=201)
def create_shift(
    organization_slug: str,
    event_id: uuid.UUID,
    payload: ShiftCreate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> AdminShiftResponse:
    try:
        return _admin_shift_response(
            _write_service(organization_slug, current, db, request).create_shift(event_id, payload)
        )
    except (PlanningNotFoundError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.patch("/shifts/{shift_id}", response_model=AdminShiftResponse)
def update_shift(
    organization_slug: str,
    shift_id: uuid.UUID,
    payload: ShiftUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> AdminShiftResponse:
    try:
        return _admin_shift_response(
            _write_service(organization_slug, current, db, request).update_shift(shift_id, payload)
        )
    except (PlanningNotFoundError, PlanningValidationError) as error:
        raise _translate(error) from None


@router.delete("/shifts/{shift_id}", status_code=204)
def delete_shift(
    organization_slug: str,
    shift_id: uuid.UUID,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> None:
    try:
        _write_service(organization_slug, current, db, request).delete_shift(
            shift_id, current.user.id
        )
    except (PlanningNotFoundError, PlanningConflictError) as error:
        raise _translate(error) from None


@router.post("/shifts/{shift_id}/assign", response_model=AdminShiftResponse)
def assign_volunteer(
    organization_slug: str,
    shift_id: uuid.UUID,
    payload: ShiftAssignVolunteer,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> AdminShiftResponse:
    try:
        result = _write_service(organization_slug, current, db, request).assign_volunteer(
            shift_id, payload.volunteer_id
        )
    except (PlanningNotFoundError, PlanningConflictError) as error:
        raise _translate(error) from None
    signup = result.signup
    organization = current.organization
    background_tasks.add_task(
        dispatch_signup_confirmation_email,
        get_settings(),
        recipient=signup.volunteer.email_display,
        signup_id=signup.id,
        organization_name=organization.name,
        organization_slug=organization.slug,
        event_title=signup.shift.event.title,
        event_type=signup.shift.event.event_type,
        shift_starts_at=signup.shift.starts_at,
        shift_ends_at=signup.shift.ends_at,
        shift_type=signup.shift.shift_type,
        organization_timezone=organization.timezone,
        volunteer_public_name=signup.public_name_snapshot,
        management_token=result.management_token,
        branding=resolve_organization_branding(
            db, organization, frontend_public_url=get_settings().frontend_public_url
        ),
    )
    return _admin_shift_response(result.shift)


@router.post("/signups/{signup_id}/cancel", response_model=AdminShiftResponse)
def cancel_signup(
    organization_slug: str,
    signup_id: uuid.UUID,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> AdminShiftResponse:
    try:
        shift = _write_service(organization_slug, current, db, request).cancel_signup(signup_id)
        return _admin_shift_response(shift)
    except (PlanningNotFoundError, PlanningConflictError) as error:
        raise _translate(error) from None


@router.patch("/signups/{signup_id}/attendance", response_model=AdminSignupResponse)
def update_signup_attendance(
    organization_slug: str,
    signup_id: uuid.UUID,
    payload: SignupAttendanceUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> AdminSignupResponse:
    try:
        signup = _write_service(organization_slug, current, db, request).update_signup_attendance(
            signup_id, payload.outcome, current.user.id
        )
        return _admin_signup_response(signup)
    except (PlanningNotFoundError, PlanningConflictError) as error:
        raise _translate(error) from None


@router.get("/signups/{signup_id}/work-record", response_model=WorkRecordResponse)
def get_work_record(
    organization_slug: str,
    signup_id: uuid.UUID,
    current: CurrentStaffMembership = Depends(manage),
    db: Session = Depends(get_db),
) -> WorkRecordResponse:
    try:
        record = _work_record_service(organization_slug, current, db).get_for_signup(signup_id)
        return WorkRecordResponse.model_validate(record)
    except WorkRecordNotFoundError as error:
        raise _translate_work_record(error) from None


@router.patch("/signups/{signup_id}/work-record", response_model=WorkRecordResponse)
def classify_work_record(
    organization_slug: str,
    signup_id: uuid.UUID,
    payload: WorkRecordClassify,
    request: Request,
    current: CurrentStaffMembership = Depends(manage),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> WorkRecordResponse:
    try:
        record = _write_work_record_service(organization_slug, current, db, request).classify(
            signup_id, payload, current.user.id
        )
        return WorkRecordResponse.model_validate(record)
    except (
        WorkRecordNotFoundError,
        WorkRecordConflictError,
        WorkRecordValidationError,
    ) as error:
        raise _translate_work_record(error) from None


@router.patch("/signups/{signup_id}/work-record/payout-status", response_model=WorkRecordResponse)
def update_work_record_payout_status(
    organization_slug: str,
    signup_id: uuid.UUID,
    payload: WorkRecordPayoutStatusUpdate,
    request: Request,
    current: CurrentStaffMembership = Depends(admin_only),
    _: None = Depends(validate_csrf),
    db: Session = Depends(get_db),
) -> WorkRecordResponse:
    try:
        record = _write_work_record_service(
            organization_slug, current, db, request
        ).update_payout_status(signup_id, payload, current.user.id)
        return WorkRecordResponse.model_validate(record)
    except (WorkRecordNotFoundError, WorkRecordConflictError) as error:
        raise _translate_work_record(error) from None
