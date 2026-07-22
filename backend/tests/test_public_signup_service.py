"""Service-level tests for tenant-scoped public signup capacity and safety rules.

Exercises `PublicSignupService.create` against a real SQLAlchemy session instead of a
mocked service, so capacity, duplicate-contact, status, and tenant-isolation checks run
against the actual query logic rather than a stand-in.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import cast
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import Table, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.db.base import Base
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
    SignupStatus,
    Volunteer,
)
from app.schemas.planning import PublicSignupCreate
from app.services.public_signup import (
    PublicSignupConflictError,
    PublicSignupNotFoundError,
    PublicSignupService,
    can_self_cancel,
    cancellation_deadline,
    hash_management_token,
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
        Volunteer.__table__,
        Signup.__table__,
    ],
)


@pytest.fixture
def engine() -> Iterator[Engine]:
    """SQLite engine standing in for Postgres, with a gen_random_uuid() shim.

    Model primary keys rely on Postgres' server-side `gen_random_uuid()`; SQLite has no
    such function, so one is registered per-connection purely for this test's DDL/DML.
    """
    sqlite_engine = create_engine("sqlite:///:memory:")

    @event.listens_for(sqlite_engine, "connect")
    def _register_uuid_function(dbapi_connection: object, _record: object) -> None:
        dbapi_connection.create_function(  # type: ignore[attr-defined]
            "gen_random_uuid", 0, lambda: uuid.uuid4().hex
        )

    Base.metadata.create_all(sqlite_engine, tables=_TABLES)
    yield sqlite_engine
    sqlite_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as db_session:
        yield db_session


def _seed_shift(
    db_session: Session,
    *,
    required_volunteers: int = 1,
    event_status: EventStatus = EventStatus.PUBLISHED,
    shift_status: ShiftStatus = ShiftStatus.OPEN,
    event_date: date = date(2026, 6, 1),
) -> tuple[Organization, Shift]:
    theme = Theme(name="Theme")
    db_session.add(theme)
    db_session.flush()
    organization = Organization(theme_id=theme.id, name="Org", slug=f"org-{uuid.uuid4().hex[:8]}")
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
    event_row = Event(
        season_id=season.id,
        title="Match",
        date=event_date,
        location="Home",
        event_type="match",
        status=event_status,
    )
    db_session.add(event_row)
    db_session.flush()
    shift = Shift(
        event_id=event_row.id,
        starts_at=datetime.combine(event_date, datetime.min.time(), UTC) + timedelta(hours=10),
        ends_at=datetime.combine(event_date, datetime.min.time(), UTC) + timedelta(hours=12),
        required_volunteers=required_volunteers,
        status=shift_status,
    )
    db_session.add(shift)
    db_session.flush()
    return organization, shift


def _payload(**overrides: object) -> PublicSignupCreate:
    values: dict[str, object] = {
        "first_name": "Mia",
        "last_name": "Muster",
        "phone": "+41791234567",
        "email": "mia@example.test",
        "public_display_consent": True,
        "website": "",
        "form_started_at": datetime.now(UTC) - timedelta(seconds=5),
    }
    values.update(overrides)
    return PublicSignupCreate.model_validate(values)


def test_create_signup_reserves_the_shift(session: Session) -> None:
    organization, shift = _seed_shift(session)
    created = PublicSignupService(session, organization.id).create(shift.id, _payload())
    assert created.signup.public_name_snapshot == "Mia Muster"
    assert (created.occupied, created.required) == (1, 1)
    assert len(created.management_token) >= 43
    assert created.signup.management_token_hash == hash_management_token(created.management_token)
    assert created.management_token != created.signup.management_token_hash


def test_management_lookup_is_tenant_scoped_and_excludes_legacy_rows(session: Session) -> None:
    organization, shift = _seed_shift(session)
    other_organization, _ = _seed_shift(session)
    service = PublicSignupService(session, organization.id)
    created = service.create(shift.id, _payload())
    assert service.get_managed(created.management_token).id == created.signup.id
    with pytest.raises(PublicSignupNotFoundError):
        PublicSignupService(session, other_organization.id).get_managed(created.management_token)
    created.signup.management_token_hash = None
    session.commit()
    with pytest.raises(PublicSignupNotFoundError):
        service.get_managed(created.management_token)


def test_cancellation_deadline_uses_zurich_calendar_days_and_exact_boundary() -> None:
    zurich = ZoneInfo("Europe/Zurich")
    shift_start = datetime(2026, 11, 2, 0, 30, tzinfo=zurich)
    deadline = cancellation_deadline(shift_start, "Europe/Zurich")
    assert deadline == datetime(2026, 10, 25, 23, 59, 59, tzinfo=zurich)
    assert can_self_cancel(shift_start, "Europe/Zurich", deadline)
    assert not can_self_cancel(shift_start, "Europe/Zurich", deadline + timedelta(seconds=1))


def test_volunteer_cancellation_is_idempotent_and_records_metadata(session: Session) -> None:
    organization, shift = _seed_shift(session, event_date=date(2027, 6, 1))
    service = PublicSignupService(session, organization.id)
    created = service.create(shift.id, _payload())
    now = datetime(2027, 5, 20, 12, tzinfo=UTC)
    cancelled = service.cancel(created.management_token, "Europe/Zurich", now)
    assert cancelled.status == SignupStatus.CANCELLED_BY_VOLUNTEER
    assert cancelled.cancellation_reason == "VOLUNTEER_SELF_SERVICE"
    assert cancelled.cancelled_at is not None
    assert service.cancel(created.management_token, "Europe/Zurich", now) is cancelled


def test_volunteer_cancellation_after_deadline_is_rejected(session: Session) -> None:
    organization, shift = _seed_shift(session, event_date=date(2027, 6, 1))
    service = PublicSignupService(session, organization.id)
    created = service.create(shift.id, _payload())
    with pytest.raises(PublicSignupConflictError):
        service.cancel(
            created.management_token,
            "Europe/Zurich",
            datetime(2027, 5, 25, 0, 0, tzinfo=ZoneInfo("Europe/Zurich")),
        )
    assert created.signup.status == SignupStatus.ACTIVE


def test_full_shift_rejects_further_signups(session: Session) -> None:
    organization, shift = _seed_shift(session, required_volunteers=1)
    service = PublicSignupService(session, organization.id)
    service.create(shift.id, _payload())
    with pytest.raises(PublicSignupConflictError):
        service.create(shift.id, _payload(email="other@example.test", phone="+41791234568"))


@pytest.mark.parametrize("shift_status", [ShiftStatus.CLOSED, ShiftStatus.CANCELLED])
def test_closed_or_cancelled_shift_rejects_signup(
    session: Session, shift_status: ShiftStatus
) -> None:
    organization, shift = _seed_shift(session, shift_status=shift_status)
    with pytest.raises(PublicSignupConflictError):
        PublicSignupService(session, organization.id).create(shift.id, _payload())


def test_unpublished_event_shift_is_not_found(session: Session) -> None:
    organization, shift = _seed_shift(session, event_status=EventStatus.DRAFT)
    with pytest.raises(PublicSignupNotFoundError):
        PublicSignupService(session, organization.id).create(shift.id, _payload())


def test_cross_tenant_shift_is_not_found(session: Session) -> None:
    _organization, shift = _seed_shift(session)
    other_organization, _other_shift = _seed_shift(session)
    with pytest.raises(PublicSignupNotFoundError):
        PublicSignupService(session, other_organization.id).create(shift.id, _payload())


def test_duplicate_active_contact_rejects_second_signup_for_same_shift(
    session: Session,
) -> None:
    organization, shift = _seed_shift(session, required_volunteers=5)
    service = PublicSignupService(session, organization.id)
    service.create(shift.id, _payload())
    with pytest.raises(PublicSignupConflictError):
        service.create(shift.id, _payload(first_name="Mia", last_name="Other"))


def test_cancelled_signup_does_not_count_toward_capacity(session: Session) -> None:
    organization, shift = _seed_shift(session, required_volunteers=1)
    service = PublicSignupService(session, organization.id)
    created = service.create(shift.id, _payload())
    created.signup.status = SignupStatus.CANCELLED_BY_ADMIN
    session.commit()
    new_signup = service.create(
        shift.id, _payload(email="second@example.test", phone="+41791234569")
    )
    assert (new_signup.occupied, new_signup.required) == (1, 1)
