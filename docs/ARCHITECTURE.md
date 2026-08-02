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

The organization-scoped active-family list derives child and helper counts with one aggregate query;
member names and volunteer links remain available only through the authenticated family detail APIs.

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

Public planning follows the same resolution convention at `GET /api/public/{organization_slug}/plan`.
The response is an explicit public-safe projection: it is tenant-filtered through club year and season,
includes only upcoming published events and non-cancelled shifts, and never serializes internal notes,
contact/person data, parent tenant identifiers, or staff-only metadata.

Public signup uses `POST /api/public/{organization_slug}/shifts/{shift_id}/signups`. It is tokenless
and therefore does not use cookie CSRF protection. The backend resolves the tenant, applies a
honeypot, minimum-fill-time and IP/contact rate limits, and locks the shift row while checking active
capacity. Public responses contain only a public-name snapshot and capacity, never contact data.

Public signup management uses bearer tokens at
`GET /api/public/{organization_slug}/signups/manage/{token}` and its `/cancel` POST companion. Tokens
are high-entropy values stored only as SHA-256 hashes and are scoped through the planning hierarchy to
the resolved organization. These endpoints do not use cookie authentication or cookie CSRF; possession
of the token is the authorization proof. Only this token-holder projection may return the volunteer's
submitted contact details. Unknown, legacy tokenless, and cross-tenant lookups return the same generic
not-found response.

Authenticated attendance updates use
`PATCH /api/admin/{organization_slug}/signups/{signup_id}/attendance`. The endpoint requires ADMIN or
KOORDINATION membership, Origin/Host and CSRF validation, and resolves the signup through Shift →
Event → Season → ClubYear → Organization. It accepts the six stored `Signup.outcome` values for
active signups. Real changes write one same-transaction tenant-scoped `AuditEvent` with the actor user
id, signup id, previous outcome, and new outcome; idempotent repeats do not audit. Attendance outcomes
appear in admin planning projections only and never in public plan or signup responses.

Authenticated organization settings administration (D-041) uses
`/api/admin/{organization_slug}/settings/...`: `GET/PATCH organization-settings`,
`GET/POST/PATCH home-venues`, and `GET/POST/PATCH crew-size-rules` plus
`POST crew-size-rules/reorder`. Every endpoint requires ADMIN membership specifically (not
KOORDINATION), matching `docs/PERMISSIONS.md`'s "Organisationseinstellungen verwalten" row, and
write endpoints validate CSRF and Origin/Host like every other admin mutation. Home venues are
soft-deactivated (`is_active`), never hard-deleted, so historical import/event references stay
valid. Crew-size rules always include one non-deletable default rule (`pattern = null`) evaluated
last regardless of stored `sort_order`, guaranteeing a crew-size suggestion always exists.

