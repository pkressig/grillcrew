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

## Step 3 — Events and shifts backend foundation

Status: implemented locally, awaiting independent review.

This step adds tenant-scoped Event and Shift persistence and authenticated admin management APIs. Event dates must fall inside their season; shift times must be ordered, remain on the event date, and require a positive volunteer count.

### Admin endpoints

- `GET/POST /api/admin/{organization_slug}/seasons/{season_id}/events`
- `PATCH /api/admin/{organization_slug}/events/{event_id}`
- `GET/POST /api/admin/{organization_slug}/events/{event_id}/shifts`
- `PATCH /api/admin/{organization_slug}/shifts/{shift_id}`

### Deferred

Public planning and signup, volunteer/family/capacity behavior, imports, and notifications remain deferred to their planned features or later F003 steps.

All requests are scoped by the route organization slug. Writes include cookie credentials and the existing double-submit CSRF header when available.

## Step 4 — Event and shift admin UI

Status: implemented locally, awaiting independent code/security and UX review.

The existing organization admin planning panel now loads events for each listed season and shifts for each listed event. `ADMIN` and `KOORDINATION` can create events and shifts, review operational details in mobile-first cards, and apply supported status changes with confirmation for cancellation and completion. Human-readable German labels, loading/error/success feedback, and explicit empty states are included.

The frontend API client uses the Step 3 organization-scoped endpoints, cookie credentials, JSON content type, and the existing CSRF helper for writes. `KIOSK` and `VORSTAND_LESEN` do not mount the planning panel and therefore make no event or shift requests.

### Deferred

Public event pages and signup, volunteer/family/work/payment records, capacity calculations from signups, imports, notifications, calendar presentation, and full inline editing of event or shift fields remain deferred. Step 4 supports creation and operational status editing only.
