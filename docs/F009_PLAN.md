# F009 Attendance Plan

## Status

Step 1 was merged to `main` in PR #29. The independent Claude architecture/security review and AGY
product/UX review are complete. The two AGY findings on stored `LATE_CANCELLED` or
`SUBSTITUTE_ORGANIZED` representation and cancelled-confirmation selector synchronization were triaged
as objective Step 1 defects. PKA-12 implements the bounded local correction and has passed repeated
Claude, AGY, and Product Owner review; it does not add deferred attendance workflows. Git release
actions remain separately gated. PKA-14 additionally enforces the same four-outcome Step 1 write
boundary in server-side request validation while preserving read/display support for all six stored
enum values; Codex, Claude, AGY, and the Product Owner approved the correction.

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
