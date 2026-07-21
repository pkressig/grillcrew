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
hashed management links and self-service cancellation, confirmation/reminder emails, and admin
volunteer/signup management remain deferred to later steps.

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
