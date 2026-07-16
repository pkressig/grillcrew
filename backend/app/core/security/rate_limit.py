"""Structured rate-limit configuration for sensitive authentication actions (D-038).

Login and password-reset requests are limited both per account and per IP,
because IP-based limiting alone is unreliable behind shared/CGNAT networks —
the same caveat already documented for public signup in `docs/RFC.md` RFC-010.
Each sensitive action gets its own limit rather than one shared budget, per
the Product Owner's refinement to D-038.
"""

from __future__ import annotations

from pydantic import BaseModel, field_validator


class RateLimitRule(BaseModel):  # type: ignore[explicit-any]
    """At most `max_attempts` within a rolling `window_seconds`."""

    max_attempts: int
    window_seconds: int

    @field_validator("max_attempts")
    @classmethod
    def _max_attempts_positive(cls, value: int) -> int:
        if value < 1:
            raise ValueError("max_attempts must be at least 1")
        return value

    @field_validator("window_seconds")
    @classmethod
    def _window_positive(cls, value: int) -> int:
        if value < 1:
            raise ValueError("window_seconds must be at least 1")
        return value


class AuthRateLimits(BaseModel):  # type: ignore[explicit-any]
    """Conservative default limits for sensitive auth actions (D-038)."""

    login_per_account: RateLimitRule = RateLimitRule(max_attempts=5, window_seconds=900)
    login_per_ip: RateLimitRule = RateLimitRule(max_attempts=20, window_seconds=900)

    refresh_per_account: RateLimitRule = RateLimitRule(max_attempts=120, window_seconds=86400)
    refresh_per_ip: RateLimitRule = RateLimitRule(max_attempts=60, window_seconds=3600)

    password_reset_request_per_account: RateLimitRule = RateLimitRule(
        max_attempts=3, window_seconds=3600
    )
    password_reset_request_per_ip: RateLimitRule = RateLimitRule(
        max_attempts=10, window_seconds=3600
    )

    invitation_accept_per_token: RateLimitRule = RateLimitRule(max_attempts=10, window_seconds=3600)
    invitation_accept_per_ip: RateLimitRule = RateLimitRule(max_attempts=20, window_seconds=3600)
