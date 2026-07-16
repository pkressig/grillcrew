"""Tests for access-token (JWT) primitives (plan `docs/F002_PLAN.md` §8)."""

from datetime import timedelta

import jwt as pyjwt
import pytest

from app.core.security.jwt import (
    JWT_ALGORITHM,
    InvalidAccessTokenError,
    create_access_token,
    decode_access_token,
)

SECRET = "test-secret-key-not-for-real-use-1234567890"


def test_create_and_decode_round_trip() -> None:
    token = create_access_token(subject="user-123", secret=SECRET, ttl=timedelta(minutes=15))

    claims = decode_access_token(token, secret=SECRET)

    assert claims.subject == "user-123"
    assert claims.expires_at > claims.issued_at
    assert claims.token_id


def test_two_tokens_for_same_subject_have_different_jti() -> None:
    first = create_access_token(subject="user-123", secret=SECRET, ttl=timedelta(minutes=15))
    second = create_access_token(subject="user-123", secret=SECRET, ttl=timedelta(minutes=15))

    assert (
        decode_access_token(first, secret=SECRET).token_id
        != decode_access_token(second, secret=SECRET).token_id
    )


def test_decode_rejects_expired_token() -> None:
    token = create_access_token(subject="user-123", secret=SECRET, ttl=timedelta(seconds=-1))

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, secret=SECRET)


def test_decode_rejects_wrong_secret() -> None:
    token = create_access_token(subject="user-123", secret=SECRET, ttl=timedelta(minutes=15))

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, secret="a-completely-different-secret-value")


def test_decode_rejects_tampered_token() -> None:
    token = create_access_token(subject="user-123", secret=SECRET, ttl=timedelta(minutes=15))
    header, payload, signature = token.split(".")
    tampered_payload = payload[:-2] + ("AA" if payload[-2:] != "AA" else "BB")
    tampered = f"{header}.{tampered_payload}.{signature}"

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(tampered, secret=SECRET)


def test_decode_rejects_garbage_token() -> None:
    with pytest.raises(InvalidAccessTokenError):
        decode_access_token("not.a.jwt", secret=SECRET)


def test_decode_rejects_token_missing_required_claims() -> None:
    # A validly signed token that simply never carried the claims we require.
    token = pyjwt.encode({"sub": "user-123"}, SECRET, algorithm=JWT_ALGORITHM)

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(token, secret=SECRET)


def test_decode_rejects_none_algorithm_token() -> None:
    # Classic JWT "alg=none" forgery attempt must be rejected by algorithm pinning.
    forged = pyjwt.encode({"sub": "user-123"}, key="", algorithm="none")

    with pytest.raises(InvalidAccessTokenError):
        decode_access_token(forged, secret=SECRET)
