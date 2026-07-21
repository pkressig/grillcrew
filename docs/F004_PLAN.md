# F004 Public Volunteer Entry Plan

## Step 1 — Public read-only event and shift plan

Status: implemented locally, awaiting independent architecture/security and UX review.

The organization route `/{organization_slug}` now leads directly to a mobile-first public plan. It shows upcoming `PUBLISHED` events and their non-cancelled shifts, organization branding, dates, times, locations, public descriptions/notes, required capacity, and the currently occupied count. Occupancy is explicitly `0` until signup records exist.

The unauthenticated `GET /api/public/{organization_slug}/plan` endpoint resolves the organization through the established public organization convention and returns 404 when it cannot resolve a tenant. Queries are scoped through club year and season to the resolved organization and ordered by event date/id and shift sort order/start/id.

Public responses do not contain internal notes, source-import/publication metadata, organization/season/event parent IDs, user or membership IDs, contact details, child data, or any signup/person data. Draft and other non-published events and cancelled shifts are excluded.

### Deferred

Creating or managing volunteer signups, volunteer/family models, real occupied-capacity calculation, full-shift waiting lists, contact collection, confirmation/management links, anti-abuse controls, notifications, and email behavior remain deferred. The visible “Bald eintragen” action is disabled and cannot submit anything.
