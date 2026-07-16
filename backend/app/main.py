"""FastAPI application for the SaaS platform."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.internal import router as internal_router
from app.api.public import router as public_router
from app.core.config import AppEnv, get_settings
from app.core.logging import configure_logging
from app.middleware.organization_context import OrganizationContextMiddleware

settings = get_settings()
configure_logging(settings)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/api/docs" if settings.app_env.value != "production" else None,
)

app.add_middleware(OrganizationContextMiddleware)

cors_origins = settings.cors_origins()
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

app.include_router(health_router)
app.include_router(public_router)
app.include_router(auth_router)
if settings.app_env != AppEnv.PRODUCTION:
    app.include_router(internal_router)

logger.info("Application started (environment: %s)", settings.app_env.value)
