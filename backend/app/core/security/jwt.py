"""Stateless access-token issuance and verification (JWT, plan `docs/F002_PLAN.md` §8).

Tokens intentionally carry no role or organization claims: authorization is
always re-checked against the database per request, so a token only proves
*who* the caller is, never *what* they may currently do.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt as pyjwt

JWT_ALGORITHM = "HS256"


class InvalidAccessTokenError(Exception):
    """Raised for any access token that fails signature, shape, or expiry checks."""


@dataclass(frozen=True)
class AccessTokenClaims:
    subject: str
    issued_at: datetime
    expires_at: datetime
    token_id: str


def create_access_token(*, subject: str, secret: str, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + ttl,
        "jti": str(uuid.uuid4()),
    }
    return pyjwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, *, secret: str) -> AccessTokenClaims:
    try:
        payload = pyjwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    except pyjwt.InvalidTokenError as exc:
        raise InvalidAccessTokenError(str(exc)) from exc

    try:
        return AccessTokenClaims(
            subject=str(payload["sub"]),
            issued_at=datetime.fromtimestamp(float(payload["iat"]), tz=UTC),
            expires_at=datetime.fromtimestamp(float(payload["exp"]), tz=UTC),
            token_id=str(payload["jti"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidAccessTokenError("malformed token payload") from exc
