"""Tests for password hashing primitives (D-040 context: plan §11)."""

import pytest

from app.core.security.password import (
    MIN_PASSWORD_LENGTH,
    PasswordPolicyError,
    hash_password,
    validate_password_policy,
    verify_password,
    verify_password_or_dummy,
)


def test_hash_and_verify_round_trip() -> None:
    password = "correct-horse-battery-staple"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True


def test_verify_rejects_wrong_password() -> None:
    hashed = hash_password("correct-horse-battery-staple")

    assert verify_password("wrong-password", hashed) is False


def test_verify_rejects_malformed_hash() -> None:
    assert verify_password("any-password", "not-a-real-hash") is False


def test_verify_password_or_dummy_returns_false_for_unknown_user() -> None:
    # No password_hash exists for an unknown user; the dummy path must still
    # run a full verify (for timing parity) and always report failure.
    assert verify_password_or_dummy("whatever", None) is False


def test_verify_password_or_dummy_checks_real_hash_when_present() -> None:
    hashed = hash_password("correct-horse-battery-staple")

    assert verify_password_or_dummy("correct-horse-battery-staple", hashed) is True
    assert verify_password_or_dummy("wrong-password", hashed) is False


def test_validate_password_policy_accepts_long_enough_password() -> None:
    validate_password_policy("a" * MIN_PASSWORD_LENGTH)


def test_validate_password_policy_rejects_short_password() -> None:
    with pytest.raises(PasswordPolicyError):
        validate_password_policy("a" * (MIN_PASSWORD_LENGTH - 1))


def test_two_hashes_of_same_password_differ() -> None:
    # Argon2 salts each hash independently.
    password = "correct-horse-battery-staple"
    assert hash_password(password) != hash_password(password)
