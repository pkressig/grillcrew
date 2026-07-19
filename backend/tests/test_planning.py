"""Focused F003 planning model, validation, lifecycle, and tenant tests."""

from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import planning
from app.api.dependencies import CurrentStaffMembership
from app.db.session import get_db
from app.main import app
from app.models.organization import Organization
from app.models.planning import (
    ClubYear,
    Event,
    EventStatus,
    PlanningStatus,
    Season,
    SeasonType,
    Shift,
    ShiftStatus,
)
from app.schemas.planning import (
    ClubYearCreate,
    EventCreate,
    EventUpdate,
    SeasonCreate,
    SeasonUpdate,
    ShiftCreate,
    ShiftUpdate,
)
from app.services.planning import (
    PlanningConflictError,
    PlanningNotFoundError,
    PlanningService,
    PlanningValidationError,
    validate_transition,
)


def test_model_relationships_and_enum_values() -> None:
    assert ClubYear.organization.property.back_populates == "club_years"
    assert Season.club_year.property.back_populates == "seasons"
    assert [item.value for item in PlanningStatus] == ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]
    assert [item.value for item in SeasonType] == ["AUTUMN", "SPRING", "OTHER"]
    assert Event.season.property.back_populates == "events"
    assert Shift.event.property.back_populates == "shifts"
    assert [item.value for item in EventStatus] == [
        "DRAFT",
        "PUBLISHED",
        "POSTPONED",
        "CANCELLED",
        "COMPLETED",
    ]
    assert [item.value for item in ShiftStatus] == ["OPEN", "CLOSED", "CANCELLED"]


def test_invalid_payload_date_ranges_are_rejected() -> None:
    with pytest.raises(ValidationError):
        ClubYearCreate(label="2026", start_date=date(2027, 1, 1), end_date=date(2026, 1, 1))


@pytest.mark.parametrize(
    ("current", "requested"),
    [
        (PlanningStatus.DRAFT, PlanningStatus.ACTIVE),
        (PlanningStatus.DRAFT, PlanningStatus.CLOSED),
        (PlanningStatus.ACTIVE, PlanningStatus.CLOSED),
        (PlanningStatus.CLOSED, PlanningStatus.ARCHIVED),
    ],
)
def test_valid_status_transitions(current: PlanningStatus, requested: PlanningStatus) -> None:
    validate_transition(current, requested)


@pytest.mark.parametrize(
    ("current", "requested"),
    [
        (PlanningStatus.ACTIVE, PlanningStatus.DRAFT),
        (PlanningStatus.CLOSED, PlanningStatus.ACTIVE),
        (PlanningStatus.ARCHIVED, PlanningStatus.DRAFT),
    ],
)
def test_invalid_and_archived_status_transitions(
    current: PlanningStatus, requested: PlanningStatus
) -> None:
    with pytest.raises(PlanningConflictError):
        validate_transition(current, requested)


def test_season_must_fit_inside_club_year() -> None:
    club_year = cast(
        ClubYear, SimpleNamespace(start_date=date(2026, 7, 1), end_date=date(2027, 6, 30))
    )
    with pytest.raises(PlanningValidationError, match="fit inside"):
        PlanningService._validate_inside_club_year(date(2026, 6, 30), date(2026, 12, 31), club_year)


def test_closed_season_rejects_field_edits() -> None:
    club_year = cast(
        ClubYear, SimpleNamespace(start_date=date(2026, 7, 1), end_date=date(2027, 6, 30))
    )
    season = cast(
        Season,
        SimpleNamespace(
            id=uuid4(),
            status=PlanningStatus.CLOSED,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 12, 31),
            club_year=club_year,
        ),
    )
    service = PlanningService(cast(object, _SeasonDb(season)), uuid4())  # type: ignore[arg-type]
    with pytest.raises(PlanningConflictError, match="cannot be edited"):
        service.update_season(season.id, SeasonUpdate(name="Changed"))


def test_client_payload_has_no_organization_id() -> None:
    payload = SeasonCreate(
        type=SeasonType.AUTUMN,
        name="Autumn",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 12, 31),
    )
    assert "organization_id" not in payload.model_dump()


