"""Tests for public organization context and branding."""

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api import public
from app.api.public import to_public_response
from app.core.config import AppEnv
from app.db.session import get_db
from app.main import app
from app.models.organization import Organization
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

    def fake_resolver(
        _db: object, lookup: OrganizationLookup, _env: AppEnv
    ) -> Organization:
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
            ),
        ),
    )
