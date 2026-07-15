"""Organization – gemäss docs/DATA_MODEL.md.

Version 1 kennt genau eine Organisation (D-015), technisch trotzdem
eine eigene Entität, damit das Modell erweiterbar bleibt.
Sprint 1 legt ausschliesslich diese Fundament-Tabelle an; alle weiteren
Entitäten folgen in den fachlichen Sprints (D-032).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Organization(Base):
    __tablename__ = "organization"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(50))
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="Europe/Zurich"
    )
    locale: Mapped[str] = mapped_column(String(16), nullable=False, server_default="de-CH")
    logo_url: Mapped[str | None] = mapped_column(String(500))
    primary_color: Mapped[str | None] = mapped_column(String(16))
    accent_color: Mapped[str | None] = mapped_column(String(16))
    settings: Mapped[dict[str, object]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
