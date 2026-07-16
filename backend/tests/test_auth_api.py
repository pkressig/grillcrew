"""Tests for authentication API endpoint behavior."""

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import auth
from app.api.dependencies import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.security.csrf import CSRF_HEADER_NAME, derive_csrf_secret, generate_csrf_token
from app.core.security.rate_limit import AuthRateLimits, InMemoryRateLimiter, RateLimitRule
from app.db.session import get_db
from app.main import app
from app.models.identity import StaffRole, User, UserStatus
from app.services.auth import (
    ACCESS_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    IssuedSession,
)


@pytest.fixture(autouse=True)
def _auth_test_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(cors_allowed_origins="http://testserver")
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "_rate_limiter", InMemoryRateLimiter())


def test_login_sets_http_only_tokens_and_readable_csrf_cookie(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeLoginService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def login(self, *, email: str, password: str) -> tuple[IssuedSession, object]:
            assert email == "USER@example.test"
            assert password == "correct horse"
            return _session(), _body()

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "LoginService", FakeLoginService)
    try:
        response = client.post(
            "/api/auth/login",
            headers=_origin_headers(),
            json={"email": "USER@example.test", "password": "correct horse"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["user"]["email_normalized"] == "user@example.test"
    set_cookie = response.headers.get_list("set-cookie")
    assert _cookie_header(set_cookie, ACCESS_TOKEN_COOKIE_NAME)
    assert "HttpOnly" in _cookie_header(set_cookie, ACCESS_TOKEN_COOKIE_NAME)
    assert "Path=/" in _cookie_header(set_cookie, ACCESS_TOKEN_COOKIE_NAME)
    assert "HttpOnly" in _cookie_header(set_cookie, REFRESH_TOKEN_COOKIE_NAME)
    assert "Path=/api/auth" in _cookie_header(set_cookie, REFRESH_TOKEN_COOKIE_NAME)
    assert "HttpOnly" not in _cookie_header(set_cookie, "gc_csrf")


def test_login_rejects_invalid_credentials(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeLoginService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def login(self, *, email: str, password: str) -> tuple[IssuedSession, object]:
            raise InvalidCredentialsError

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "LoginService", FakeLoginService)
    try:
        response = client.post(
            "/api/auth/login",
            headers=_origin_headers(),
            json={"email": "nobody@example.test", "password": "wrong"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid credentials"


def test_logout_without_active_session_skips_csrf_and_clears_cookies(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No CSRF proof is required when there is no active refresh token to revoke."""
    captured_token: list[str | None] = []

    class FakeLogoutService:
        def __init__(self, _db: object) -> None:
            pass

        def logout(self, *, refresh_token: str | None) -> None:
            captured_token.append(refresh_token)

    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            raise InvalidRefreshTokenError

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "LogoutService", FakeLogoutService)
    monkeypatch.setattr(auth, "RefreshService", FakeRefreshService)
    try:
        response = client.post(
            "/api/auth/logout",
            headers=_origin_headers(),
            cookies={REFRESH_TOKEN_COOKIE_NAME: "refresh-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert captured_token == ["refresh-token"]
    set_cookie = response.headers.get_list("set-cookie")
    assert "Max-Age=0" in _cookie_header(set_cookie, ACCESS_TOKEN_COOKIE_NAME)
    assert "Max-Age=0" in _cookie_header(set_cookie, REFRESH_TOKEN_COOKIE_NAME)
    assert "Max-Age=0" in _cookie_header(set_cookie, "gc_csrf")


def test_logout_with_active_session_rejects_missing_csrf(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A cross-site logout CSRF must not be able to end an active session."""
    family_id = uuid4()

    class FakeLogoutService:
        def __init__(self, _db: object) -> None:
            pass

        def logout(self, *, refresh_token: str | None) -> None:
            raise AssertionError("logout must not run without valid CSRF proof")

    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            return SimpleNamespace(token=SimpleNamespace(family_id=family_id))

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "LogoutService", FakeLogoutService)
    monkeypatch.setattr(auth, "RefreshService", FakeRefreshService)
    try:
        response = client.post(
            "/api/auth/logout",
            headers=_origin_headers(),
            cookies={REFRESH_TOKEN_COOKIE_NAME: "refresh-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_logout_with_active_session_accepts_matching_csrf(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    family_id = uuid4()
    captured_token: list[str | None] = []

    class FakeLogoutService:
        def __init__(self, _db: object) -> None:
            pass

        def logout(self, *, refresh_token: str | None) -> None:
            captured_token.append(refresh_token)

    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            return SimpleNamespace(token=SimpleNamespace(family_id=family_id))

    csrf_token = generate_csrf_token(
        binding_key=str(family_id),
        secret=derive_csrf_secret(get_settings().jwt_secret_key),
    )
    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "LogoutService", FakeLogoutService)
    monkeypatch.setattr(auth, "RefreshService", FakeRefreshService)
    try:
        response = client.post(
            "/api/auth/logout",
            headers={**_origin_headers(), CSRF_HEADER_NAME: csrf_token},
            cookies={REFRESH_TOKEN_COOKIE_NAME: "refresh-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_token == ["refresh-token"]


def test_refresh_rotates_cookies(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    family_id = uuid4()

    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            assert refresh_token == "old-refresh"
            return SimpleNamespace(
                token=SimpleNamespace(family_id=family_id),
                user=SimpleNamespace(id=uuid4()),
            )

        def refresh_validated(self, _validated: object) -> tuple[IssuedSession, object]:
            return _session(access_token="new-access", refresh_token="new-refresh"), _body()

    csrf_token = generate_csrf_token(
        binding_key=str(family_id),
        secret=derive_csrf_secret(get_settings().jwt_secret_key),
    )
    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "RefreshService", FakeRefreshService)
    try:
        response = client.post(
            "/api/auth/refresh",
            headers={**_origin_headers(), CSRF_HEADER_NAME: csrf_token},
            cookies={REFRESH_TOKEN_COOKIE_NAME: "old-refresh"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    set_cookie = response.headers.get_list("set-cookie")
    assert "new-access" in _cookie_header(set_cookie, ACCESS_TOKEN_COOKIE_NAME)
    assert "new-refresh" in _cookie_header(set_cookie, REFRESH_TOKEN_COOKIE_NAME)


def test_login_rejects_missing_origin(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeLoginService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def login(self, *, email: str, password: str) -> tuple[IssuedSession, object]:
            raise AssertionError("login must not run without origin validation")

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "LoginService", FakeLoginService)
    try:
        response = client.post(
            "/api/auth/login",
            json={"email": "USER@example.test", "password": "correct horse"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_login_rate_limit_blocks_after_configured_budget(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(
        cors_allowed_origins="http://testserver",
        auth_rate_limits=AuthRateLimits(
            login_per_account=RateLimitRule(max_attempts=1, window_seconds=900),
            login_per_ip=RateLimitRule(max_attempts=10, window_seconds=900),
        ),
    )

    class FakeLoginService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def login(self, *, email: str, password: str) -> tuple[IssuedSession, object]:
            return _session(), _body()

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "LoginService", FakeLoginService)
    try:
        first = client.post(
            "/api/auth/login",
            headers=_origin_headers(),
            json={"email": "USER@example.test", "password": "correct horse"},
        )
        second = client.post(
            "/api/auth/login",
            headers=_origin_headers(),
            json={"email": "user@example.test", "password": "correct horse"},
        )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 429


def test_me_returns_current_user_session_shape(client: TestClient) -> None:
    user = _user_with_membership()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(user=user)
    try:
        response = client.get("/api/auth/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "id": str(user.id),
            "email_normalized": "user@example.test",
            "display_name": "Example User",
            "status": "ACTIVE",
        },
        "memberships": [
            {
                "organization_id": str(user.staff_memberships[0].organization_id),
                "organization_slug": "example-org",
                "organization_name": "Example Org",
                "role": "ADMIN",
            }
        ],
    }


def _session(
    access_token: str = "access-token",
    refresh_token: str = "refresh-token",
) -> IssuedSession:
    return IssuedSession(
        access_token=access_token,
        refresh_token=refresh_token,
        csrf_token="csrf-token",
        access_token_max_age=900,
        refresh_token_max_age=2_592_000,
    )


def _body() -> dict[str, object]:
    user_id = uuid4()
    organization_id = uuid4()
    return {
        "user": {
            "id": str(user_id),
            "email_normalized": "user@example.test",
            "display_name": "Example User",
            "status": "ACTIVE",
        },
        "memberships": [
            {
                "organization_id": str(organization_id),
                "organization_slug": "example-org",
                "organization_name": "Example Org",
                "role": "ADMIN",
            }
        ],
    }


def _user_with_membership() -> User:
    user_id = uuid4()
    organization_id = uuid4()
    return cast(
        User,
        SimpleNamespace(
            id=user_id,
            email_normalized="user@example.test",
            display_name="Example User",
            status=UserStatus.ACTIVE,
            staff_memberships=[
                SimpleNamespace(
                    organization_id=organization_id,
                    role=StaffRole.ADMIN,
                    active=True,
                    organization=SimpleNamespace(slug="example-org", name="Example Org"),
                )
            ],
        ),
    )


def _cookie_header(headers: list[str], name: str) -> str:
    prefix = f"{name}="
    for header in headers:
        if header.startswith(prefix):
            return header
    raise AssertionError(f"missing cookie {name}")


def _origin_headers() -> dict[str, str]:
    return {"Origin": "http://testserver"}


def _fake_db() -> object:
    return SimpleNamespace(execute=lambda _statement: [])
