"""Middleware that stores organization lookup hints on the request state."""

from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.organization_context import build_organization_lookup


class OrganizationContextMiddleware(BaseHTTPMiddleware):
    """Attach parsed organization lookup hints for downstream dependencies."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request.state.organization_lookup = build_organization_lookup(request)
        return await call_next(request)
