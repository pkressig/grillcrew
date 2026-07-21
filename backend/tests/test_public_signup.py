"""Focused public signup API and normalization tests."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import public
from app.core.security.rate_limit import InMemoryRateLimiter
from app.db.session import get_db
from app.main import app
from app.services.public_signup import normalize_email, normalize_phone


def payload(**overrides: object) -> dict[str, object]:
    result: dict[str, object] = {
        "first_name": "Mia",
        "last_name": "Muster",
        "phone": "+41 79 123 45 67",
        "email": "Mia@Example.Test ",
        "public_display_consent": True,
        "website": "",
        "form_started_at": (datetime.now(UTC) - timedelta(seconds=3)).isoformat(),
    }
    result.update(overrides)
    return result


def test_contact_normalization_is_deterministic() -> None:
    assert normalize_email(" Mia@EXAMPLE.test ") == "mia@example.test"
    assert normalize_phone("+41 (79) 123-45-67") == "+41791234567"


def test_public_signup_returns_safe_summary(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = SimpleNamespace(
        id=uuid4(),
        settings=SimpleNamespace(
            signup_rate_limit_per_contact=5, signup_rate_limit_window_minutes=60
        ),
    )
    signup = SimpleNamespace(public_name_snapshot="Mia Muster")

    class FakeService:
        def __init__(self, _db: object, organization_id: object) -> None:
            assert organization_id == organization.id

        def create(self, _shift_id: object, _payload: object) -> tuple[object, int, int]:
            return signup, 1, 2

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PublicSignupService", FakeService)
    monkeypatch.setattr(public, "signup_rate_limiter", InMemoryRateLimiter())
    try:
        response = client.post(f"/api/public/example/shifts/{uuid4()}/signups", json=payload())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 201
    assert response.json()["signup"] == {
        "public_name": "Mia Muster",
        "occupied_volunteers": 1,
        "required_volunteers": 2,
    }
    assert "phone" not in response.text
    assert "email" not in response.text


def test_honeypot_is_generic_and_does_not_create(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = SimpleNamespace(id=uuid4())
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    try:
        response = client.post(
            f"/api/public/example/shifts/{uuid4()}/signups", json=payload(website="spam")
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 201
    assert response.json()["signup"] is None


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({"public_display_consent": False}, 422),
        ({"form_started_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat()}, 429),
        ({"first_name": ""}, 422),
    ],
)
def test_public_signup_rejects_invalid_or_too_fast_requests(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    change: dict[str, object],
    expected: int,
) -> None:
    organization = SimpleNamespace(id=uuid4())
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    try:
        response = client.post(
            f"/api/public/example/shifts/{uuid4()}/signups", json=payload(**change)
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == expected
