"""Per-organization email branding: sender display name and the shared HTML template (D-040).

No organization or club name is ever hardcoded here. Every organization-specific value
(display name, logo, banner, accent colors) is threaded in by the caller, resolved from the
`Organization`/`Theme` rows already used to render the admin theme settings screen (see
`app.services.settings.SettingsService.get_theme`). When no organization can be resolved (see
the password-reset gap documented in `app.services.auth`), callers pass `branding=None` and this
module falls back to generic, platform-only branding ("Vereinshelden") rather than guessing.
"""

from __future__ import annotations

import html
from dataclasses import dataclass
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organization import Organization, Theme

GENERIC_ORGANIZATION_NAME = "Vereinshelden"
_DEFAULT_PRIMARY_COLOR = "#262626"
_DEFAULT_SECONDARY_COLOR = "#525252"


@dataclass(frozen=True)
class OrganizationBranding:
    organization_name: str
    organization_short_name: str | None
    logo_url: str | None
    banner_url: str | None
    primary_color: str
    secondary_color: str


@dataclass(frozen=True)
class BrandedEmailContent:
    html: str
    text: str


def resolve_organization_branding(
    db: Session, organization: Organization, *, frontend_public_url: str
) -> OrganizationBranding:
    """Resolve branding for an already-loaded `Organization`.

    Reuses the same query shape as `SettingsService.get_theme` (see `app/services/settings.py`)
    rather than instantiating that service, since callers here already hold the `Organization`
    row and re-fetching it would be redundant.
    """
    theme = db.scalar(select(Theme).where(Theme.id == organization.theme_id))
    return OrganizationBranding(
        organization_name=organization.name,
        organization_short_name=organization.short_name,
        logo_url=_absolute_asset_url(
            theme.logo_url if theme else None, frontend_public_url=frontend_public_url
        ),
        banner_url=_absolute_asset_url(
            theme.banner_url if theme else None, frontend_public_url=frontend_public_url
        ),
        primary_color=theme.primary_color if theme else _DEFAULT_PRIMARY_COLOR,
        secondary_color=theme.secondary_color if theme else _DEFAULT_SECONDARY_COLOR,
    )


def _absolute_asset_url(url: str | None, *, frontend_public_url: str) -> str | None:
    """Resolve a theme asset URL to an absolute URL.

    `Theme.logo_url`/`Theme.banner_url` are often relative paths meant for the Next.js
    frontend's own `public/` folder (e.g. `/branding/foo.png`). Email clients cannot resolve
    relative paths, so any non-absolute value is anchored to `frontend_public_url`.
    """
    if url is None:
        return None
    stripped = url.strip()
    if not stripped:
        return None
    if urlsplit(stripped).scheme in {"http", "https"}:
        return stripped
    return f"{frontend_public_url.rstrip('/')}/{stripped.lstrip('/')}"


def sender_display_name(branding: OrganizationBranding | None) -> str:
    """Compute the From-header display name: `"{short_name or name} Grill Helfer"`.

    The sending address stays platform-wide per D-040; only this display name is
    per-organization. Never hardcoded to any specific club.
    """
    if branding is None:
        return GENERIC_ORGANIZATION_NAME
    name = branding.organization_short_name or branding.organization_name
    return f"{name} Grill Helfer"


def render_branded_email(
    *,
    branding: OrganizationBranding | None,
    heading: str,
    body_html: str,
    body_text: str,
    cta_label: str | None = None,
    cta_url: str | None = None,
) -> BrandedEmailContent:
    """Wrap per-email content in the shared, table-based branded HTML layout.

    `body_html` is caller-authored HTML (already-safe `<p>`/`<strong>` markup for the email's own
    content); `heading`, organization name, and the footer are escaped here. Also produces the
    plain-text fallback (`body_text` plus the same app-vs-club footer) for clients that cannot
    render HTML.
    """
    organization_name = (
        branding.organization_name if branding is not None else GENERIC_ORGANIZATION_NAME
    )
    logo_url = branding.logo_url if branding is not None else None
    primary_color = branding.primary_color if branding is not None else _DEFAULT_PRIMARY_COLOR
    secondary_color = branding.secondary_color if branding is not None else _DEFAULT_SECONDARY_COLOR

    footer_text = (
        f"Diese E-Mail wurde von der Vereinshelden-Plattform im Auftrag von {organization_name} "
        "versendet. Vereinshelden ist die App, nicht der Verein."
    )

    logo_row = ""
    if logo_url:
        logo_row = f"""
        <tr>
          <td align="center" style="padding:24px 32px 0 32px;">
            <img src="{html.escape(logo_url, quote=True)}"
                 alt="{html.escape(organization_name, quote=True)}"
                 style="max-width:160px;max-height:64px;display:block;" />
          </td>
        </tr>"""

    cta_row = ""
    if cta_label and cta_url:
        cta_row = f"""
              <table role="presentation" cellpadding="0" cellspacing="0"
                     style="margin:24px 0 8px 0;">
                <tr>
                  <td style="border-radius:6px;
                             background-color:{html.escape(primary_color, quote=True)};">
                    <a href="{html.escape(cta_url, quote=True)}"
                       style="display:inline-block;padding:12px 24px;font-family:Arial,
                              Helvetica,sans-serif;font-size:15px;color:#ffffff;
                              text-decoration:none;border-radius:6px;">
                      {html.escape(cta_label)}
                    </a>
                  </td>
                </tr>
              </table>"""

    email_html = f"""<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background-color:#f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:480px;background-color:#ffffff;border-radius:8px;
                        overflow:hidden;
                        border-top:4px solid {html.escape(primary_color, quote=True)};">
            {logo_row}
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <h1 style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;
                           font-size:20px;color:{html.escape(primary_color, quote=True)};">
                  {html.escape(heading)}
                </h1>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;
                            line-height:1.6;color:#262626;">
                  {body_html}
                </div>{cta_row}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;border-top:1px solid #e5e5e5;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                          line-height:1.5;
                          color:{html.escape(secondary_color, quote=True)};">
                  {html.escape(footer_text)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    text = f"{body_text}\n\n---\n{footer_text}"
    return BrandedEmailContent(html=email_html, text=text)
