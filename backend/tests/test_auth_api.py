"""Tests for authentication API endpoint behavior."""

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import auth
from app.api.dependencies import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.security.csrf import (
    CSRF_HEADER_NAME,
    derive_csrf_secret,
    generate_csrf_token,
    verify_csrf_token,
)
from app.core.security.password import PasswordPolicyError
from app.core.security.rate_limit import AuthRateLimits, InMemoryRateLimiter, RateLimitRule
from app.db.session import get_db
from app.main import app
from app.models.identity import StaffRole, User, UserStatus
from app.services.auth import (
    ACCESS_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
    InvalidCredentialsError,
    InvalidPasswordResetTokenError,
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
    assert "Path=/api;" in _cookie_header(set_cookie, REFRESH_TOKEN_COOKIE_NAME)
    assert "HttpOnly" not in _cookie_header(set_cookie, "gc_csrf")
    refresh_cookie_headers = _cookie_headers(set_cookie, REFRESH_TOKEN_COOKIE_NAME)
    assert len(refresh_cookie_headers) == 2
    legacy_header = next(h for h in refresh_cookie_headers if "Path=/api/auth;" in h)
    assert "Max-Age=0" in legacy_header


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


def test_csrf_token_requires_valid_refresh_session_and_returns_bound_proof(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    family_id = uuid4()

    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            assert refresh_token == "valid-refresh"
            return SimpleNamespace(token=SimpleNamespace(family_id=family_id))

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "RefreshService", FakeRefreshService)
    try:
        response = client.get(
            "/api/auth/csrf",
            headers=_origin_headers(),
            cookies={REFRESH_TOKEN_COOKIE_NAME: "valid-refresh"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert set(response.json()) == {"csrf_token"}
    assert "access" not in response.text
    assert "refresh" not in response.text
    assert verify_csrf_token(
        response.json()["csrf_token"],
        binding_key=str(family_id),
        secret=derive_csrf_secret(get_settings().jwt_secret_key),
    )


def test_csrf_token_rejects_missing_or_invalid_refresh_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            raise InvalidRefreshTokenError

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "RefreshService", FakeRefreshService)
    try:
        response = client.get("/api/auth/csrf", headers=_origin_headers())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


@pytest.mark.parametrize("headers", [{}, {"Origin": "https://evil.example"}])
def test_csrf_token_rejects_missing_or_unapproved_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, headers: dict[str, str]
) -> None:
    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            raise AssertionError("refresh validation must follow origin validation")

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "RefreshService", FakeRefreshService)
    try:
        response = client.get("/api/auth/csrf", headers=headers)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


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
    refresh_cookie_headers = _cookie_headers(set_cookie, REFRESH_TOKEN_COOKIE_NAME)
    assert len(refresh_cookie_headers) == 2
    assert all("Max-Age=0" in header for header in refresh_cookie_headers)
    assert any("Path=/api/auth;" in header for header in refresh_cookie_headers)
    assert any("Path=/api;" in header for header in refresh_cookie_headers)


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


