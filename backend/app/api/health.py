"""Health-Endpoint – einziger API-Endpoint in Sprint 1 (D-022)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["health"])


class HealthResponse(BaseModel):
    status: str
    database: str


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:  # noqa: B008
    """Meldet Anwendungs- und Datenbankstatus. Keine stillen Fehler (CLAUDE.md)."""
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        logger.exception("Datenbankprüfung im Health-Endpoint fehlgeschlagen")
        database = "unavailable"
    return HealthResponse(status="ok", database=database)


@router.get("/ready", response_model=HealthResponse)
def ready(db: Session = Depends(get_db)) -> HealthResponse:  # noqa: B008
    """Readiness-Check für Produktionsplattformen: App plus Datenbank."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("Datenbankprüfung im Readiness-Endpoint fehlgeschlagen")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database unavailable",
        ) from exc
    return HealthResponse(status="ok", database="ok")
