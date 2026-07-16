"""Tests for F002 organization permission guard dependencies and smoke endpoints."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from app.api import dependencies
from app.api.dependencies import (
    CurrentOrganization,
    CurrentUser,
    require_authenticated_user,
    require_organization_context,
    validate_csrf,
)
from app.core.config import Settings
from app.core.security.jwt import JWT_ALGORITHM, create_access_token
from app.db.session import get_db
from app.main import app
from app.models.identity import StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization
from app.services.auth import ACCESS_TOKEN_COOKIE_NAME

SECRET = "test-permission-guard-secret-value-123456"


@pytest.mark.parametrize("status", [UserStatus.DISABLED, UserStatus.INVITED])
def test_authenticated_guard_rejects_non_active_user(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    status: UserStatus,
) -> None:
    user = _user(status=status)
    token = create_access_token(subject=str(user.id), secret=SECRET, ttl=timedelta(minutes=15))

    app.dependency_overrides[get_db] = lambda: _ScalarDb(user)
    monkeypatch.setattr(dependencies, "get_settings", lambda: Settings(jwt_secret_key=SECRET))
    try:
        response = client.get(
            "/api/internal/test-support/authenticated",
            cookies={ACCESS_TOKEN_COOKIE_NAME: token},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_authenticated_guard_rejects_unauthenticated_access(client: TestClient) -> None:
    response = client.get("/api/internal/test-support/authenticated")

    assert response.status_code == 401


def test_staff_membership_guard_rejects_missing_membership(client: TestClient) -> None:
    user = _user()
    organization = _organization()

    _override_guard_context(user=user, organization=organization, membership=None)
    try:
        response = client.get(f"/api/internal/test-support/{organization.slug}/staff")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_staff_membership_guard_rejects_inactive_membership(client: TestClient) -> None:
    user = _user()
    organization = _organization()
    membership = _membership(user=user, organization=organization, active=False)

    _override_guard_context(user=user, organization=organization, membership=membership)
    try:
        response = client.get(f"/api/internal/test-support/{organization.slug}/staff")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_staff_membership_guard_rejects_wrong_organization(client: TestClient) -> None:
    user = _user()
    organization_a = _organization(slug="organization-a")
    organization_b = _organization(slug="organization-b")
    membership = _membership(user=user, organization=organization_a, role=StaffRole.ADMIN)

    _override_guard_context(user=user, organization=organization_b, membership=membership)
    try:
        response = client.get(f"/api/internal/test-support/{organization_b.slug}/staff")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


@pytest.mark.parametrize(
    ("method", "path_suffix", "expected_by_role"),
    [
        (
            "GET",
            "admin",
            {
                StaffRole.ADMIN: 200,
                StaffRole.KOORDINATION: 403,
                StaffRole.KIOSK: 403,
                StaffRole.VORSTAND_LESEN: 403,
            },
        ),
        (
            "GET",
            "coordination",
            {
                StaffRole.ADMIN: 200,
                StaffRole.KOORDINATION: 200,
                StaffRole.KIOSK: 403,
                StaffRole.VORSTAND_LESEN: 403,
            },
        ),
        (
            "GET",
            "kiosk",
            {
                StaffRole.ADMIN: 200,
                StaffRole.KOORDINATION: 200,
                StaffRole.KIOSK: 200,
                StaffRole.VORSTAND_LESEN: 403,
            },
        ),
        (
            "GET",
            "reports",
            {
                StaffRole.ADMIN: 200,
                StaffRole.KOORDINATION: 200,
                StaffRole.KIOSK: 403,
                StaffRole.VORSTAND_LESEN: 200,
            },
        ),
        (
            "POST",
            "reports",
            {
                StaffRole.ADMIN: 200,
                StaffRole.KOORDINATION: 200,
                StaffRole.KIOSK: 403,
                StaffRole.VORSTAND_LESEN: 403,
            },
        ),
    ],
)
@pytest.mark.parametrize(
    "role",
    [StaffRole.ADMIN, StaffRole.KOORDINATION, StaffRole.KIOSK, StaffRole.VORSTAND_LESEN],
)
def test_staff_role_guard_matches_permission_matrix(
    client: TestClient,
    method: str,
    path_suffix: str,
    expected_by_role: dict[StaffRole, int],
    role: StaffRole,
) -> None:
    user = _user()
    organization = _organization()
    membership = _membership(user=user, organization=organization, role=role)

    _override_guard_context(user=user, organization=organization, membership=membership)
    app.dependency_overrides[validate_csrf] = lambda: None
    try:
        response = client.request(
            method,
            f"/api/internal/test-support/{organization.slug}/{path_suffix}",
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == expected_by_role[role]


def test_vorstand_lesen_is_read_only_for_report_smoke_endpoint(client: TestClient) -> None:
    user = _user()
    organization = _organization()
    membership = _membership(user=user, organization=organization, role=StaffRole.VORSTAND_LESEN)

    _override_guard_context(user=user, organization=organization, membership=membership)
    app.dependency_overrides[validate_csrf] = lambda: None
    try:
        read_response = client.get(f"/api/internal/test-support/{organization.slug}/reports")
        write_response = client.post(f"/api/internal/test-support/{organization.slug}/reports")
    finally:
        app.dependency_overrides.clear()

    assert read_response.status_code == 200
    assert write_response.status_code == 403


def test_jwt_role_and_organization_claims_are_not_trusted(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user()
    organization = _organization()
    token = _access_token_with_extra_claims(
        subject=str(user.id),
        role=StaffRole.ADMIN.value,
        organization_id=str(organization.id),
    )

    app.dependency_overrides[get_db] = lambda: _ScalarDb(user, None)
    app.dependency_overrides[require_organization_context] = lambda: CurrentOrganization(
        organization=organization
    )
    monkeypatch.setattr(dependencies, "get_settings", lambda: Settings(jwt_secret_key=SECRET))
    try:
        response = client.get(
            f"/api/internal/test-support/{organization.slug}/staff",
            cookies={ACCESS_TOKEN_COOKIE_NAME: token},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_tenant_isolation_rejects_admin_membership_from_other_organization(
    client: TestClient,
) -> None:
    user = _user()
    organization_a = _organization(slug="organization-a")
    organization_b = _organization(slug="organization-b")
    membership = _membership(user=user, organization=organization_a, role=StaffRole.ADMIN)

    _override_guard_context(user=user, organization=organization_b, membership=membership)
    try:
        response = client.get(f"/api/internal/test-support/{organization_b.slug}/admin")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


class _ScalarDb:
    def __init__(self, *values: object | None) -> None:
        self._values = list(values)

    def scalar(self, _statement: object) -> object | None:
        if not self._values:
            raise AssertionError("unexpected scalar query")
        return self._values.pop(0)


def _override_guard_context(
    *,
    user: User,
    organization: Organization,
    membership: StaffMembership | None,
) -> None:
    app.dependency_overrides[require_authenticated_user] = lambda: CurrentUser(user=user)
    app.dependency_overrides[require_organization_context] = lambda: CurrentOrganization(
        organization=organization
    )
    app.dependency_overrides[get_db] = lambda: _ScalarDb(membership)


def _user(status: UserStatus = UserStatus.ACTIVE) -> User:
    return cast(
        User,
        SimpleNamespace(
            id=uuid4(),
            email_normalized="user@example.test",
            display_name="Example User",
            status=status,
            staff_memberships=[],
        ),
    )


def _organization(slug: str = "example-org") -> Organization:
    return cast(
        Organization,
        SimpleNamespace(
            id=uuid4(),
            slug=slug,
            name="Example Org",
        ),
    )


def _membership(
    *,
    user: User,
    organization: Organization,
    role: StaffRole = StaffRole.ADMIN,
    active: bool = True,
) -> StaffMembership:
    return cast(
        StaffMembership,
        SimpleNamespace(
            id=uuid4(),
            organization_id=organization.id,
            user_id=user.id,
            role=role,
            active=active,
        ),
    )


def _access_token_with_extra_claims(
    *,
    subject: str,
    role: str,
    organization_id: str,
) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "jti": str(uuid4()),
        "role": role,
        "organization_id": organization_id,
    }
    return pyjwt.encode(payload, SECRET, algorithm=JWT_ALGORITHM)
