"""API tests for invitation authorization and safe public acceptance."""

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import admin, auth
from app.api.dependencies import CurrentStaffMembership, require_staff_membership, validate_csrf
from app.core.config import Settings
from app.core.security.password import PasswordPolicyError
from app.core.security.rate_limit import AuthRateLimits, InMemoryRateLimiter, RateLimitRule
from app.db.session import get_db
from app.main import app
from app.models.identity import StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization
from app.services.invitation import InvalidInvitationTokenError


@pytest.fixture(autouse=True)
def _settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(cors_allowed_origins="http://testserver")
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(admin, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "_rate_limiter", InMemoryRateLimiter())


def test_admin_can_create_invitation_without_token_in_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: list[tuple[str, StaffRole]] = []

    class FakeService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def create(self, *, email: str, role: StaffRole, **_kwargs: object) -> object:
            captured.append((email, role))
            return SimpleNamespace(
                recipient="person@example.test",
                organization_name="Example Org",
                raw_token="raw-secret-token",
            )

    monkeypatch.setattr(admin, "InvitationService", FakeService)
    _override_admin_context(StaffRole.ADMIN)
    try:
        response = client.post(
            "/api/admin/example/invitations",
            headers={"Origin": "http://testserver"},
            json={"email": "Person@example.test", "role": "KIOSK"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json() == {"ok": True}
    assert "raw-secret-token" not in response.text
    assert captured == [("Person@example.test", StaffRole.KIOSK)]


@pytest.mark.parametrize(
    ("role", "slug", "expected_status"),
    [
        (StaffRole.KIOSK, "example", 403),
        (StaffRole.KOORDINATION, "example", 403),
        (StaffRole.ADMIN, "other", 403),
    ],
)
def test_non_admin_or_wrong_organization_cannot_create_invitation(
    client: TestClient,
    role: StaffRole,
    slug: str,
    expected_status: int,
) -> None:
    _override_admin_context(role)
    try:
        response = client.post(
            f"/api/admin/{slug}/invitations",
            headers={"Origin": "http://testserver"},
            json={"email": "person@example.test", "role": "KIOSK"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == expected_status


def test_unauthenticated_user_cannot_create_invitation(client: TestClient) -> None:
    organization = _organization()
    app.dependency_overrides[get_db] = _fake_db
    from app.api.dependencies import require_organization_context

    app.dependency_overrides[require_organization_context] = lambda: SimpleNamespace(
        organization=organization
    )
    try:
        response = client.post(
            "/api/admin/example/invitations",
            headers={"Origin": "http://testserver"},
            json={"email": "person@example.test", "role": "KIOSK"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_accept_invitation_returns_safe_success_and_ignores_client_scope(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    accepted: list[dict[str, str]] = []

    class FakeService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def accept(self, **kwargs: str) -> None:
            accepted.append(kwargs)

    monkeypatch.setattr(auth, "InvitationService", FakeService)
    app.dependency_overrides[get_db] = _fake_db
    try:
        response = client.post(
            "/api/auth/accept-invitation",
            headers={"Origin": "http://testserver"},
            json={
                "token": "raw-token",
                "display_name": "Person",
                "password": "secure-password-123",
                "role": "ADMIN",
                "organization_slug": "attacker-choice",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert accepted == [
        {
            "raw_token": "raw-token",
            "display_name": "Person",
            "password": "secure-password-123",
        }
    ]


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [(InvalidInvitationTokenError(), 400), (PasswordPolicyError(), 422)],
)
def test_accept_invitation_maps_invalid_token_and_password_policy_safely(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_status: int,
) -> None:
    class FakeService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def accept(self, **_kwargs: str) -> None:
            raise error

    monkeypatch.setattr(auth, "InvitationService", FakeService)
    app.dependency_overrides[get_db] = _fake_db
    try:
        response = client.post(
            "/api/auth/accept-invitation",
            headers={"Origin": "http://testserver"},
            json={
                "token": "unknown-token",
                "display_name": "Person",
                "password": "secure-password-123",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == expected_status
    assert "unknown-token" not in response.text


def test_accept_invitation_rate_limit_uses_dedicated_bucket(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(
        cors_allowed_origins="http://testserver",
        auth_rate_limits=AuthRateLimits(
            invitation_accept_per_token=RateLimitRule(max_attempts=1, window_seconds=3600),
            invitation_accept_per_ip=RateLimitRule(max_attempts=10, window_seconds=3600),
        ),
    )

    class FakeService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def accept(self, **_kwargs: str) -> None:
            pass

    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "InvitationService", FakeService)
    app.dependency_overrides[get_db] = _fake_db
    payload = {
        "token": "same-token",
        "display_name": "Person",
        "password": "secure-password-123",
    }
    try:
        first = client.post(
            "/api/auth/accept-invitation",
            headers={"Origin": "http://testserver"},
            json=payload,
        )
        second = client.post(
            "/api/auth/accept-invitation",
            headers={"Origin": "http://testserver"},
            json=payload,
        )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 429


def _override_admin_context(role: StaffRole) -> None:
    user = cast(
        User,
        SimpleNamespace(id=uuid4(), status=UserStatus.ACTIVE),
    )
    organization = _organization()
    membership = cast(
        StaffMembership,
        SimpleNamespace(
            id=uuid4(),
            organization_id=organization.id,
            user_id=user.id,
            role=role,
            active=True,
        ),
    )
    app.dependency_overrides[require_staff_membership] = lambda: CurrentStaffMembership(
        organization=organization,
        user=user,
        membership=membership,
    )
    app.dependency_overrides[validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = _fake_db


def _organization() -> Organization:
    return cast(
        Organization,
        SimpleNamespace(id=uuid4(), slug="example", name="Example Org"),
    )


def _fake_db() -> object:
    return SimpleNamespace(execute=lambda _statement: [])
