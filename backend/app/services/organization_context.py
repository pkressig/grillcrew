"""Organization context resolution for tenant-scoped requests."""

from dataclasses import dataclass

from fastapi import Request
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.config import AppEnv
from app.models.organization import Organization


@dataclass(frozen=True)
class OrganizationLookup:
    custom_domain: str | None
    subdomain: str | None
    path_slug: str | None
    development_override: str | None


def build_organization_lookup(request: Request) -> OrganizationLookup:
    """Extract non-secret organization lookup hints from the request."""
    host = request.headers.get("host")
    clean_host = host.split(":", 1)[0].lower() if host else None
    return OrganizationLookup(
        custom_domain=_custom_domain(clean_host),
        subdomain=_subdomain(clean_host),
        path_slug=_path_slug(request.url.path),
        development_override=request.query_params.get("org"),
    )


def resolve_organization(
    db: Session, lookup: OrganizationLookup, app_env: AppEnv
) -> Organization | None:
    """Resolve organization in the approved order without production fallback."""
    for slug in (
        _slug_for_domain(db, lookup.custom_domain),
        lookup.subdomain,
        lookup.path_slug,
        lookup.development_override if app_env == AppEnv.DEVELOPMENT else None,
    ):
        if slug:
            organization = _by_slug(db, slug)
            if organization is not None:
                return organization

    if app_env == AppEnv.DEVELOPMENT:
        organization_count = db.scalar(select(func.count()).select_from(Organization))
        if organization_count == 1:
            return db.scalar(_organization_query())

    return None


def _slug_for_domain(db: Session, custom_domain: str | None) -> str | None:
    if not custom_domain:
        return None
    organization = db.scalar(
        _organization_query().where(Organization.custom_domain == custom_domain)
    )
    return organization.slug if organization else None


def _by_slug(db: Session, slug: str) -> Organization | None:
    return db.scalar(_organization_query().where(Organization.slug == slug))


def _organization_query() -> Select[tuple[Organization]]:
    return select(Organization).limit(1)


def _custom_domain(host: str | None) -> str | None:
    if not host or _is_localhost(host):
        return None
    return host


def _subdomain(host: str | None) -> str | None:
    if not host or _is_localhost(host):
        return None
    parts = host.split(".")
    if len(parts) < 3 or parts[0] in {"www", "api"}:
        return None
    return parts[0]


def _path_slug(path: str) -> str | None:
    parts = [part for part in path.split("/") if part]
    if not parts:
        return None
    if parts[0] == "api" and len(parts) >= 4 and parts[1] == "public":
        return parts[3]
    if parts[0] == "api" and len(parts) >= 3 and parts[1] == "admin":
        return parts[2]
    if (
        parts[0] == "api"
        and len(parts) >= 4
        and parts[1] == "internal"
        and parts[2] == "test-support"
    ):
        return parts[3]
    if parts[0] != "api":
        return parts[0]
    return None


def _is_localhost(host: str) -> bool:
    return host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".localhost")
