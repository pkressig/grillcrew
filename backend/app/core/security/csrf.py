"""CSRF double-submit token primitives (D-039, plan `docs/F002_PLAN.md` §10.3).

Once a cookie-authenticated session exists, the server issues a CSRF token
bound (via HMAC) to an opaque `binding_key` supplied by the caller — in later
steps, the active refresh-token family id, so revoking that family also
invalidates its CSRF tokens with no separate storage or cleanup needed. The
token is delivered as a *readable* (non-`HttpOnly`) cookie; the frontend
echoes it back in the `X-CSRF-Token` header on every state-changing request.
A cross-site attacker can trigger the request but cannot read the cookie to
learn the value to put in the header, which is what makes the double submit
effective.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_COOKIE_NAME = "gc_csrf"

_NONCE_BYTES = 32
_CSRF_KEY_CONTEXT = b"csrf-token-v1"


def derive_csrf_secret(jwt_secret_key: str) -> str:
    """Domain-separate the CSRF signing key from the JWT signing key.

    Both ultimately derive from the same operator-provided secret, but
    HMAC-derivation with a fixed context label ensures a leak of one key does
    not directly hand over the other.
    """
    return hmac.new(jwt_secret_key.encode(), _CSRF_KEY_CONTEXT, hashlib.sha256).hexdigest()


def generate_csrf_token(*, binding_key: str, secret: str) -> str:
    nonce = secrets.token_urlsafe(_NONCE_BYTES)
    signature = _sign(binding_key=binding_key, nonce=nonce, secret=secret)
    return f"{nonce}.{signature}"


def verify_csrf_token(token: str, *, binding_key: str, secret: str) -> bool:
    try:
        nonce, signature = token.split(".", 1)
    except ValueError:
        return False
    if not nonce or not signature:
        return False
    expected = _sign(binding_key=binding_key, nonce=nonce, secret=secret)
    return hmac.compare_digest(signature, expected)


def _sign(*, binding_key: str, nonce: str, secret: str) -> str:
    message = f"{binding_key}:{nonce}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
