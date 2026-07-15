"""Health-Endpoint – einziger API-Endpoint in Sprint 1 (D-022)."""

import logging

from fastapi import APIRouter, Depends
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
