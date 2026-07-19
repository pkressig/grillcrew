# F003 Seasons and Club Years Plan

## Step 1 — Backend foundation

Status: implemented and merged.

This step adds organization-owned club years and seasons without frontend or public planning APIs.

### Domain rules

- Club years are directly scoped by `organization_id`; seasons inherit tenant scope through their club year.
- Both entities use `DRAFT`, `ACTIVE`, `CLOSED`, and `ARCHIVED`.
- Allowed transitions are DRAFT to ACTIVE/CLOSED/ARCHIVED, ACTIVE to CLOSED, and CLOSED to ARCHIVED. ARCHIVED is terminal.
- Date ranges are inclusive and must be valid. Seasons must remain inside their club-year range.
- Closed and archived seasons reject field edits; a closed season may only transition to archived.
- The current season is the active season whose inclusive date range contains the current server date. No match returns 404.

### Access and API

All endpoints use authenticated organization context and require `ADMIN` or `KOORDINATION`. URL slugs are checked against the resolved membership organization. Client payloads contain no organization identifier.

Endpoints:

- `GET/POST /api/admin/{organization_slug}/club-years`
- `GET/PATCH /api/admin/{organization_slug}/club-years/{club_year_id}`
- `GET /api/admin/{organization_slug}/seasons`
- `POST /api/admin/{organization_slug}/club-years/{club_year_id}/seasons`
- `PATCH /api/admin/{organization_slug}/seasons/{season_id}`
- `GET /api/admin/{organization_slug}/seasons/current`

### Deferred

Public season APIs, events, shifts, and broader season selectors belong to later steps/features.

## Step 2 — Visible admin UI

Status: implemented, awaiting Claude and AGY review.

The organization admin area now lists club years and seasons, shows the current season, creates both record types, and exposes valid season lifecycle actions. The UI is mobile-first, uses German labels, and includes loading, error, empty, and success states.

Only `ADMIN` and `KOORDINATION` receive planning API requests and management controls. `KIOSK` and `VORSTAND_LESEN` receive a simple no-permission state; backend authorization remains authoritative.

All requests are scoped by the route organization slug. Writes include cookie credentials and the existing double-submit CSRF header when available.
