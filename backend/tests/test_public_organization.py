"""Tests for public organization context and branding."""

import uuid
from collections.abc import Iterator
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Table, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import public
from app.api.public import to_public_response
from app.core.config import AppEnv
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.organization import Organization, Theme
from app.services.organization_context import OrganizationLookup, resolve_organization


def test_public_organization_returns_public_theme_and_settings(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = _organization()

    def fake_get_db() -> object:
        return object()

    app.dependency_overrides[get_db] = fake_get_db
    monkeypatch.setattr(public, "resolve_organization", lambda _db, _lookup, _env: organization)
    try:
        response = client.get("/api/public/organization")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Example Club"
    assert body["slug"] == "example-club"
    assert body["theme"] == {
        "name": "Example Theme",
        "logo_url": None,
        "banner_url": None,
        "primary_color": "#111111",
        "secondary_color": "#eeeeee",
    }
    assert body["settings"]["payout_rate_minor_per_hour"] == 900
    assert body["language"] == "de"
    assert body["timezone"] == "Europe/Zurich"
    assert body["currency"] == "CHF"


def test_public_organization_returns_404_when_no_context(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_get_db() -> object:
        return object()

    app.dependency_overrides[get_db] = fake_get_db
    monkeypatch.setattr(public, "resolve_organization", lambda _db, _lookup, _env: None)
    try:
        response = client.get("/api/public/organization")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def test_public_organization_uses_path_slug(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = _organization()
    captured_lookup: list[OrganizationLookup] = []

    def fake_get_db() -> object:
        return object()

    def fake_resolver(_db: object, lookup: OrganizationLookup, _env: AppEnv) -> Organization:
        captured_lookup.append(lookup)
        return organization

    app.dependency_overrides[get_db] = fake_get_db
    monkeypatch.setattr(public, "resolve_organization", fake_resolver)
    try:
        response = client.get("/api/public/organization/example-club")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_lookup[0].path_slug == "example-club"


def test_production_resolution_has_no_single_organization_fallback() -> None:
    lookup = OrganizationLookup(
        custom_domain=None,
        subdomain=None,
        path_slug=None,
        development_override=None,
    )
    assert resolve_organization(cast(Session, object()), lookup, AppEnv.PRODUCTION) is None


def test_public_response_reads_theme_not_organization_branding() -> None:
    organization = _organization(primary_color="#123456", secondary_color="#abcdef")
    response = to_public_response(organization)
    assert response.theme.primary_color == "#123456"
    assert response.theme.secondary_color == "#abcdef"


_DIRECTORY_TABLES = cast("list[Table]", [Theme.__table__, Organization.__table__])


@pytest.fixture
def directory_engine() -> Iterator[Engine]:
    """SQLite engine reused across threads: `TestClient` runs the route in a worker thread."""
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

    Base.metadata.create_all(sqlite_engine, tables=_DIRECTORY_TABLES)
    yield sqlite_engine
    sqlite_engine.dispose()


@pytest.fixture
def directory_session(directory_engine: Engine) -> Iterator[Session]:
    with Session(directory_engine) as db_session:
        yield db_session


def test_list_organizations_returns_all_seeded_organizations_with_logos(
    client: TestClient, directory_session: Session
) -> None:
    theme_a = Theme(name="Theme A", logo_url="/branding/a-logo.png")
    theme_b = Theme(name="Theme B", logo_url=None)
    directory_session.add_all([theme_a, theme_b])
    directory_session.flush()
    directory_session.add_all(
        [
            Organization(theme_id=theme_a.id, name="B Club", short_name="B", slug="b-club"),
            Organization(theme_id=theme_b.id, name="A Club", short_name=None, slug="a-club"),
        ]
    )
    directory_session.commit()

    app.dependency_overrides[get_db] = lambda: directory_session
    try:
        response = client.get("/api/public/organizations")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert [item["slug"] for item in body] == ["a-club", "b-club"]
    assert body[0]["name"] == "A Club"
    assert body[0]["short_name"] is None
    assert body[0]["logo_url"] is None
    assert body[1]["name"] == "B Club"
    assert body[1]["logo_url"] == "/branding/a-logo.png"


def test_list_organizations_returns_empty_list_when_none_exist(
    client: TestClient, directory_session: Session
) -> None:
    app.dependency_overrides[get_db] = lambda: directory_session
    try:
        response = client.get("/api/public/organizations")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == []


def test_list_organizations_requires_no_authentication(
    client: TestClient, directory_session: Session
) -> None:
    """No auth cookies/headers are sent at all; a 200 confirms the route needs none."""
    theme = Theme(name="Theme")
    directory_session.add(theme)
    directory_session.flush()
    directory_session.add(Organization(theme_id=theme.id, name="Solo Club", slug="solo-club"))
    directory_session.commit()

    app.dependency_overrides[get_db] = lambda: directory_session
    try:
        response = client.get("/api/public/organizations", headers={})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert len(response.json()) == 1


def _organization(
    primary_color: str = "#111111",
    secondary_color: str = "#eeeeee",
) -> Organization:
    return cast(
        Organization,
        SimpleNamespace(
            id=uuid4(),
            name="Example Club",
            short_name="Example",
            slug="example-club",
            theme=SimpleNamespace(
                name="Example Theme",
                logo_url=None,
                banner_url=None,
                primary_color=primary_color,
                secondary_color=secondary_color,
            ),
            language="de",
            locale="de-CH",
            timezone="Europe/Zurich",
            currency="CHF",
            contact_email="info@example.test",
            contact_phone=None,
            contact_url="https://example.test",
            settings=SimpleNamespace(
                payout_rate_minor_per_hour=900,
                signup_rate_limit_per_contact=5,
                signup_rate_limit_window_minutes=60,
                coordination_contact_label=None,
                coordination_contact_phone=None,
                volunteer_password_min_length=6,
            ),
        ),
    )
