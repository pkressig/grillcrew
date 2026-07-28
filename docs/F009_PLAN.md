# F009 Attendance Plan

## Status

Step 1 was merged to `main` in PR #29. The independent Claude architecture/security review and AGY
product/UX review are complete. Step 2 was merged in PR #31 through PKA-15: ADMIN and KOORDINATION can
set any of the six approved `Signup.outcome` values on active signups, and real outcome changes create
a same-transaction `AuditEvent`. Codex, Claude, AGY, the Product Owner, and ChatGPT approved PKA-15,
and GitHub CI passed before merge.

## Step 1 — Attendance outcome foundation

Step 1 reuses the approved `Signup.outcome` enum and database column introduced with the signup
foundation. `OPEN` is the default. ADMIN and KOORDINATION can set an active signup to `OPEN`,
`ATTENDED`, `EXCUSED_CANCELLED`, or `NO_SHOW` from the existing admin planning shift card.

The write endpoint is cookie-authenticated, Origin/Host-validated, CSRF-protected, and tenant-scoped
through Signup → Shift → Event → Season → ClubYear → Organization. Missing and cross-tenant records
use the generic planning 404. Cancelled signups return a conflict, and repeated writes of the current
outcome are idempotent.

Attendance is included only in the authenticated `AdminSignupResponse`; public projections remain
unchanged. This step creates no work record and has no effect on worked time, family credit,
compensation, payments, exports, reminders, or email notifications. Detailed audit history,
unresolved-attendance lists, and the remaining approved outcome workflows are deferred to later F009
steps.

## Step 2 - Full attendance outcomes and audit trail

Step 2 completes the approved D-019 outcome set for active signups. The same authenticated attendance
endpoint now accepts exactly `OPEN`, `ATTENDED`, `EXCUSED_CANCELLED`, `LATE_CANCELLED`, `NO_SHOW`, and
`SUBSTITUTE_ORGANIZED`; request payloads still reject unknown or extra fields before service mutation.
ADMIN and KOORDINATION can choose all six German-labelled values from the existing planning card.

Each real outcome change writes one `AuditEvent` in the same database transaction as the signup update:
`action = ATTENDANCE_OUTCOME_CHANGED`, `entity_type = signup`, `entity_id = signup.id`, the resolved
`organization_id`, the authenticated actor user id, and metadata containing only `previous_outcome` and
`new_outcome`. Repeating the current value remains idempotent and creates no audit event.

`SUBSTITUTE_ORGANIZED` records only the original signup outcome. Step 2 does not create or link a
replacement person, does not assign a replacement signup, does not create WorkRecords, and does not
change public signup or public plan projections.

## Step 3 — Unresolved attendance Handlungsbedarf

Step 3 surfaces active signups with `outcome = OPEN` whose shift has already ended as operational
Handlungsbedarf for ADMIN and KOORDINATION. The definition of unresolved: the signup is active (not
cancelled), `outcome` is `OPEN`, and `shift.ends_at <= now` (UTC instant comparison using the
timezone-aware timestamps already present in `AdminShiftResponse`).

A dedicated "Handlungsbedarf Anwesenheit" section appears at the top of the authenticated planning
panel, above the error and success banners. When no unresolved items exist the section shows a clear
non-alarming German empty state. When items exist each entry displays the helper name, event title,
and shift time range alongside an attendance selector that offers only the five non-OPEN outcomes.
A badge on the section heading counts open items.

The derivation is entirely frontend-side: the existing `AdminShiftResponse` already provides
`ends_at`, the complete active-signup list with `outcome`, and the parent event title through the
loaded `events` state. No backend endpoint was added or modified; the existing PATCH attendance
endpoint and `refresh()` cycle handle resolution automatically — a successful non-OPEN outcome
removes that signup from the Handlungsbedarf list after refresh without a full reload.

Cancelled signups remain excluded from the shift response (existing backend filter unchanged).
Public projections, public responses, and all security boundaries are unchanged. No schema
migration was required or introduced.
