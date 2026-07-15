"""Zentrale Anwendungskonfiguration.

Alle Werte kommen aus Umgebungsvariablen (siehe .env.example).
Geheimnisse werden niemals im Code hinterlegt.
"""

from enum import StrEnum
from functools import lru_cache

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

    app_name: str = "GrillCrew FCTC API"
    app_env: AppEnv = AppEnv.DEVELOPMENT
    log_level: str = "INFO"
    log_format: LogFormat = LogFormat.TEXT

    # Fachliche Zeitzone gemäss CLAUDE.md / PRD. Persistiert wird in UTC;
    # Interpretation und Anzeige erfolgen in dieser Zeitzone.
    business_timezone: str = "Europe/Zurich"

    database_url: str = "postgresql+psycopg://grillcrew:grillcrew_dev_only@localhost:5432/grillcrew"


@lru_cache
def get_settings() -> Settings:
    return Settings()
