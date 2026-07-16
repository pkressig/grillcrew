"""Structured rate-limit configuration for sensitive authentication actions (D-038).

Login and password-reset requests are limited both per account and per IP,
because IP-based limiting alone is unreliable behind shared/CGNAT networks —
the same caveat already documented for public signup in `docs/RFC.md` RFC-010.
Each sensitive action gets its own limit rather than one shared budget, per
the Product Owner's refinement to D-038.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from threading import Lock

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


class InMemoryRateLimiter:
    """Small process-local fixed-window limiter for sensitive auth endpoints."""

    def __init__(self) -> None:
        self._attempts: defaultdict[str, list[datetime]] = defaultdict(list)
        self._lock = Lock()

    def allow(self, *, key: str, rule: RateLimitRule, now: datetime | None = None) -> bool:
        checked_at = now or datetime.now(UTC)
        window_start = checked_at - timedelta(seconds=rule.window_seconds)
        with self._lock:
            attempts = [
                attempted_at for attempted_at in self._attempts[key] if attempted_at > window_start
            ]
            if len(attempts) >= rule.max_attempts:
                self._attempts[key] = attempts
                return False
            attempts.append(checked_at)
            self._attempts[key] = attempts
            return True
