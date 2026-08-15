"""Integration tests for the authenticated volunteer self-service profile API.

Exercises the real routes against a real SQLAlchemy session (SQLite standing in for
Postgres, matching the pattern in test_public_signup_service.py), so CSRF/origin
guards, ownership checks, and the cancellation-deadline rule run against the actual
query logic rather than a mocked service.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import JSON, Column, DateTime, Table, TypeDecorator, create_engine, event
from sqlalchemy.dialects import sqlite as sqlite_dialect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql.compiler import SQLCompiler

from app.api import volunteer as volunteer_api
from app.api.dependencies import CurrentUser, get_current_user, validate_csrf
from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.family import Family, FamilyMember, FamilyMemberType
from app.models.identity import AuditEvent, User, UserStatus
from app.models.organization import Organization, Theme
from app.models.planning import (
    ClubYear,
    Event,
    EventStatus,
    PlanningStatus,
    Season,
    SeasonType,
    Shift,
    ShiftStatus,
    Signup,
    SignupSource,
    SignupStatus,
    Volunteer,
    VolunteerCompensation,
)

_TABLES = cast(
    "list[Table]",
    [
        Theme.__table__,
        Organization.__table__,
        ClubYear.__table__,
        Season.__table__,
        Event.__table__,
        Shift.__table__,
        Family.__table__,
        FamilyMember.__table__,
        User.__table__,
        Volunteer.__table__,
        Signup.__table__,
        AuditEvent.__table__,
    ],
)


@compiles(JSONB, "sqlite")
def _jsonb_as_json_on_sqlite(element: JSONB, compiler: SQLCompiler, **kw: object) -> str:
    return str(compiler.process(JSON(), **kw))


class _UTCDateTime(TypeDecorator):  # type: ignore[type-arg]
    """SQLite has no timezone-aware timestamp type: it silently stores and returns
    naive datetimes for DateTime(timezone=True) columns, unlike real Postgres. This
    keeps values UTC-aware end to end so app code's tz-aware comparisons (e.g.
    `shift.ends_at < datetime.now(UTC)`) behave the same as they do in production.
    """

    # A concrete dialect impl, not the abstract sa.DateTime: colspecs below maps
    # sa.DateTime -> this class, so using sa.DateTime as impl here would recurse
    # back into that same mapping instead of SQLite's real string-parsing type.
    impl = sqlite_dialect.DATETIME
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: object) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.astimezone(UTC).replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect: object) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


@pytest.fixture
def engine() -> Iterator[Engine]:
    # TestClient dispatches sync endpoints onto a worker thread, so the connection
    # must survive across threads: StaticPool keeps the single in-memory SQLite
    # connection alive and shared instead of a fresh (empty) one per checkout.
    sqlite_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sqlite_engine.dialect.colspecs = {**sqlite_engine.dialect.colspecs, DateTime: _UTCDateTime}

    @event.listens_for(sqlite_engine, "connect")
    def _register_uuid_function(dbapi_connection: object, _record: object) -> None:
        dbapi_connection.create_function(  # type: ignore[attr-defined]
            "gen_random_uuid", 0, lambda: uuid.uuid4().hex
        )

    # AuditEvent.metadata's server_default is a Postgres-only `'{}'::jsonb` cast that
    # SQLite's DDL compiler rejects outright. The application always passes
    # event_metadata explicitly at insert time, so the server_default is never relied
    # on at runtime; strip it only for this table-creation call, then restore the
    # shared Table object immediately so no other test module is affected.
    metadata_column = cast("Column[object]", AuditEvent.__table__.c.metadata)
    original_default = metadata_column.server_default
    metadata_column.server_default = None
    try:
        Base.metadata.create_all(sqlite_engine, tables=_TABLES)
    finally:
        metadata_column.server_default = original_default
    yield sqlite_engine
    sqlite_engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    # expire_on_commit=False: SQLite has no native tz-aware timestamp type, so a
    # post-commit re-fetch would silently drop tzinfo from DateTime(timezone=True)
    # columns (unlike real Postgres). Keeping the originally-set, tz-aware Python
    # values in place sidesteps that SQLite-only artifact.
    with Session(engine, expire_on_commit=False) as session:
        yield session


class Scenario:
    def __init__(self) -> None:
        self.organization: Organization
        self.volunteer: Volunteer
        self.user: User
        self.family: Family
        self.helper_member: FamilyMember
        self.child: FamilyMember
        self.other_family_child: FamilyMember
        self.upcoming_signup: Signup
        self.past_deadline_signup: Signup
        self.other_volunteer_signup: Signup


def _seed(db_session: Session) -> Scenario:
    scenario = Scenario()
    theme = Theme(name="Theme")
    db_session.add(theme)
    db_session.flush()
    organization = Organization(theme_id=theme.id, name="Org", slug="org", timezone="Europe/Zurich")
    db_session.add(organization)
    db_session.flush()
    club_year = ClubYear(
        organization_id=organization.id,
        label="2026",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        status=PlanningStatus.ACTIVE,
    )
    db_session.add(club_year)
    db_session.flush()
    season = Season(
        club_year_id=club_year.id,
        type=SeasonType.SPRING,
        name="Spring",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        status=PlanningStatus.ACTIVE,
    )
    db_session.add(season)
    db_session.flush()

    now = datetime.now(UTC)
    far_future_date = (now + timedelta(days=30)).date()
    near_future_date = (now + timedelta(days=2)).date()

    far_event = Event(
        season_id=season.id,
        title="Match far away",
        date=far_future_date,
        location="Home",
        event_type="match",
        status=EventStatus.PUBLISHED,
    )
    near_event = Event(
        season_id=season.id,
        title="Match soon",
        date=near_future_date,
        location="Home",
        event_type="match",
        status=EventStatus.PUBLISHED,
    )
    db_session.add_all([far_event, near_event])
    db_session.flush()

    def _day_start(day: date) -> datetime:
        return datetime.combine(day, datetime.min.time(), UTC)

    far_shift = Shift(
        event_id=far_event.id,
        starts_at=_day_start(far_future_date) + timedelta(hours=10),
        ends_at=_day_start(far_future_date) + timedelta(hours=12),
        required_volunteers=1,
        status=ShiftStatus.OPEN,
    )
    near_shift = Shift(
        event_id=near_event.id,
        starts_at=_day_start(near_future_date) + timedelta(hours=10),
        ends_at=_day_start(near_future_date) + timedelta(hours=12),
        required_volunteers=1,
        status=ShiftStatus.OPEN,
    )
    db_session.add_all([far_shift, near_shift])
    db_session.flush()

    user = User(email_normalized="mia@example.test", status=UserStatus.ACTIVE)
    db_session.add(user)
    db_session.flush()

    volunteer = Volunteer(
        organization_id=organization.id,
        user_id=user.id,
        first_name="Mia",
        last_name="Muster",
        phone_normalized="+41791234567",
        phone_display="+41 79 123 45 67",
        email_normalized="mia@example.test",
        email_display="mia@example.test",
        created_from=SignupSource.PUBLIC_SIGNUP,
        compensation_preference=VolunteerCompensation.WORK_HOURS,
    )
    db_session.add(volunteer)
    db_session.flush()

    family = Family(organization_id=organization.id, display_name="Muster")
    db_session.add(family)
    db_session.flush()
    helper_member = FamilyMember(
        family_id=family.id,
        member_type=FamilyMemberType.HELPER,
        first_name="Mia",
        last_name="Muster",
        volunteer_id=volunteer.id,
    )
    child = FamilyMember(
        family_id=family.id,
        member_type=FamilyMemberType.CHILD,
        first_name="Nico",
        last_name="Muster",
    )
    db_session.add_all([helper_member, child])
    db_session.flush()

    other_family = Family(organization_id=organization.id, display_name="Other")
    db_session.add(other_family)
    db_session.flush()
    other_family_child = FamilyMember(
        family_id=other_family.id,
        member_type=FamilyMemberType.CHILD,
        first_name="Someone",
        last_name="Else",
    )
    other_user = User(email_normalized="other@example.test", status=UserStatus.ACTIVE)
    db_session.add_all([other_family_child, other_user])
    db_session.flush()
    other_volunteer = Volunteer(
        organization_id=organization.id,
        user_id=other_user.id,
        first_name="Other",
        last_name="Person",
        phone_normalized="+41790000000",
        phone_display="+41 79 000 00 00",
        email_normalized="other@example.test",
        email_display="other@example.test",
        created_from=SignupSource.PUBLIC_SIGNUP,
        compensation_preference=VolunteerCompensation.WORK_HOURS,
    )
    db_session.add(other_volunteer)
    db_session.flush()

    upcoming_signup = Signup(
        shift_id=far_shift.id,
        volunteer_id=volunteer.id,
        public_name_snapshot="Mia Muster",
        source=SignupSource.PUBLIC_SIGNUP,
    )
    past_deadline_signup = Signup(
        shift_id=near_shift.id,
        volunteer_id=volunteer.id,
        public_name_snapshot="Mia Muster",
        source=SignupSource.PUBLIC_SIGNUP,
    )
    other_volunteer_signup = Signup(
        shift_id=far_shift.id,
        volunteer_id=other_volunteer.id,
        public_name_snapshot="Other Person",
        source=SignupSource.PUBLIC_SIGNUP,
    )
    db_session.add_all([upcoming_signup, past_deadline_signup, other_volunteer_signup])
    db_session.commit()

    scenario.organization = organization
    scenario.volunteer = volunteer
    scenario.user = user
    scenario.family = family
    scenario.helper_member = helper_member
    scenario.child = child
    scenario.other_family_child = other_family_child
    scenario.upcoming_signup = upcoming_signup
    scenario.past_deadline_signup = past_deadline_signup
    scenario.other_volunteer_signup = other_volunteer_signup
    return scenario


def _client(
    db_session: Session, scenario: Scenario, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    settings = Settings(cors_allowed_origins="http://testserver")
    monkeypatch.setattr(volunteer_api, "get_settings", lambda: settings)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(user=scenario.user)
    app.dependency_overrides[validate_csrf] = lambda: None
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def scenario(db_session: Session) -> Scenario:
    return _seed(db_session)


@pytest.fixture
def client(
    db_session: Session, scenario: Scenario, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    yield from _client(db_session, scenario, monkeypatch)


def _headers() -> dict[str, str]:
    return {"Origin": "http://testserver"}


def test_get_profile_lists_signups_with_resolved_defaults_and_cancel_eligibility(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.get("/api/volunteer/profile", headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert len(body["upcoming_signups"]) == 2
    summary = next(
        s for s in body["upcoming_signups"] if s["id"] == str(scenario.upcoming_signup.id)
    )
    assert summary["compensation_type"] == "WORK_HOURS"
    assert summary["credited_family_member_id"] is None
    assert summary["can_cancel"] is True
    assert "event_location" not in summary
    assert [child["name"] for child in body["family_children"]] == ["Nico Muster"]


def test_get_profile_reports_cannot_cancel_past_the_deadline(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.get("/api/volunteer/profile", headers=_headers())
    completed_and_upcoming = (
        response.json()["upcoming_signups"] + response.json()["completed_signups"]
    )
    near = next(
        s for s in completed_and_upcoming if s["id"] == str(scenario.past_deadline_signup.id)
    )
    assert near["can_cancel"] is False


def test_update_signup_sets_a_per_shift_compensation_override(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.patch(
        f"/api/volunteer/signups/{scenario.upcoming_signup.id}",
        headers=_headers(),
        json={"compensation_type": "PAYOUT", "credited_family_member_id": str(scenario.child.id)},
    )
    assert response.status_code == 200
    summary = next(
        s
        for s in response.json()["upcoming_signups"]
        if s["id"] == str(scenario.upcoming_signup.id)
    )
    assert summary["compensation_type"] == "PAYOUT"
    assert summary["credited_family_member_id"] == str(scenario.child.id)
    assert summary["credited_family_member_name"] == "Nico Muster"


def test_update_signup_rejects_a_child_from_another_family(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.patch(
        f"/api/volunteer/signups/{scenario.upcoming_signup.id}",
        headers=_headers(),
        json={
            "compensation_type": "PAYOUT",
            "credited_family_member_id": str(scenario.other_family_child.id),
        },
    )
    assert response.status_code == 422


def test_update_signup_rejects_a_signup_owned_by_another_volunteer(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.patch(
        f"/api/volunteer/signups/{scenario.other_volunteer_signup.id}",
        headers=_headers(),
        json={"compensation_type": "PAYOUT"},
    )
    assert response.status_code == 404


def test_cancel_own_signup_within_the_deadline_succeeds_and_is_audited(
    client: TestClient, scenario: Scenario, db_session: Session
) -> None:
    response = client.post(
        f"/api/volunteer/signups/{scenario.upcoming_signup.id}/cancel",
        headers=_headers(),
        json={"reason": "Bin verhindert"},
    )
    assert response.status_code == 200
    body = response.json()
    assert scenario.upcoming_signup.id not in [uuid.UUID(s["id"]) for s in body["upcoming_signups"]]
    cancelled = next(
        s for s in body["completed_signups"] if s["id"] == str(scenario.upcoming_signup.id)
    )
    assert cancelled["can_cancel"] is False
    db_session.refresh(scenario.upcoming_signup)
    assert scenario.upcoming_signup.status == SignupStatus.CANCELLED_BY_VOLUNTEER
    assert scenario.upcoming_signup.cancellation_reason == "Bin verhindert"
    audit_events = db_session.query(AuditEvent).all()
    assert any(
        e.action == "SIGNUP_CANCELLED_BY_VOLUNTEER_SELF_SERVICE"
        and e.entity_id == scenario.upcoming_signup.id
        for e in audit_events
    )


def test_cancel_own_signup_past_the_deadline_is_rejected(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.post(
        f"/api/volunteer/signups/{scenario.past_deadline_signup.id}/cancel",
        headers=_headers(),
        json={},
    )
    assert response.status_code == 409


def test_cancel_own_signup_rejects_a_signup_owned_by_another_volunteer(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.post(
        f"/api/volunteer/signups/{scenario.other_volunteer_signup.id}/cancel",
        headers=_headers(),
        json={},
    )
    assert response.status_code == 404


def test_create_update_and_delete_child_round_trip(client: TestClient, scenario: Scenario) -> None:
    created = client.post(
        "/api/volunteer/children",
        headers=_headers(),
        json={"first_name": "Lina", "last_name": "Muster", "team_name": None},
    )
    assert created.status_code == 201
    child_id = created.json()["id"]
    assert created.json()["name"] == "Lina Muster"

    updated = client.patch(
        f"/api/volunteer/children/{child_id}",
        headers=_headers(),
        json={"first_name": "Lina", "last_name": "Musterfrau", "team_name": "U12"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Lina Musterfrau"

    deleted = client.delete(f"/api/volunteer/children/{child_id}", headers=_headers())
    assert deleted.status_code == 204

    profile = client.get("/api/volunteer/profile", headers=_headers())
    assert child_id not in [c["id"] for c in profile.json()["family_children"]]


def test_update_child_rejects_a_child_from_another_family(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.patch(
        f"/api/volunteer/children/{scenario.other_family_child.id}",
        headers=_headers(),
        json={"first_name": "Hacked", "last_name": "Name", "team_name": None},
    )
    assert response.status_code == 422


def test_delete_child_rejects_a_child_from_another_family(
    client: TestClient, scenario: Scenario
) -> None:
    response = client.delete(
        f"/api/volunteer/children/{scenario.other_family_child.id}", headers=_headers()
    )
    assert response.status_code == 422
