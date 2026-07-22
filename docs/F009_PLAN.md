# F009 Attendance Plan

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
