"""Zentrale Anwendungskonfiguration.

Alle Werte kommen aus Umgebungsvariablen (siehe .env.example).
Geheimnisse werden niemals im Code hinterlegt.
"""

from enum import StrEnum
from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.security.rate_limit import AuthRateLimits


class AppEnv(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class LogFormat(StrEnum):
    TEXT = "text"
    JSON = "json"


# NOTE on the ignore below: pydantic.BaseModel.__init__ (inherited via
# BaseSettings) is itself typed as `**data: Any`, so mypy's disallow_any_explicit
# flags the subclass; this is inherent to pydantic and not fixable from our code.
# Development-only placeholder; never valid in AppEnv.PRODUCTION (see the
# model validator below). At least 32 characters so it also exercises the
# same length constraint a real secret must satisfy.
_DEV_JWT_SECRET_KEY = "dev-only-insecure-jwt-secret-change-me-in-every-real-environment"  # noqa: S105


class Settings(BaseSettings):  # type: ignore[explicit-any]
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_nested_delimiter="__",
    )

    app_name: str = "Volunteer Platform API"
    app_env: AppEnv = AppEnv.DEVELOPMENT
    log_level: str = "INFO"
    log_format: LogFormat = LogFormat.TEXT

    # Fachliche Zeitzone gemäss CLAUDE.md / PRD. Persistiert wird in UTC;
    # Interpretation und Anzeige erfolgen in dieser Zeitzone.
    business_timezone: str = "Europe/Zurich"

    database_url: str = "postgresql+psycopg://grillcrew:grillcrew_dev_only@localhost:5432/grillcrew"
    cors_allowed_origins: str = ""

    # --- Authentication (F002, D-037 - D-040) ---
    jwt_secret_key: str = Field(default=_DEV_JWT_SECRET_KEY, min_length=32)
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    password_reset_token_ttl_hours: int = 1
    invitation_token_ttl_days: int = 7

    auth_cookie_secure: bool = True
    auth_cookie_domain: str | None = None

    auth_rate_limits: AuthRateLimits = Field(default_factory=AuthRateLimits)

    email_from_address: str = "no-reply@example.invalid"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Render-style postgres URLs need an explicit SQLAlchemy driver."""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @model_validator(mode="after")
    def _validate_production_security(self) -> "Settings":
        """Fail closed: an insecure auth configuration must never reach production."""
        if self.app_env == AppEnv.PRODUCTION:
            if self.jwt_secret_key == _DEV_JWT_SECRET_KEY:
                raise ValueError("JWT_SECRET_KEY must be set to a unique value in production")
            if not self.auth_cookie_secure:
                raise ValueError("AUTH_COOKIE_SECURE must stay true in production")
        return self

    def cors_origins(self) -> list[str]:
        """Return comma-separated CORS origins from the environment."""
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