Authenticated game-plan import (F015 Phase 2, D-041) uses `/api/admin/{organization_slug}/imports`:
`POST` (multipart upload of the association's Heimspielplan xlsx plus a target `club_year_id`),
`GET {batch_id}/rows`, `PATCH {batch_id}/rows/{row_id}`, and `POST {batch_id}/confirm`. Every
endpoint requires ADMIN membership specifically, matching `docs/PERMISSIONS.md`'s "Import aus
Bestandsdaten ausführen" row. Parsing is pure and side-effect-free
(`app.services.game_plan_parser`); resolving sheets to seasons, matching against the `HomeVenue`
allowlist, and diffing against existing `Event` rows all happen in `app.services.imports` and are
staged as `ImportRow` records before any `Event` write. Re-import matching uses
`Event.import_match_key` (the association's `Spielnummer` when present, otherwise normalized teams
+ date); a duplicate key within one upload aborts the whole batch rather than guessing a match.
Confirming a batch writes `Event` rows only for `INCLUDE`-decided rows classified `NEU` (create,
`status=DRAFT`) or `GEAENDERT` (update `location`/`event_type`/`kickoff_time`/`title` only; a
changed `remark` is appended to `internal_note` as a dated note, never overwritten). Rows
classified `VERSCHOBEN` (rescheduled) or `ENTFERNT` (removed from the source) never trigger an
automatic `Event` write — the coordinator reviews and acts manually, since a reschedule requires
contacting already-signed-up helpers outside the app. Confirming is idempotent-guarded: a batch can
only be confirmed once (`ImportBatchStatus.STAGED -> CONFIRMED`).

Retroactive child assignment and compensation classification (F015 Phase 4A, D-041 points 6 and 8)
uses `/api/admin/{organization_slug}/signups/{signup_id}/work-record`:
`GET`/`PATCH` (ADMIN-or-KOORDINATION, the existing planning guard) and
`PATCH .../work-record/payout-status` (ADMIN-only, matching `docs/PERMISSIONS.md`'s "Auszahlungen
freigeben oder als bezahlt markieren" row). Both live in `app.api.planning` alongside the attendance
endpoint since they operate on the same `Signup` resource; `app.services.work_record.WorkRecordService`
resolves the signup through the same `Shift → Event → Season → ClubYear → Organization` tenant chain
as `PlanningService`. `PATCH .../work-record` requires the signup to be `status = ACTIVE` and
`outcome = ATTENDED`, validates an optional `credited_family_member_id` against a `CHILD`-type
`FamilyMember` in the same organization (`GET /api/admin/{organization_slug}/families/children` in
`app.api.families` lists candidates), and is idempotent (a repeat with unchanged fields does not
commit or audit). For `compensation_type = PAYOUT` it snapshots the current
`OrganizationSettings.payout_rate_minor_per_hour`, computes the amount with commercial rounding
(BR-003/D-028), and defaults `payout_status` to `OPEN`; classification is rejected once
`payout_status` has advanced past `OPEN`, so further changes go through the ADMIN-only endpoint.
`PATCH .../work-record/payout-status` only allows the forward transitions `OPEN → APPROVED → PAID`
and optionally records the D-041 point 8 manual "Unterschrift erhalten" note (`signature_received_at`,
`signature_confirmed_by_user_id`) instead of a digital signature. Both endpoints write one
same-transaction tenant-scoped `AuditEvent` (`WORK_RECORD_CLASSIFIED` /
`WORK_RECORD_PAYOUT_STATUS_CHANGED`) per real change. Public plan, public signup, and attendance
outcome responses are unchanged; work-record data never appears outside these authenticated admin
endpoints.

Shift crew-size suggestion (F015 Phase 3, D-041) uses
`GET /api/admin/{organization_slug}/events/{event_id}/shift-suggestion`, gated by the existing
KOORDINATION-or-ADMIN planning guard (read-only, no write). `SettingsService.suggest_crew_size`
evaluates the organization's active `CrewSizeRule` rows in `_ordered_rules()` order (the
non-deletable default rule always last, regardless of stored `sort_order`) against the event's
team text, first match wins. `PlanningService.create_shift`/`update_shift` independently
recompute the same suggestion server-side and set `Shift.crew_suggestion_overridden` by comparing
it against the submitted `menu_type`/`required_volunteers` — this is bookkeeping only, never a
different write path or a rejected submission; the coordinator's chosen values always win. `Shift`
also gained `shift_type` (`GRILL`/`KIOSK`) and `assignment_mode` (`OPEN_SIGNUP`/`FIXED_ASSIGNMENT`),
both defaulted for the existing Grill/open-signup behavior and otherwise unused until the Kiosk
module (F015 Phase 6) is built — added now rather than later to avoid a second migration and
backfill once Phase 4/5 code already depends on `Shift`.

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
- The `HttpOnly` refresh cookie is scoped to `Path=/api` so both auth endpoints and authenticated
  admin writes can validate the signed CSRF token against the current refresh-token family. This
  deliberately exposes the cookie to all backend API paths, but not frontend/non-API paths; API
  authorization, Origin validation, and the family-bound CSRF header remain mandatory. Because the
  path is part of a cookie's browser-side identity, login, refresh, and logout also explicitly clear
  any leftover refresh cookie at the previous `Path=/api/auth` scope, so sessions issued before this
  path migration do not leave an inert cookie sitting in the browser until its original expiry.
- Rate limits for login, refresh, password reset, and invitation acceptance are platform-wide,
  environment-configured, and set independently per action (D-038).
- Password reset uses opaque high-entropy bearer tokens stored only as SHA-256 hashes. Reset requests
  are generic and do not reveal account state; successful reset consumes the token and revokes existing
  refresh-token sessions for that user.
- Staff invitations use the same hashed-at-rest bearer-token pattern and deferred provider-agnostic
  email transport. Only a database-authorized organization ADMIN can issue an invitation; accepting
  it derives the tenant, user, and role from the single-use invitation row rather than client input,
  and only then creates or activates the `StaffMembership`.
- The root frontend `AuthProvider` loads `GET /api/auth/me` with credentials and keeps only the safe
  user/membership response in memory. It never reads or persists access/refresh cookies. The readable
  `gc_csrf` cookie is echoed as `X-CSRF-Token` for cookie-authenticated state changes. Protected
  organization admin routes derive access from the membership matching the URL slug; switching
  organizations is URL navigation, not separate client session state.

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
# Private Koordinationszeit

Die Route `/api/admin/{organization_slug}/coordination-time-records` ist ein eigener ADMIN-only
Trust Boundary. Jeder Read und Write wird serverseitig auf die aktuelle Organisation begrenzt;
fremde IDs werden nicht aufgeloest. Writes verlangen zusaetzlich CSRF sowie gueltigen Origin/Host.
Das Modul besitzt Model, Schema, Service und API getrennt vom Signup-/Planning-Modul und wird von
keiner oeffentlichen Route oder Helfer-API importiert. Audit-Ereignisse werden in derselben
Transaktion wie die fachliche Aenderung geschrieben.
## Planning lifecycle boundary

Planning mutations remain behind staff-role, tenant, CSRF, and origin checks. The service layer validates transitions and dependencies atomically and writes audit events for update/delete lifecycle mutations. Import and creation services independently reject closed/archived targets, so UI filtering is not a security boundary.
