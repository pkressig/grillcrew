"""Integration tests for POST /api/auth/volunteer/register against a real session.

Exercises the real route so the multi-children creation logic (each child becomes a
FamilyMember, the first one becomes the volunteer's default compensation assignment)
runs against the actual query/insert logic rather than a mocked service.
"""

import uuid
from collections.abc import Iterator
from typing import cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Table, create_engine, event, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import auth as auth_api
from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.family import Family, FamilyMember, FamilyMemberType
from app.models.identity import RefreshToken, StaffMembership, User
from app.models.organization import Organization, OrganizationSettings, Theme
from app.models.planning import Volunteer

_TABLES = cast(
    "list[Table]",
    [
        Theme.__table__,
        Organization.__table__,
        OrganizationSettings.__table__,
        User.__table__,
        StaffMembership.__table__,
        RefreshToken.__table__,
        Volunteer.__table__,
        Family.__table__,
        FamilyMember.__table__,
    ],
)


@pytest.fixture
def engine() -> Iterator[Engine]:
    sqlite_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(sqlite_engine, "connect")
    def _register_uuid_function(dbapi_connection: object, _record: object) -> None:
        dbapi_connection.create_function(  # type: ignore[attr-defined]
            "gen_random_uuid", 0, lambda: uuid.uuid4().hex
        )

    Base.metadata.create_all(sqlite_engine, tables=_TABLES)
    yield sqlite_engine
    sqlite_engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def organization(db_session: Session) -> Organization:
    theme = Theme(name="Theme")
    db_session.add(theme)
    db_session.flush()
    org = Organization(theme_id=theme.id, name="Org", slug="org")
    db_session.add(org)
    db_session.flush()
    db_session.add(OrganizationSettings(organization_id=org.id))
    db_session.commit()
    return org


@pytest.fixture
def client(
    db_session: Session, organization: Organization, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    settings = Settings(cors_allowed_origins="http://testserver")
    monkeypatch.setattr(auth_api, "get_settings", lambda: settings)
    monkeypatch.setattr(
        auth_api,
        "dispatch_volunteer_registration_email",
        lambda _settings, **_kwargs: None,
    )
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "organization_slug": "org",
        "first_name": "Mia",
        "last_name": "Muster",
        "phone": "079 111 22 33",
        "email": "mia@example.test",
        "password": "a-very-long-password",
    }
    base.update(overrides)
    return base


def test_register_without_children_creates_only_the_helper_family_member(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/auth/volunteer/register", json=_payload(), headers={"Origin": "http://testserver"}
    )
    assert response.status_code == 201
    volunteer = db_session.scalar(
        select(Volunteer).where(Volunteer.email_normalized == "mia@example.test")
    )
    assert volunteer is not None
    assert volunteer.compensation_family_member_id is None
    members = db_session.scalars(
        select(FamilyMember).where(FamilyMember.family_id.in_(select(Family.id)))
    ).all()
    assert [m.member_type for m in members] == [FamilyMemberType.HELPER]


def test_register_creates_a_family_member_per_child_and_credits_the_first(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/auth/volunteer/register",
        json=_payload(
            children=[
                {"first_name": "Lina", "last_name": "Muster", "team_name": "U12"},
                {"first_name": "Nico", "last_name": "Muster"},
            ]
        ),
        headers={"Origin": "http://testserver"},
    )
    assert response.status_code == 201
    volunteer = db_session.scalar(
        select(Volunteer).where(Volunteer.email_normalized == "mia@example.test")
    )
    assert volunteer is not None
    children = db_session.scalars(
        select(FamilyMember).where(FamilyMember.member_type == FamilyMemberType.CHILD)
    ).all()
    assert sorted((c.first_name, c.team_name) for c in children) == [
        ("Lina", "U12"),
        ("Nico", None),
    ]
    credited = db_session.get(FamilyMember, volunteer.compensation_family_member_id)
    assert credited is not None
    assert credited.first_name == "Lina"


def test_register_skips_a_child_missing_a_required_name(client: TestClient) -> None:
    response = client.post(
        "/api/auth/volunteer/register",
        json=_payload(children=[{"first_name": "Lina", "last_name": ""}]),
        headers={"Origin": "http://testserver"},
    )
    assert response.status_code == 422


def test_register_rejects_more_than_ten_children(client: TestClient) -> None:
    response = client.post(
        "/api/auth/volunteer/register",
        json=_payload(children=[{"first_name": "Child", "last_name": str(i)} for i in range(11)]),
        headers={"Origin": "http://testserver"},
    )
    assert response.status_code == 422
