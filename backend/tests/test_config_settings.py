"""Tests for auth-related Settings validation (D-037 - D-040, plan §22 Step 1)."""

import pytest
from pydantic import ValidationError

from app.core.config import AppEnv, Settings
from app.core.security.rate_limit import AuthRateLimits


def test_default_settings_are_valid_outside_production() -> None:
    settings = Settings(app_env=AppEnv.DEVELOPMENT)

    assert len(settings.jwt_secret_key) >= 32
    assert settings.auth_cookie_secure is True


def test_production_rejects_default_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(app_env=AppEnv.PRODUCTION)


def test_production_accepts_unique_jwt_secret() -> None:
    settings = Settings(
        app_env=AppEnv.PRODUCTION,
        jwt_secret_key="a-unique-production-secret-key-1234567890",
    )

    assert settings.app_env == AppEnv.PRODUCTION


def test_production_rejects_insecure_cookie_flag() -> None:
    with pytest.raises(ValidationError, match="AUTH_COOKIE_SECURE"):
        Settings(
            app_env=AppEnv.PRODUCTION,
            jwt_secret_key="a-unique-production-secret-key-1234567890",
            auth_cookie_secure=False,
        )


def test_jwt_secret_key_below_minimum_length_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(jwt_secret_key="too-short")


def test_auth_rate_limits_default_present() -> None:
    settings = Settings()

    assert settings.auth_rate_limits.login_per_account.max_attempts >= 1


def test_auth_rate_limits_overridable_via_nested_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH_RATE_LIMITS__LOGIN_PER_ACCOUNT__MAX_ATTEMPTS", "3")
    monkeypatch.setenv("AUTH_RATE_LIMITS__LOGIN_PER_ACCOUNT__WINDOW_SECONDS", "60")

    settings = Settings()

    assert settings.auth_rate_limits.login_per_account.max_attempts == 3
    assert settings.auth_rate_limits.login_per_account.window_seconds == 60
    # An untouched action keeps its default entirely.
    assert (
        settings.auth_rate_limits.refresh_per_account.max_attempts
        == AuthRateLimits().refresh_per_account.max_attempts
    )


def test_email_defaults_use_in_memory_sender_path() -> None:
    settings = Settings(app_env=AppEnv.DEVELOPMENT)

    assert settings.smtp_host is None
    assert settings.email_from_address
