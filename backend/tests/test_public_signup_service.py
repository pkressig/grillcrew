"""Service-level tests for tenant-scoped public signup capacity and safety rules.

Exercises `PublicSignupService.create` against a real SQLAlchemy session instead of a
mocked service, so capacity, duplicate-contact, status, and tenant-isolation checks run
against the actual query logic rather than a stand-in.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import cast

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
        date=date(2026, 6, 1),
        location="Home",
        event_type="match",
        status=event_status,
    )
    db_session.add(event_row)
    db_session.flush()
    shift = Shift(
        event_id=event_row.id,
        starts_at=datetime(2026, 6, 1, 10, 0, tzinfo=UTC),
        ends_at=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
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
    signup, occupied, required = PublicSignupService(session, organization.id).create(
        shift.id, _payload()
    )
    assert signup.public_name_snapshot == "Mia Muster"
    assert (occupied, required) == (1, 1)


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
    signup, _occupied, _required = service.create(shift.id, _payload())
    signup.status = SignupStatus.CANCELLED_BY_ADMIN
    session.commit()
    _new_signup, occupied, required = service.create(
        shift.id, _payload(email="second@example.test", phone="+41791234569")
    )
    assert (occupied, required) == (1, 1)