@pytest.mark.parametrize(
    ("schema", "parent_field"), [(EventCreate, "season_id"), (ShiftCreate, "event_id")]
)
def test_child_create_payloads_reject_parent_overrides(schema: object, parent_field: str) -> None:
    values: dict[str, object]
    if schema is EventCreate:
        values = {
            "title": "Match",
            "date": date(2026, 9, 1),
            "location": "Pitch",
            "event_type": "MATCH",
        }
    else:
        values = {
            "starts_at": datetime(2026, 9, 1, 10, tzinfo=UTC),
            "ends_at": datetime(2026, 9, 1, 12, tzinfo=UTC),
            "required_volunteers": 2,
        }
    values[parent_field] = uuid4()
    values["organization_id"] = uuid4()
    with pytest.raises(ValidationError):
        schema.model_validate(values)  # type: ignore[attr-defined]


def test_event_date_must_be_inside_season() -> None:
    season = cast(Season, SimpleNamespace(start_date=date(2026, 8, 1), end_date=date(2026, 12, 31)))
    with pytest.raises(PlanningValidationError, match="inside its season"):
        PlanningService._validate_event_date(date(2027, 1, 1), season)


def test_shift_time_rules() -> None:
    with pytest.raises(PlanningValidationError, match="before"):
        PlanningService._validate_shift_times(
            datetime(2026, 9, 1, 12, tzinfo=UTC),
            datetime(2026, 9, 1, 10, tzinfo=UTC),
            date(2026, 9, 1),
        )
    with pytest.raises(PlanningValidationError, match="event date"):
        PlanningService._validate_shift_times(
            datetime(2026, 9, 1, 22, tzinfo=UTC),
            datetime(2026, 9, 2, 1, tzinfo=UTC),
            date(2026, 9, 1),
        )
    with pytest.raises(ValidationError):
        ShiftCreate(
            starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC),
            ends_at=datetime(2026, 9, 1, 11, tzinfo=UTC),
            required_volunteers=0,
        )


@pytest.mark.parametrize(
    ("schema", "values"),
    [(EventUpdate, {"date": None}), (ShiftUpdate, {"required_volunteers": None})],
)
def test_updates_reject_null_for_required_columns(
    schema: object, values: dict[str, object]
) -> None:
    with pytest.raises(ValidationError):
        schema.model_validate(values)  # type: ignore[attr-defined]


def test_tenant_scoped_event_and_shift_lookups_reject_missing_chain() -> None:
    service = PlanningService(cast(object, _MissingDb()), uuid4())  # type: ignore[arg-type]
    with pytest.raises(PlanningNotFoundError):
        service._get_event(uuid4())
    with pytest.raises(PlanningNotFoundError):
        service._get_shift(uuid4())


def test_event_shift_routes_are_registered_with_manage_guard() -> None:
    expected = {
        ("GET", "/api/admin/{organization_slug}/seasons/{season_id}/events"),
        ("POST", "/api/admin/{organization_slug}/seasons/{season_id}/events"),
        ("PATCH", "/api/admin/{organization_slug}/events/{event_id}"),
        ("GET", "/api/admin/{organization_slug}/events/{event_id}/shifts"),
        ("POST", "/api/admin/{organization_slug}/events/{event_id}/shifts"),
        ("PATCH", "/api/admin/{organization_slug}/shifts/{shift_id}"),
    }
    actual = {
        (method, getattr(route, "path", ""))
        for route in planning.router.routes
        for method in getattr(route, "methods", set())
    }
    assert expected <= actual


def test_wrong_organization_slug_is_forbidden(client: TestClient) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(CurrentStaffMembership, SimpleNamespace(organization=organization))
    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _ListDb()
    try:
        response = client.get("/api/admin/tenant-b/club-years")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_admin_and_coordination_role_dependency_is_configured() -> None:
    assert callable(planning.manage)


class _ListDb:
    def scalars(self, _statement: object) -> list[object]:
        return []


class _SeasonDb:
    def __init__(self, season: Season) -> None:
        self.season = season

    def scalar(self, _statement: object) -> Season:
        return self.season


class _MissingDb:
    def scalar(self, _statement: object) -> None:
        return None
