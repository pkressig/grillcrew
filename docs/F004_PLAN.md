# F004 Public Volunteer Entry Plan

## Step 1 — Public read-only event and shift plan

Status: completed.

The organization route `/{organization_slug}` now leads directly to a mobile-first public plan. It shows upcoming `PUBLISHED` events and their non-cancelled shifts, organization branding, dates, times, locations, public descriptions/notes, required capacity, and the currently occupied count. Occupancy is explicitly `0` until signup records exist.

The unauthenticated `GET /api/public/{organization_slug}/plan` endpoint resolves the organization through the established public organization convention and returns 404 when it cannot resolve a tenant. Queries are scoped through club year and season to the resolved organization and ordered by event date/id and shift sort order/start/id.

Public responses do not contain internal notes, source-import/publication metadata, organization/season/event parent IDs, user or membership IDs, contact details, child data, or any signup/person data. Draft and other non-published events and cancelled shifts are excluded.

## Step 2 — Public signup with immediate reservation

Status: implemented locally, awaiting independent architecture/security and UX review.

Visitors submit the required name and contact fields plus explicit public-name consent at
`POST /api/public/{organization_slug}/shifts/{shift_id}/signups`. A successful request immediately
creates an organization-local volunteer and active signup. The shift row is locked while capacity
and duplicate-contact rules are checked.

The public plan counts active signups and exposes only their public-name snapshots. Honeypot
submissions receive generic success without a write; submissions faster than two seconds and
rate-limited IP/contact buckets receive `429`.

### Deferred

Family/Sollstunden assignment, final compensation-type confirmation, full-shift waiting lists,
confirmation/reminder emails and admin volunteer/signup management remain deferred to later steps.

## Step 2.1 — Admin signup visibility

Status: implemented locally, awaiting independent architecture/security and UX review.

The authenticated admin planning shift response for `ADMIN` and `KOORDINATION` includes active
occupancy, remaining places, and a compact signup summary with volunteer name, phone number, email
address, and signup timestamp. The admin planning cards show these details with tappable phone and
email links. Cancelled signups are excluded and ordering is deterministic by signup creation time
and ID.

The public plan and public signup responses remain separate schemas and never expose phone or email.
The editable planning endpoint remains unavailable to `KIOSK` and `VORSTAND_LESEN`; no separate
KIOSK operational view is introduced in this step.

### Deferred

Signup editing or cancellation, attendance and work records, family/Sollstunden assignment,
compensation, management links, notifications, and a separate event-related KIOSK staff view remain
deferred.

## Step 3 — Personal management link and volunteer self-cancellation

Status: implemented locally, awaiting independent architecture/security and UX review.

Each new public signup receives a cryptographically random management token. Only its SHA-256 hash
is stored; the raw token is returned once in the signup response as the organization-aware frontend
route `/{organization_slug}/manage-signup/{token}`. Existing signups without a hash are intentionally
not manageable through this flow.

The unauthenticated, bearer-token endpoints are:

- `GET /api/public/{organization_slug}/signups/manage/{token}`
- `POST /api/public/{organization_slug}/signups/manage/{token}/cancel`

Lookup is scoped through signup, shift, event, season, and club year to the resolved organization.
The token-holder projection includes the submitted contact details, but excludes token hashes,
internal notes, child/family data, and audit data. Public-plan projections remain contact-free.

Self-cancellation is allowed through 23:59:59 in the organization timezone on the calendar day eight
days before the local shift date. The API returns the concrete deadline, `can_cancel`, and friendly
coordination guidance after the deadline. Successful cancellation records
`CANCELLED_BY_VOLUNTEER`, `cancelledAt`, and the self-service source without deleting the row.
Repeated self-cancellation is idempotent. Active-only public/admin occupancy and name lists therefore
update automatically after cancellation.

### Deferred

Confirmation/reminder email delivery, editing submitted contact/name data, admin manual cancellation,
family/Sollstunden assignment, compensation, attendance, and work records remain deferred.

## Step 3.1 — Admin manual signup cancellation

Status: implemented locally, awaiting independent architecture/security and UX review.

`ADMIN` and `KOORDINATION` can cancel an active signup from its row in the authenticated planning
card. The guarded `POST /api/admin/{organization_slug}/signups/{signup_id}/cancel` write uses the
existing origin/host and CSRF validation and scopes signup lookup through shift, event, season, club
year, and organization. It records `CANCELLED_BY_ADMIN`, `cancelledAt`, and the stable reason
`ADMIN_MANUAL` without deleting the signup or volunteer.

Repeating an admin cancellation is idempotent and preserves its original metadata. A signup already
cancelled by the volunteer is not overwritten and returns a conflict. Active-only admin and public
projections immediately remove the signup and release its occupied place; the personal management
link continues to show the resulting cancelled state.

### Deferred

Full audit-log events, rebooking, replacement assignment, contact editing, notifications, attendance,
work records, and KIOSK-specific actions remain deferred.

## Step 4 — Signup confirmation email

Status: implemented locally, awaiting independent architecture/security and UX review.

After a public signup has reserved its place and committed successfully, the API schedules exactly
one informational confirmation email with FastAPI background tasks. The existing provider-neutral
`EmailSender` delivers a German confirmation containing the organization, event/type, organization-
local date and shift times, public volunteer name, public plan URL, and absolute personal management
URL. The message asks the volunteer to save that link and explains that phone and email are visible
only to authorized staff.

The raw management token exists only in the one-time signup response and email body; it is not added
to persisted rows, public/admin projections, or logs. Sender configuration and delivery failures are
logged with safe metadata and never change the successful signup response or roll back its immediate
reservation. `FRONTEND_PUBLIC_URL` supplies the absolute frontend origin and defaults safely to
`http://localhost:3000` for local development.

### Deferred

Reminder and cancellation emails, resend controls, admin notifications, delivery-status tracking,
queues/workers, provider-specific email features, and HTML templates remain deferred.
