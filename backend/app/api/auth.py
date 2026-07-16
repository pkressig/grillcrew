"""Authentication API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.security.csrf import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    derive_csrf_secret,
    verify_csrf_token,
)
from app.core.security.origins import (
    build_allowed_origins,
    is_host_consistent_with_origin,
    is_origin_allowed,
)
from app.core.security.rate_limit import InMemoryRateLimiter, RateLimitRule
from app.db.session import get_db
from app.models.organization import Organization
from app.schemas.auth import AuthSessionResponse, LoginRequest, LogoutResponse
from app.services.auth import (
    ACCESS_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    IssuedSession,
    LoginService,
    LogoutService,
    RefreshService,
    RefreshTokenValidation,
    build_session_response,
    normalize_email,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
_rate_limiter = InMemoryRateLimiter()


@router.post("/login", response_model=AuthSessionResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),  # noqa: B008
) -> AuthSessionResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    _ensure_rate_limit(
        key=f"login:account:{normalize_email(payload.email)}",
        rule=settings.auth_rate_limits.login_per_account,
    )
    _ensure_rate_limit(
        key=f"login:ip:{_client_key(request)}",
        rule=settings.auth_rate_limits.login_per_ip,
    )
    try:
        session, body = LoginService(db, settings).login(
            email=payload.email,
            password=payload.password,
        )
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        ) from None
    set_auth_cookies(response, session, settings)
    return body


@router.post("/logout", response_model=LogoutResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),  # noqa: B008
) -> LogoutResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    raw_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    validated: RefreshTokenValidation | None = None
    try:
        validated = RefreshService(db, settings).validate(refresh_token=raw_refresh_token)
    except InvalidRefreshTokenError:
        pass
    if validated is not None:
        _ensure_csrf(request, validated.token.family_id)
    LogoutService(db).logout(refresh_token=raw_refresh_token)
    clear_auth_cookies(response, settings)
    return LogoutResponse()


@router.post("/refresh", response_model=AuthSessionResponse)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),  # noqa: B008
) -> AuthSessionResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    _ensure_rate_limit(
        key=f"refresh:ip:{_client_key(request)}",
        rule=settings.auth_rate_limits.refresh_per_ip,
    )
    raw_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    refresh_service = RefreshService(db, settings)
    try:
        validated = refresh_service.validate(refresh_token=raw_refresh_token)
        _ensure_rate_limit(
            key=f"refresh:account:{validated.user.id}",
            rule=settings.auth_rate_limits.refresh_per_account,
        )
        _ensure_csrf(request, validated.token.family_id)
        session, body = refresh_service.refresh_validated(validated)
    except InvalidRefreshTokenError:
        clear_auth_cookies(response, settings)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid refresh token",
        ) from None
    set_auth_cookies(response, session, settings)
    return body


@router.get("/me", response_model=AuthSessionResponse)
def me(current_user: CurrentUser = Depends(get_current_user)) -> AuthSessionResponse:  # noqa: B008
    return build_session_response(current_user.user)


def set_auth_cookies(response: Response, session: IssuedSession, settings: Settings) -> None:
    response.set_cookie(
        ACCESS_TOKEN_COOKIE_NAME,
        session.access_token,
        max_age=session.access_token_max_age,
        httponly=True,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite="none",
        domain=settings.auth_cookie_domain,
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        session.refresh_token,
        max_age=session.refresh_token_max_age,
        httponly=True,
        path="/api/auth",
        secure=settings.auth_cookie_secure,
        samesite="none",
        domain=settings.auth_cookie_domain,
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        session.csrf_token,
        max_age=session.refresh_token_max_age,
        httponly=False,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite="none",
        domain=settings.auth_cookie_domain,
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        ACCESS_TOKEN_COOKIE_NAME,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite="none",
        domain=settings.auth_cookie_domain,
    )
    response.delete_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        path="/api/auth",
        secure=settings.auth_cookie_secure,
        samesite="none",
        domain=settings.auth_cookie_domain,
    )
    response.delete_cookie(
        CSRF_COOKIE_NAME,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite="none",
        domain=settings.auth_cookie_domain,
    )


def _ensure_csrf(request: Request, family_id: uuid.UUID) -> None:
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if not header_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="csrf validation failed")
    is_valid = verify_csrf_token(
        header_token,
        binding_key=str(family_id),
        secret=derive_csrf_secret(get_settings().jwt_secret_key),
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="csrf validation failed")


def _ensure_origin_and_host(request: Request, db: Session, settings: Settings) -> None:
    allowed_origins = build_allowed_origins(
        static_platform_origins=set(settings.cors_origins()),
        organization_domains=_organization_domains(db),
    )
    origin = request.headers.get("origin")
    host = request.headers.get("host")
    if not is_origin_allowed(origin, allowed_origins=allowed_origins):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="origin not allowed")
    if not is_host_consistent_with_origin(host, origin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="origin host mismatch")


def _organization_domains(db: Session) -> set[str]:
    rows = db.execute(
        select(Organization.custom_domain).where(Organization.custom_domain.is_not(None))
    )
    return {custom_domain for (custom_domain,) in rows if custom_domain is not None}


def _ensure_rate_limit(*, key: str, rule: RateLimitRule) -> None:
    if not _rate_limiter.allow(key=key, rule=rule):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate limit exceeded",
        )


def _client_key(request: Request) -> str:
    if request.client is None:
        return "unknown"
    return request.client.host
