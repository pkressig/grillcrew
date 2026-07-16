"""Zentrale Anwendungskonfiguration.

Alle Werte kommen aus Umgebungsvariablen (siehe .env.example).
Geheimnisse werden niemals im Code hinterlegt.
"""

from enum import StrEnum
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppEnv(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class LogFormat(StrEnum):
    TEXT = "text"
    JSON = "json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Volunteer Platform API"
    app_env: AppEnv = AppEnv.DEVELOPMENT
    log_level: str = "INFO"
    log_format: LogFormat = LogFormat.TEXT

    # Fachliche Zeitzone gemäss CLAUDE.md / PRD. Persistiert wird in UTC;
    # Interpretation und Anzeige erfolgen in dieser Zeitzone.
    business_timezone: str = "Europe/Zurich"

    database_url: str = "postgresql+psycopg://grillcrew:grillcrew_dev_only@localhost:5432/grillcrew"
    cors_allowed_origins: str = ""

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Render-style postgres URLs need an explicit SQLAlchemy driver."""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    def cors_origins(self) -> list[str]:
        """Return comma-separated CORS origins from the environment."""
        return [
            origin.strip()
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
