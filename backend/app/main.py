"""FastAPI application for the SaaS platform."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.internal import router as internal_router
from app.api.invitations import router as invitations_router
from app.api.planning import router as planning_router
from app.api.public import router as public_router
from app.core.config import AppEnv, get_settings
from app.core.logging import configure_logging
from app.middleware.organization_context import OrganizationContextMiddleware


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/api/docs" if settings.app_env.value != "production" else None,
    )

    application.add_middleware(OrganizationContextMiddleware)

    cors_origins = settings.cors_origins()
    if cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["*"],
        )

    application.include_router(health_router)
    application.include_router(public_router)
    application.include_router(auth_router)
    application.include_router(invitations_router)
    application.include_router(admin_router)
    application.include_router(planning_router)
    if settings.app_env != AppEnv.PRODUCTION:
        application.include_router(internal_router)

    return application


settings = get_settings()
configure_logging(settings)
logger = logging.getLogger(__name__)
app = create_app()
logger.info("Application started (environment: %s)", settings.app_env.value)