def test_login_allows_allowed_cross_origin_api_host(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(cors_allowed_origins="https://grillcrew-six.vercel.app")

    class FakeLoginService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def login(self, *, email: str, password: str) -> tuple[IssuedSession, object]:
            return _session(), _body()

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "LoginService", FakeLoginService)
    try:
        response = client.post(
            "/api/auth/login",
            headers={
                "Origin": "https://grillcrew-six.vercel.app",
                "Host": "grillcrew-api.onrender.com",
            },
            json={"email": "USER@example.test", "password": "correct horse"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200


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


def test_forgot_password_returns_generic_success_and_sends_for_eligible_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, str]] = []

    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def request_reset(self, *, email: str) -> object:
            assert email == "user@example.test"
            return SimpleNamespace(recipient=email, raw_token="raw-reset-token")

    def fake_dispatch(_settings: object, *, recipient: str, raw_token: str) -> None:
        sent.append((recipient, raw_token))

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    monkeypatch.setattr(auth, "dispatch_password_reset_email", fake_dispatch)
    try:
        response = client.post(
            "/api/auth/forgot-password",
            headers=_origin_headers(),
            json={"email": " USER@example.test "},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {"ok": True}
    assert sent == [("user@example.test", "raw-reset-token")]


def test_forgot_password_returns_generic_success_for_missing_or_ineligible_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def request_reset(self, *, email: str) -> None:
            assert email == "missing@example.test"
            return None

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    try:
        response = client.post(
            "/api/auth/forgot-password",
            headers=_origin_headers(),
            json={"email": "missing@example.test"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {"ok": True}


def test_forgot_password_email_failure_still_returns_generic_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    raw_token = "raw-token-that-must-not-be-logged"

    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def request_reset(self, *, email: str) -> object:
            return SimpleNamespace(recipient=email, raw_token=raw_token)

    class FailingSender:
        def send(self, _message: object) -> None:
            from app.services.email.base import EmailSendError

            raise EmailSendError("transport unavailable")

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    monkeypatch.setattr("app.services.auth.build_email_sender", lambda _settings: FailingSender())
    try:
        with caplog.at_level("DEBUG"):
            response = client.post(
                "/api/auth/forgot-password",
                headers=_origin_headers(),
                json={"email": "user@example.test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert raw_token not in caplog.text


def test_forgot_password_returns_generic_success_even_when_email_sender_unavailable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A missing SMTP config (e.g. an operator forgot to set SMTP_HOST in production)

    must not turn into a different response for existing vs. missing accounts.
    Regression test: `build_email_sender` used to be called eagerly inside the
    request handler, only when an eligible user existed, so its `ValueError`
    surfaced as an uncaught 500 for real accounts while non-existent accounts
    still got 202 - a user-enumeration oracle. Construction now happens inside
    the deferred background task instead.
    """
    raw_token = "raw-token-that-must-not-be-logged"

    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def request_reset(self, *, email: str) -> object:
            return SimpleNamespace(recipient=email, raw_token=raw_token)

    def _raise_sender_unavailable(_settings: object) -> None:
        raise ValueError("SMTP_HOST must be configured outside development/test")

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    monkeypatch.setattr("app.services.auth.build_email_sender", _raise_sender_unavailable)
    try:
        with caplog.at_level("DEBUG"):
            response = client.post(
                "/api/auth/forgot-password",
                headers=_origin_headers(),
                json={"email": "user@example.test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {"ok": True}
    assert raw_token not in caplog.text


def test_forgot_password_rejects_missing_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            raise AssertionError("forgot-password must not run without origin validation")

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    try:
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": "user@example.test"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_forgot_password_rate_limit_blocks_after_configured_budget(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(
        cors_allowed_origins="http://testserver",
        auth_rate_limits=AuthRateLimits(
            password_reset_request_per_account=RateLimitRule(max_attempts=1, window_seconds=900),
            password_reset_request_per_ip=RateLimitRule(max_attempts=10, window_seconds=900),
        ),
    )

    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def request_reset(self, *, email: str) -> None:
            return None

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    try:
        first = client.post(
            "/api/auth/forgot-password",
            headers=_origin_headers(),
            json={"email": "USER@example.test"},
        )
        second = client.post(
            "/api/auth/forgot-password",
            headers=_origin_headers(),
            json={"email": "user@example.test"},
        )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 202
    assert second.status_code == 429


def test_reset_password_returns_success_for_valid_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, str]] = []

    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def reset_password(self, *, raw_token: str, new_password: str) -> None:
            calls.append((raw_token, new_password))

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    try:
        response = client.post(
            "/api/auth/reset-password",
            headers=_origin_headers(),
            json={"token": "raw-token", "new_password": "new-password-123"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert calls == [("raw-token", "new-password-123")]


def test_reset_password_rejects_invalid_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def reset_password(self, *, raw_token: str, new_password: str) -> None:
            raise InvalidPasswordResetTokenError

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    try:
        response = client.post(
            "/api/auth/reset-password",
            headers=_origin_headers(),
            json={"token": "raw-token", "new_password": "new-password-123"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["detail"] == "invalid reset token"


def test_reset_password_enforces_password_policy(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def reset_password(self, *, raw_token: str, new_password: str) -> None:
            raise PasswordPolicyError("too short")

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    try:
        response = client.post(
            "/api/auth/reset-password",
            headers=_origin_headers(),
            json={"token": "raw-token", "new_password": "short"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["detail"] == "password policy violation"


def test_reset_password_rejects_missing_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakePasswordResetService:
        def __init__(self, _db: object, _settings: object) -> None:
            raise AssertionError("reset-password must not run without origin validation")

    app.dependency_overrides[get_db] = _fake_db
    monkeypatch.setattr(auth, "PasswordResetService", FakePasswordResetService)
    try:
        response = client.post(
            "/api/auth/reset-password",
            json={"token": "raw-token", "new_password": "new-password-123"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


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


def _cookie_headers(headers: list[str], name: str) -> list[str]:
    prefix = f"{name}="
    matches = [header for header in headers if header.startswith(prefix)]
    if not matches:
        raise AssertionError(f"missing cookie {name}")
    return matches


def _origin_headers() -> dict[str, str]:
    return {"Origin": "http://testserver"}


def _fake_db() -> object:
    return SimpleNamespace(execute=lambda _statement: [])
