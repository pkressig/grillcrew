# Architecture Overview

## Product Architecture

The platform is a commercial multi-organization SaaS. An organization is the tenant boundary for operational data, permissions, settings, and branding. The first production organization is a pilot customer, not a special case in the product model.

Binding rules:

- Never hardcode a customer, club, or instance name.
- Never hardcode organization branding.
- Every business record is directly or indirectly scoped to one `Organization`.
- Backend queries must always run inside an explicit organization context.
- Permissions are assigned per organization.
- Organization Theme and settings are loaded from the database.
- Public pages resolve the organization through custom domain, subdomain, URL path, or development override.
- Production never falls back to an arbitrary organization.

## Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js App Router, strict TypeScript | Mobile-first web app, PWA-ready, broad hosting support |
| UI | Tailwind CSS, shadcn/ui-compatible primitives | Accessible components with database-driven theme tokens |
| Backend | FastAPI, Pydantic v2 | Server-side validation and OpenAPI support |
| ORM/Migrations | SQLAlchemy 2, Alembic | Explicit relational model and migration history |
| Database | PostgreSQL | Transactions and tenant-scoped relational integrity |
| Tests | pytest, Vitest, Testing Library | Automated backend and frontend quality gates |
| Hosting | Vercel frontend, Render backend/PostgreSQL | GitHub-based deployment path for the first production version |

## System Overview

```text
Browser
  -> Frontend (Next.js)
  -> Backend API (FastAPI)
  -> PostgreSQL
```

## Tenant Model

`Organization` is the root entity for all business data:

- Theme: logo and colors.
- Organization metadata: display name, locale, timezone, language, currency, contacts.
- Settings: rates, anti-abuse thresholds, coordination labels, public signup behavior.
- Planning: club years, seasons, events, shifts.
- People: volunteers, families, children, family members.
- Access: users, staff memberships, roles, permissions.
- Operations: signups, attendance outcomes, work records, payments, dashboard items, statistics, exports.

Cross-organization leakage is a security defect. API handlers, queries, background jobs, exports, and admin screens must filter by organization.

## Branding

Branding is data, not code. Visual branding belongs to `Theme`, which is referenced by `Organization`. The frontend must request public-safe organization metadata before rendering organization-specific public pages. Admin pages use the authenticated organization context.

Required Theme fields:

- logo URL or asset reference
- primary color
- secondary color

Required Organization public metadata:

- display name
- short name or slug
- locale
- timezone
- language
- currency
- public contact fields

Global CSS tokens are only fallbacks for loading and platform-level screens.

## Organization Resolution

Public organization resolution follows this order:

1. Custom domain.
2. Subdomain.
3. URL path.
4. Development override with `?org=`.
5. Development-only fallback when `APP_ENV=development` and exactly one organization exists.

The fallback is forbidden in production.

## Permissions

Permissions are organization-local. A user may be Admin in one organization and have no access to another. Role checks must combine:

- authenticated user
- current organization
- staff membership
- role permission

Frontend route hiding is convenience only; backend guards are authoritative.

## Authentication and Session Security (F002)

Full design in `docs/F002_PLAN.md`; decisions ratified as D-037–D-040 in `docs/DECISIONS.md`.

- Sessions use short-lived JWT access tokens plus rotating opaque refresh tokens, both transported as
  `HttpOnly`, `Secure` cookies. Access tokens carry only the user id — never a role or organization —
  so authorization is always re-checked against the database per request, never trusted from the token.
- A platform-level `User.platformRole` flag (D-037) is orthogonal to the organization-scoped
  `StaffMembership` model above; it is never writable through any API and is assigned only through a
  controlled platform-admin process outside the application.
- Because frontend and backend are cross-site today, the CORS origin allowlist is resolved dynamically
  from the database (platform and organization domains), never a static list or a wildcard combined
  with credentials, and every state-changing cookie-authenticated request requires a signed
  double-submit CSRF token (D-039).
- Rate limits for login, refresh, password reset, and invitation acceptance are platform-wide,
  environment-configured, and set independently per action (D-038).
- Password reset uses opaque high-entropy bearer tokens stored only as SHA-256 hashes. Reset requests
  are generic and do not reveal account state; successful reset consumes the token and revokes existing
  refresh-token sessions for that user.

## Data Rules

- Store timestamps in UTC.
- Interpret business dates/times in the organization's timezone.
- Store durations in integer minutes.
- Store money in integer minor units for the organization's currency policy.
- Store management tokens only as hashes.
- Do not expose phone numbers, email addresses, child data, or internal notes publicly.
- Audit role changes, money changes, settings changes, imports, and admin corrections.

## Deployment

The current deployment target remains:

- Frontend: Vercel
- Backend: Render
- Database: Render PostgreSQL

Deployment configuration must stay customer-neutral. Environment variables may point to service URLs, but customer-specific names, colors, or settings belong in the database.
