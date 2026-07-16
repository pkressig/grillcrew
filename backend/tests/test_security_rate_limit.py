"""Tests for structured auth rate-limit configuration (D-038)."""

import pytest
from pydantic import ValidationError

from app.core.security.rate_limit import AuthRateLimits, RateLimitRule


def test_default_auth_rate_limits_define_every_required_action() -> None:
    limits = AuthRateLimits()

    # D-038: login, refresh, password reset, and invitation acceptance each
    # need their own limit, not one shared budget.
    assert limits.login_per_account.max_attempts >= 1
    assert limits.login_per_ip.max_attempts >= 1
    assert limits.refresh_per_account.max_attempts >= 1
    assert limits.refresh_per_ip.max_attempts >= 1
    assert limits.password_reset_request_per_account.max_attempts >= 1
    assert limits.password_reset_request_per_ip.max_attempts >= 1
    assert limits.invitation_accept_per_token.max_attempts >= 1
    assert limits.invitation_accept_per_ip.max_attempts >= 1


def test_defaults_are_conservative_not_wide_open() -> None:
    limits = AuthRateLimits()

    # A conservative default keeps brute-force attempts small per window;
    # this pins the intent, not exact tuning values.
    assert limits.login_per_account.max_attempts <= 10
    assert limits.password_reset_request_per_account.max_attempts <= 10


def test_per_action_limits_are_independent() -> None:
    limits = AuthRateLimits(login_per_account=RateLimitRule(max_attempts=3, window_seconds=60))

    assert limits.login_per_account.max_attempts == 3
    # Overriding one action must not affect the others.
    default_refresh = AuthRateLimits().refresh_per_account.max_attempts
    assert limits.refresh_per_account.max_attempts == default_refresh


def test_rate_limit_rule_rejects_non_positive_max_attempts() -> None:
    with pytest.raises(ValidationError):
        RateLimitRule(max_attempts=0, window_seconds=60)


def test_rate_limit_rule_rejects_non_positive_window() -> None:
    with pytest.raises(ValidationError):
        RateLimitRule(max_attempts=5, window_seconds=0)
