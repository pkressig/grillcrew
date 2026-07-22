"""Focused public signup API and normalization tests."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import public
from app.core.security.rate_limit import InMemoryRateLimiter
from app.db.session import get_db
from app.main import app
from app.models.planning import Signup
from app.services.public_signup import (
    CreatedPublicSignup,
    PublicSignupNotFoundError,
    normalize_email,
    normalize_phone,
)


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
        name="Example Organization",
        slug="example",
        timezone="Europe/Zurich",
        settings=SimpleNamespace(
            signup_rate_limit_per_contact=5, signup_rate_limit_window_minutes=60
        ),
    )
    signup = SimpleNamespace(
        id=uuid4(),
        public_name_snapshot="Mia Muster",
        volunteer=SimpleNamespace(email_display="mia@example.test"),
        shift=SimpleNamespace(
            starts_at=datetime(2026, 8, 1, 8, tzinfo=UTC),
            ends_at=datetime(2026, 8, 1, 10, tzinfo=UTC),
            event=SimpleNamespace(title="Heimspiel", event_type="Match"),
        ),
    )
    dispatched: list[dict[str, object]] = []

    class FakeService:
        def __init__(self, _db: object, organization_id: object) -> None:
            assert organization_id == organization.id

        def create(self, _shift_id: object, _payload: object) -> CreatedPublicSignup:
            return CreatedPublicSignup(cast(Signup, signup), 1, 2, "secret-token")

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PublicSignupService", FakeService)
    monkeypatch.setattr(public, "signup_rate_limiter", InMemoryRateLimiter())
    monkeypatch.setattr(
        public,
        "dispatch_signup_confirmation_email",
        lambda _settings, **kwargs: dispatched.append(kwargs),
    )
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
    assert response.json()["management_url"] == "/example/manage-signup/secret-token"
    assert len(dispatched) == 1
    assert dispatched[0]["recipient"] == "mia@example.test"
    assert "phone" not in response.text
    assert "email" not in response.text


def test_honeypot_is_generic_and_does_not_create(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = SimpleNamespace(id=uuid4())
    dispatched: list[object] = []
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(
        public,
        "dispatch_signup_confirmation_email",
        lambda *_args, **_kwargs: dispatched.append(object()),
    )
    try:
        response = client.post(
            f"/api/public/example/shifts/{uuid4()}/signups", json=payload(website="spam")
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 201
    assert response.json()["signup"] is None
    assert dispatched == []


def test_management_endpoint_returns_token_holder_details_without_internals(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = SimpleNamespace(
        id=uuid4(),
        name="Example Organization",
        slug="example",
        timezone="Europe/Zurich",
        settings=SimpleNamespace(coordination_contact_label="Einsatzkoordination"),
    )
    signup = SimpleNamespace(
        public_name_snapshot="Mia Muster",
        status="ACTIVE",
        cancelled_at=None,
        management_token_hash="must-not-leak",
        cancellation_reason=None,
        volunteer=SimpleNamespace(
            first_name="Mia",
            last_name="Muster",
            phone_display="+41 79 123 45 67",
            email_display="mia@example.test",
            internal_note="private",
        ),
        shift=SimpleNamespace(
            starts_at=datetime(2027, 8, 15, 10, tzinfo=UTC),
            ends_at=datetime(2027, 8, 15, 12, tzinfo=UTC),
            status="OPEN",
            event=SimpleNamespace(
                title="Heimspiel",
                event_type="Match",
                date="2027-08-15",
                location="Sportplatz",
                public_description="Haupteingang",
                internal_note="staff only",
            ),
        ),
    )

    class FakeService:
        def __init__(self, _db: object, organization_id: object) -> None:
            assert organization_id == organization.id

        def get_managed(self, token: str) -> Signup:
            assert token == "secret-token"
            return cast(Signup, signup)

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PublicSignupService", FakeService)
    try:
        response = client.get("/api/public/example/signups/manage/secret-token")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["email"] == "mia@example.test"
    assert response.json()["phone"] == "+41 79 123 45 67"
    assert "management_token_hash" not in response.text
    assert "internal_note" not in response.text


def test_invalid_management_token_returns_generic_not_found(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = SimpleNamespace(id=uuid4())

    class FakeService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def get_managed(self, _token: str) -> Signup:
            raise PublicSignupNotFoundError

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PublicSignupService", FakeService)
    try:
        response = client.get("/api/public/example/signups/manage/unknown")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404
    assert response.json() == {"detail": "invalid link"}


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
    dispatched: list[object] = []
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(
        public,
        "dispatch_signup_confirmation_email",
        lambda *_args, **_kwargs: dispatched.append(object()),
    )
    try:
        response = client.post(
            f"/api/public/example/shifts/{uuid4()}/signups", json=payload(**change)
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == expected
    assert dispatched == []
