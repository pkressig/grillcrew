"""Authentication API endpoints."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.security.csrf import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    derive_csrf_secret,
    generate_csrf_token,
    verify_csrf_token,
)
from app.core.security.origins import (
    build_allowed_origins,
    is_origin_allowed,
)
from app.core.security.password import PasswordPolicyError, hash_password, validate_password_policy
from app.core.security.rate_limit import InMemoryRateLimiter, RateLimitRule
from app.db.session import get_db
from app.models.family import Family, FamilyMember, FamilyMemberType
from app.models.identity import User, UserStatus
from app.models.organization import Organization, OrganizationSettings
from app.models.planning import SignupSource, Volunteer
from app.schemas.auth import (
    AcceptInvitationRequest,
    AcceptInvitationResponse,
    AuthSessionResponse,
    CsrfTokenResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LogoutResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    VolunteerProfileResponse,
    VolunteerRegisterRequest,
    VolunteerRegisterResponse,
)
from app.services.auth import (
    ACCESS_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
    InvalidCredentialsError,
    InvalidPasswordResetTokenError,
    InvalidRefreshTokenError,
    IssuedSession,
    LoginService,
    LogoutService,
    PasswordResetService,
    RefreshService,
    RefreshTokenValidation,
    build_session_response,
    dispatch_password_reset_email,
    dispatch_volunteer_registration_email,
    issue_session,
    normalize_email,
)
from app.services.invitation import (
    InvalidInvitationTokenError,
    InvitationService,
    hash_invitation_token,
)
from app.services.public_signup import normalize_phone

router = APIRouter(prefix="/api/auth", tags=["auth"])
_rate_limiter = InMemoryRateLimiter()


@router.post("/volunteer/register", response_model=VolunteerRegisterResponse, status_code=201)
def register_volunteer(
    payload: VolunteerRegisterRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),  # noqa: B008
) -> VolunteerRegisterResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    organization = db.scalar(
        select(Organization).where(Organization.slug == payload.organization_slug)
    )
    if organization is None:
        raise HTTPException(status_code=404, detail="organization not found")
    try:
        settings_record = db.scalar(
            select(OrganizationSettings).where(
                OrganizationSettings.organization_id == organization.id
            )
        )
        minimum_length = settings_record.volunteer_password_min_length if settings_record else 6
        validate_password_policy(payload.password, minimum_length=minimum_length)
    except PasswordPolicyError:
        raise HTTPException(status_code=422, detail="password policy violation") from None
    email = normalize_email(payload.email)
    if db.scalar(select(User.id).where(User.email_normalized == email)) is not None:
        raise HTTPException(status_code=409, detail="email already registered")
    phone = normalize_phone(payload.phone)
    user = User(
        email_normalized=email,
        display_name=f"{payload.first_name.strip()} {payload.last_name.strip()}",
        password_hash=hash_password(payload.password),
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.flush()
    volunteer = Volunteer(
        organization_id=organization.id,
        user_id=user.id,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone_normalized=phone,
        phone_display=payload.phone.strip(),
        email_normalized=email,
        email_display=payload.email.strip(),
        created_from=SignupSource.PUBLIC_SIGNUP,
        compensation_preference=payload.compensation_preference,
    )
    db.add(volunteer)
    family = Family(organization_id=organization.id, display_name=payload.last_name.strip())
    db.add(family)
    db.flush()
    db.add(
        FamilyMember(
            family_id=family.id,
            member_type=FamilyMemberType.HELPER,
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip(),
            volunteer_id=volunteer.id,
        )
    )
    if payload.child_first_name and payload.child_last_name:
        child_team_name = (payload.child_team_name or "").strip() or None
        child = FamilyMember(
            family_id=family.id,
            member_type=FamilyMemberType.CHILD,
            first_name=payload.child_first_name.strip(),
            last_name=payload.child_last_name.strip(),
            team_name=child_team_name,
        )
        db.add(child)
        db.flush()
        volunteer.compensation_family_member_id = child.id
    now = datetime.now(UTC)
    session = issue_session(db=db, user=user, settings=settings, now=now)
    db.commit()
    set_auth_cookies(response, session, settings)
    background_tasks.add_task(
        dispatch_volunteer_registration_email,
        settings,
        recipient=volunteer.email_display,
        first_name=volunteer.first_name,
        organization_name=organization.name,
        organization_slug=organization.slug,
    )
    return VolunteerRegisterResponse(session=build_session_response(user))


@router.get("/volunteer/profile", response_model=VolunteerProfileResponse)
def volunteer_profile(
    current_user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> VolunteerProfileResponse:
    volunteer = db.scalar(select(Volunteer).where(Volunteer.user_id == current_user.user.id))
    if volunteer is None:
        raise HTTPException(status_code=404, detail="volunteer profile not found")
    return VolunteerProfileResponse(
        first_name=volunteer.first_name,
        last_name=volunteer.last_name,
        phone=volunteer.phone_display,
        email=volunteer.email_display,
        compensation_preference=volunteer.compensation_preference,
        compensation_family_member_id=str(volunteer.compensation_family_member_id)
        if volunteer.compensation_family_member_id
        else None,
    )


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


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),  # noqa: B008
) -> ForgotPasswordResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    email_normalized = normalize_email(payload.email)
    _ensure_rate_limit(
        key=f"password-reset-request:account:{email_normalized}",
        rule=settings.auth_rate_limits.password_reset_request_per_account,
    )
    _ensure_rate_limit(
        key=f"password-reset-request:ip:{_client_key(request)}",
        rule=settings.auth_rate_limits.password_reset_request_per_ip,
    )
    issue = PasswordResetService(db, settings).request_reset(email=email_normalized)
    if issue is not None:
        background_tasks.add_task(
            dispatch_password_reset_email,
            settings,
            recipient=issue.recipient,
            raw_token=issue.raw_token,
        )
    return ForgotPasswordResponse()


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
) -> ResetPasswordResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    try:
        PasswordResetService(db, settings).reset_password(
            raw_token=payload.token,
            new_password=payload.new_password,
        )
    except PasswordPolicyError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password policy violation",
        ) from None
    except InvalidPasswordResetTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid reset token",
        ) from None
    return ResetPasswordResponse()


@router.post("/accept-invitation", response_model=AcceptInvitationResponse)
def accept_invitation(
    payload: AcceptInvitationRequest,
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
) -> AcceptInvitationResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    token_key = hash_invitation_token(payload.token)
    _ensure_rate_limit(
        key=f"invitation-accept:token:{token_key}",
        rule=settings.auth_rate_limits.invitation_accept_per_token,
    )
    _ensure_rate_limit(
        key=f"invitation-accept:ip:{_client_key(request)}",
        rule=settings.auth_rate_limits.invitation_accept_per_ip,
    )
    try:
        InvitationService(db, settings).accept(
            raw_token=payload.token,
            display_name=payload.display_name,
            password=payload.password,
        )
    except PasswordPolicyError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password policy violation",
        ) from None
    except InvalidInvitationTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid invitation token",
        ) from None
    return AcceptInvitationResponse()


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


@router.get("/csrf", response_model=CsrfTokenResponse)
def csrf_token(
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
) -> CsrfTokenResponse:
    settings = get_settings()
    _ensure_origin_and_host(request, db, settings)
    raw_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    try:
        validated = RefreshService(db, settings).validate(refresh_token=raw_refresh_token)
    except InvalidRefreshTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid refresh token",
        ) from None
    token = generate_csrf_token(
        binding_key=str(validated.token.family_id),
        secret=derive_csrf_secret(settings.jwt_secret_key),
    )
    return CsrfTokenResponse(csrf_token=token)


# Refresh cookies issued before the Path=/api/auth -> Path=/api migration are a distinct
# browser-side cookie (path is part of a cookie's identity), so neither set_cookie nor
# delete_cookie at the new path touches them. Clearing the old path too, on every session
# issuance and on logout, lets any such leftover cookie actually disappear from the browser
# instead of lingering (inert, since the underlying token is separately revoked) until its
# original 30-day expiry.
_LEGACY_REFRESH_COOKIE_PATH = "/api/auth"


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
        path="/api",
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
    _clear_legacy_refresh_cookie(response, settings)


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
        path="/api",
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
    _clear_legacy_refresh_cookie(response, settings)


def _clear_legacy_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        path=_LEGACY_REFRESH_COOKIE_PATH,
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
    if not is_origin_allowed(origin, allowed_origins=allowed_origins):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="origin not allowed")


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
