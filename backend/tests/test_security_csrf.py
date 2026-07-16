"""Tests for CSRF double-submit token primitives (D-039, plan §10.3)."""

from app.core.security.csrf import derive_csrf_secret, generate_csrf_token, verify_csrf_token

SECRET = "test-csrf-secret-not-for-real-use"


def test_generated_token_verifies_with_same_binding_key_and_secret() -> None:
    token = generate_csrf_token(binding_key="family-1", secret=SECRET)

    assert verify_csrf_token(token, binding_key="family-1", secret=SECRET) is True


def test_token_rejected_for_different_binding_key() -> None:
    token = generate_csrf_token(binding_key="family-1", secret=SECRET)

    assert verify_csrf_token(token, binding_key="family-2", secret=SECRET) is False


def test_token_rejected_for_different_secret() -> None:
    token = generate_csrf_token(binding_key="family-1", secret=SECRET)

    assert verify_csrf_token(token, binding_key="family-1", secret="a-different-secret") is False


def test_malformed_token_rejected() -> None:
    assert verify_csrf_token("not-a-valid-token", binding_key="family-1", secret=SECRET) is False


def test_empty_token_rejected() -> None:
    assert verify_csrf_token("", binding_key="family-1", secret=SECRET) is False


def test_token_with_empty_signature_rejected() -> None:
    assert verify_csrf_token("nonce-only.", binding_key="family-1", secret=SECRET) is False


def test_two_tokens_for_same_binding_key_are_not_identical() -> None:
    # Nonces must differ so tokens are not replayable/guessable from a prior issuance.
    first = generate_csrf_token(binding_key="family-1", secret=SECRET)
    second = generate_csrf_token(binding_key="family-1", secret=SECRET)

    assert first != second
    assert verify_csrf_token(first, binding_key="family-1", secret=SECRET) is True
    assert verify_csrf_token(second, binding_key="family-1", secret=SECRET) is True


def test_derive_csrf_secret_is_deterministic_and_key_separated() -> None:
    jwt_secret = "jwt-secret-value-not-for-real-use"

    derived_first = derive_csrf_secret(jwt_secret)
    derived_second = derive_csrf_secret(jwt_secret)

    assert derived_first == derived_second
    assert derived_first != jwt_secret


def test_derive_csrf_secret_differs_per_jwt_secret() -> None:
    assert derive_csrf_secret("secret-a-not-for-real-use") != derive_csrf_secret(
        "secret-b-not-for-real-use"
    )
