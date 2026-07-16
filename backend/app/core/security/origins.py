"""Origin/Host validation primitives for CORS and cookie-authenticated requests (D-039).

Validation is a pure function over an already-resolved set of allowed origins
so it is unit-testable without a database. Loading that set from
`Organization.customDomain`/slug-derived subdomains is a separate, thin
function to be wired into the live request path in a later implementation
step (F002 Step 1 ships primitives only, not live middleware — see
`docs/F002_PLAN.md` §22).
"""

from __future__ import annotations

from urllib.parse import urlsplit


def normalize_origin(origin: str) -> str | None:
    """Return `scheme://host[:port]` lower-cased, or None if not a valid absolute origin."""
    parts = urlsplit(origin)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return None
    netloc = parts.hostname.lower()
    if parts.port:
        netloc = f"{netloc}:{parts.port}"
    return f"{parts.scheme.lower()}://{netloc}"


def is_origin_allowed(origin: str | None, *, allowed_origins: set[str]) -> bool:
    """Reject a missing, malformed, or unapproved origin; never treat a wildcard as a match."""
    if not origin:
        return False
    normalized = normalize_origin(origin)
    if normalized is None:
        return False
    return normalized in allowed_origins


def is_host_consistent_with_origin(host: str | None, origin: str | None) -> bool:
    """The Host header's hostname must match the Origin header's hostname.

    Defends against a request whose Origin was approved by CORS but whose Host
    was manipulated to target a different resolved organization/tenant than
    the browser's own same-origin checks believe it is talking to.
    """
    if not host or not origin:
        return False
    normalized_origin = normalize_origin(origin)
    if normalized_origin is None:
        return False
    origin_hostname = urlsplit(normalized_origin).hostname
    host_hostname = host.split(":", 1)[0].lower()
    return origin_hostname == host_hostname


def build_allowed_origins(
    *, static_platform_origins: set[str], organization_domains: set[str]
) -> set[str]:
    """Combine fixed platform origins with organization-owned domains.

    `organization_domains` holds bare hostnames (custom domains, and slugs
    used as subdomains). They are always expanded as `https://`, never
    `http://`, since production tenant traffic is always HTTPS.
    """
    normalized_static = {
        normalized
        for origin in static_platform_origins
        if (normalized := normalize_origin(origin)) is not None
    }
    tenant_origins = {f"https://{domain.lower()}" for domain in organization_domains}
    return normalized_static | tenant_origins
