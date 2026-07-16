"""Password hashing utilities (Argon2id, plan `docs/F002_PLAN.md` §11)."""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

MIN_PASSWORD_LENGTH = 10

_hasher = PasswordHasher()


class PasswordPolicyError(ValueError):
    """Raised when a candidate password does not meet the minimum policy."""


def validate_password_policy(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(
            f"password must be at least {MIN_PASSWORD_LENGTH} characters long"
        )


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# A hash of a fixed, never-issued placeholder value. Verifying against it when
# no user was found keeps the login code path (and roughly its timing) the
# same regardless of whether the email exists, so response timing does not
# leak account existence (plan §11).
_DUMMY_PASSWORD_HASH = hash_password("placeholder-for-timing-parity-only")


def verify_password_or_dummy(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        return False
    return verify_password(password, password_hash)
