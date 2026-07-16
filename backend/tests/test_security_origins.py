"""Tests for Origin/Host validation primitives (D-039, plan §10.1-10.2)."""

from app.core.security.origins import (
    build_allowed_origins,
    is_host_consistent_with_origin,
    is_origin_allowed,
    normalize_origin,
)


def test_normalize_origin_lowercases_and_keeps_port() -> None:
    assert normalize_origin("HTTPS://Example.COM:8443") == "https://example.com:8443"


def test_normalize_origin_drops_default_looking_input_without_scheme() -> None:
    assert normalize_origin("example.com") is None


def test_normalize_origin_rejects_non_http_scheme() -> None:
    assert normalize_origin("ftp://example.com") is None


def test_is_origin_allowed_matches_allowlisted_origin() -> None:
    allowed = {"https://app.example.test"}
    assert is_origin_allowed("https://app.example.test", allowed_origins=allowed) is True


def test_is_origin_allowed_rejects_unlisted_origin() -> None:
    allowed = {"https://app.example.test"}
    assert is_origin_allowed("https://attacker.test", allowed_origins=allowed) is False


def test_is_origin_allowed_rejects_missing_origin() -> None:
    assert is_origin_allowed(None, allowed_origins={"https://app.example.test"}) is False
    assert is_origin_allowed("", allowed_origins={"https://app.example.test"}) is False


def test_is_origin_allowed_never_matches_wildcard_entry() -> None:
    # Even if a caller mistakenly puts "*" in the allowed set, a concrete
    # Origin header is never a literal match for it.
    assert is_origin_allowed("https://attacker.test", allowed_origins={"*"}) is False


def test_is_origin_allowed_rejects_malformed_origin() -> None:
    assert is_origin_allowed("not-a-url", allowed_origins={"https://app.example.test"}) is False


def test_host_consistent_with_matching_origin() -> None:
    assert is_host_consistent_with_origin("app.example.test", "https://app.example.test") is True


def test_host_consistent_ignores_port_on_host_header() -> None:
    assert (
        is_host_consistent_with_origin("app.example.test:443", "https://app.example.test") is True
    )


def test_host_inconsistent_with_different_origin() -> None:
    assert is_host_consistent_with_origin("app.example.test", "https://attacker.test") is False


def test_host_inconsistent_when_either_value_missing() -> None:
    assert is_host_consistent_with_origin(None, "https://app.example.test") is False
    assert is_host_consistent_with_origin("app.example.test", None) is False


def test_build_allowed_origins_combines_static_and_tenant_domains() -> None:
    allowed = build_allowed_origins(
        static_platform_origins={"https://app.platform.test"},
        organization_domains={"example-club.platform.test", "grillclub.ch"},
    )

    assert allowed == {
        "https://app.platform.test",
        "https://example-club.platform.test",
        "https://grillclub.ch",
    }


def test_build_allowed_origins_ignores_malformed_static_entries() -> None:
    allowed = build_allowed_origins(
        static_platform_origins={"not-a-url", "https://app.platform.test"},
        organization_domains=set(),
    )

    assert allowed == {"https://app.platform.test"}
