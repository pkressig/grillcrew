"""Alle ORM-Modelle importieren, damit Alembic sie in Base.metadata findet."""

from app.models.organization import Organization

__all__ = ["Organization"]
