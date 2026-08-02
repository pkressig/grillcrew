# Platform Feature Roadmap

This roadmap describes the commercial multi-organization SaaS platform. No feature may assume a single customer, a single club, or hardcoded branding.

## F001 Platform Core

**Goal**  
Build the multi-tenant foundation of the platform without authentication or business features.

**User stories**

- As a Platform Operator, I can provision the first organization as seed data.
- As a visitor, I can load a landing page branded from the resolved organization.
- As a developer, I have a reusable organization context architecture for all future features.

**Acceptance criteria**

- `Organization` is the tenant root.
- Organization display data, Theme, and public settings come from the database.
- `GET /api/public/organization` returns only public-safe organization information.
- Backend organization context resolves by custom domain, subdomain, URL path, and development override.
- Production never falls back to an arbitrary organization.
- Frontend has provider/hooks for organization context.
- The landing page renders organization branding from the backend.
- The seed organization is data only; application code remains organization-agnostic.
- No authentication, roles, users, volunteers, events, families, signup, work records, or payments are implemented.

**Dependencies**  
Existing technical foundation and deployment.

**Estimated complexity**  
High.

**Database impact**

- Extend `Organization` with slug, custom domain, language, currency, contact fields, and `themeId`.
- Add `Theme` for logo and colors.
- Add dedicated `OrganizationSettings` table for public-safe settings.
- Add unique constraints for slug and custom domain.
- Seed one initial organization.

**API impact**

- Add public organization metadata endpoint.
- Add organization context lookup service and middleware.

**UI impact**

- Add organization provider and hook.
- Replace hardcoded landing content with database-driven Theme and organization metadata.
- Use neutral platform fallbacks only when the backend is unavailable.

## F002 Authentication and Organization Permissions

**Goal**  
Provide secure access for platform operators, organization admins, staff, and later volunteer accounts.

**User stories**

- As a user, I can sign in securely.
- As a Platform Operator, I can access platform administration.
- As an Organization Admin, I can assign roles within my organization.
- As Staff, I only access permitted organization data.

**Acceptance criteria**

- Backend enforces authentication and authorization.
- Role checks include organization context.
- A user can have different roles across organizations.
- Protected endpoints reject unauthenticated and unauthorized requests.

**Dependencies**  
F001 Platform Core.

**Estimated complexity**  
High.

**Database impact**

- User table.
- StaffMembership table with organization role.
- Audit events for role changes.

**API impact**

- Auth/session endpoints.
- Current user and memberships endpoint.
- Role guard utilities.

**UI impact**

- Login flow.
- Organization switcher if user has multiple organizations.
- Role-aware navigation and forbidden states.

## F003 Seasons and Club Years

**Status**

Steps 1 through 3 are implemented. Step 4 adds visible, role-aware event and shift administration inside the organization admin planning panel, including creation, status actions, operational cards, and empty/error/success states. Public planning and signup remain deferred.

**Goal**  
Let each organization manage its own planning periods.

**User stories**

- As an Organization Admin, I can create a club year.
- As an Organization Admin, I can create seasons within a club year.
- As Staff, I can filter work by season.

**Acceptance criteria**

- Club years belong to one organization.
- Seasons belong to one club year.
- Season status transitions are validated.
- Closed seasons are protected from accidental edits.

**Dependencies**  
F001, F002.

**Estimated complexity**  
Medium.

**Database impact**

- ClubYear and Season tables with organization chain.

**API impact**

- Organization-scoped CRUD endpoints.
- Active/current season endpoint.

**UI impact**

- Season list and forms.
- Season selector.
- Visible event and shift admin cards and creation/status controls for `ADMIN` and `KOORDINATION`.
- Planung has four explicit subsections: Spielplan, Kiosk, Grill, and
  Vereinsjahr/Saisonverwaltung. The existing `/admin/planning` deep link remains the Spielplan;
  period creation and lifecycle controls live in the dedicated management subsection. Kiosk and
  Grill are labelled planned states until their own workflows are implemented.

## F004 Events

**Status**

Steps 1, 2, 2.1, 3, 3.1, and 4 are merged on `main`: the organization public route
presents upcoming published events and non-cancelled shifts through a public-safe API, visitors can
reserve an open place without an account, and ADMIN/KOORDINATION can see active occupancy plus
volunteer contact details in the authenticated planning cards. New volunteers receive a hashed-at-rest
personal management link where they can view their own submitted details and cancel before the
calendar-day deadline. Public contacts remain private and cancelled signups are excluded from active
occupancy.
ADMIN and KOORDINATION can also manually cancel an active signup from the planning card without
deleting its history; active admin/public occupancy and name projections update immediately.
Successful public signups also schedule an informational confirmation email containing an absolute
personal management link. Delivery failure does not affect the already reserved place, and the
public success UI continues to show the link immediately.

**Goal**  
Allow each organization to manage public events or operating days.

**User stories**

- As Staff, I can create events for a season.
- As Staff, I can publish, postpone, cancel, or complete events.
- As a volunteer, I see published events for the organization I opened.

**Acceptance criteria**

- Events are organization-scoped through season.
- Only published events appear publicly.
- Status values are approved English enum values.
- Internal notes are never public.

**Dependencies**  
F003 Seasons.

**Estimated complexity**  
Medium.

**Database impact**

- Event table.
- Event status and indexes.

**API impact**

- Event CRUD and public listing.
- Status transition validation.

**UI impact**

- Event admin list/calendar.
- Event forms.
- Public event list.

## F005 Shifts

**Goal**  
Define staffing slots for events.

**User stories**

- As Staff, I can add shifts to events.
- As Staff, I can set capacity, time, and notes.
- As a volunteer, I can see open places.

**Acceptance criteria**

- Shifts belong to organization-scoped events.
- Capacity display is calculated from active signups.
- Shift status supports open, closed, and cancelled.
- Public notes are separated from internal notes.

**Dependencies**  
F004 Events.

**Estimated complexity**  
Medium.

**Database impact**

- Shift table.
- Event foreign key and indexes.

**API impact**

- Shift CRUD.
- Public shift summary.

**UI impact**

- Shift editor.
- Public shift cards.
- Capacity indicators.

## F006 Volunteers

**Goal**  
Manage organization-local volunteer/person records.

**User stories**

- As Staff, I can search and edit volunteers in my organization.
- As Staff, I can review duplicates.
- As a volunteer, my public display consent applies to the organization.

**Acceptance criteria**

- Volunteers are not global across organizations.
- Contact data is normalized per organization.
- Public display consent is organization-specific.
- Name-only matching never auto-merges people.

**Dependencies**  
F001, F002.

**Estimated complexity**  
Medium.

**Database impact**

- Volunteer table with organizationId.
- Normalized contact indexes.

**API impact**

- Volunteer CRUD/search.
- Duplicate candidate endpoint.

**UI impact**

- Volunteer list/detail.
- Duplicate review.

## F007 Families and Requirements

**Goal**  
Support organization-local family accounts and volunteer-hour requirements.

**User stories**

- As Staff, I can create families and children.
- As Staff, I can link volunteers to families.
- As Staff, I can override requirements with a reason.

**Acceptance criteria**

- Families and children belong to one organization.
- Children are never public.
- Requirements are materialized and frozen per organization club year.
- Overrides are audited.

**Dependencies**  
F003 Seasons, F006 Volunteers.

**Estimated complexity**  
High.

**Database impact**

- Family, Child, FamilyMember, FamilyRequirement.

**API impact**

- Family CRUD.
- Requirement materialization and override endpoints.

**UI impact**

- Family list/detail.
- Child/member management.
- Fulfillment indicators.

## F008 Public Signup

**Goal**  
Allow volunteers to reserve shifts on an organization-specific public plan.

**User stories**

- As a volunteer, I can sign up without an account.
- As a volunteer, I immediately reserve a place.
- As Staff, I can see suspicious signups for my organization.

**Acceptance criteria**

- Signup is scoped to the resolved organization.
- Required contact and compensation fields are validated.
- Capacity cannot be overbooked.
- Anti-abuse thresholds come from organization settings.
- Management token is stored only as a hash.

**Dependencies**  
F005 Shifts, F006 Volunteers, F007 Families.

**Estimated complexity**  
High.

**Database impact**

- Signup table.
- Capacity and organization-consistency constraints.

**API impact**

- Public plan endpoint.
- Signup creation endpoint.
- Management link endpoints.

**UI impact**

- Branded public plan.
- Mobile signup form.
- Confirmation and management pages.

## F009 Attendance

**Status**

Steps 1 and 2 are merged on `main` through PRs #29 and #31. ADMIN and
KOORDINATION can update an active signup to any of the six approved attendance outcomes from the
existing planning shift card, and real changes create a tenant-scoped audit event with previous and new
outcome. The authenticated admin projection includes the outcome; public plan and signup projections
do not. Cancelled signups remain historical and cannot be marked through the attendance endpoint.

Step 3 (PKA-20, awaiting review) adds a "Handlungsbedarf Anwesenheit" section to the authenticated
planning panel. It surfaces active signups with `outcome = OPEN` whose `shift.ends_at <= now` (derived
on the frontend from the existing `AdminShiftResponse`). Staff can resolve items inline through the
existing attendance selector; a successful non-OPEN outcome immediately removes the entry from the
Handlungsbedarf list. An empty state confirms when no unresolved items remain. No schema migration,
no new backend endpoint, and no public-data changes were required.

Work records, compensation, credits, exports, reminders, replacement assignment, and public-flow
changes remain outside this feature.

**Goal**  
Track the outcome of organization-local signups.

**User stories**

- As Staff, I can mark attendance outcomes.
- As Staff, I can see unresolved past signups.

**Acceptance criteria**

- Outcome is stored on Signup.
- Outcome changes are audited.
- Work records are created only for actual work.

**Dependencies**  
F008 Public Signup.

**Estimated complexity**  
Medium.

**Database impact**

- Signup outcome usage.
- Audit events.

**API impact**

- Attendance update and unresolved-list endpoints.

**UI impact**

- Attendance review screen.
- Outcome controls.

## F010 Work Records

**Goal**  
Capture actual worked time, compensation type, and family credit.

**User stories**

- As a volunteer, I can submit actual time.
- As Staff, I can correct and confirm work records.
- As Staff, I can enter paper records.

**Acceptance criteria**

- Work records require a signup.
- Duration is stored in minutes.
- Work records are organization-consistent with signup, volunteer, shift, and family.
- Corrections are audited.

**Dependencies**  
F009 Attendance, F007 Families.

**Estimated complexity**  
High.

**Database impact**

- WorkRecord table and constraints.

**API impact**

- Submit, confirm, correct, and paper-entry endpoints.

**UI impact**

- Work completion form.
- Admin correction flow.

## F011 Payments

**Goal**  
Calculate, approve, and track organization-scoped payouts.

**User stories**

- As Admin, I can approve payouts.
- As Admin, I can mark payouts as paid.
- As Staff with read access, I can see payout summaries.

**Acceptance criteria**

- Amounts are stored in minor units.
- Rate is frozen at approval.
- Payment status is tracked.
- Payment data is organization-scoped.

**Dependencies**  
F010 Work Records.

**Estimated complexity**  
Medium.

**Database impact**

- Payment table.

**API impact**

- Payment queue, approve, mark-paid, summary endpoints.

**UI impact**

- Payment queue and controls.

## F012 Dashboard and Operational Tasks

**Goal**  
Give each organization an action-oriented operational dashboard.

**User stories**

- As Staff, I can see open places and urgent issues.
- As Admin, I can see missing attendance, missing family links, duplicates, and payouts.

**Acceptance criteria**

- Dashboard data is derived inside one organization.
- Sensitive data follows role permissions.
- Items link to the relevant management screen.

**Dependencies**  
F005, F008, F009, F010, F011.

**Estimated complexity**  
Medium.

**Database impact**

- No required new tables initially.

**API impact**

- Dashboard summary endpoint.

**UI impact**

- Organization dashboard.
- Action item lists.

## F013 Statistics, Reports, and Exports

**Goal**  
Provide organization-local reporting and exports.

**User stories**

- As Admin, I can export work, family, and payment data.
- As read-only leadership, I can see summaries without unnecessary personal data.

**Acceptance criteria**

- Reports are organization-scoped.
- Contact-data exports require explicit permission.
- Stored payment amounts are not recalculated during reporting.
- Export actions are auditable.

**Dependencies**  
F010 Work Records, F011 Payments, F007 Families.

**Estimated complexity**  
Medium to High.

**Database impact**

- Audit events for exports.
- Optional read models later.

**API impact**

- Statistics and export endpoints.

**UI impact**

- Statistics pages.
- Export controls.

## F014 Import and Onboarding Data Migration

**Goal**  
Import existing customer data into a specific organization without customer-specific code paths.

**User stories**

- As Platform Operator, I can import source files for one organization.
- As Admin, I can review duplicates and mappings.
- As Admin, I can see an import protocol.

**Acceptance criteria**

- Import batches are organization-scoped.
- Import logic treats customer files as data inputs, not hardcoded assumptions.
- Preview and validation run before commit.
- Import results are auditable.

**Dependencies**  
F001, F006, F007.

**Estimated complexity**  
High.

**Database impact**

- ImportBatch and staging records.

**API impact**

- Upload, preview, validate, commit, and report endpoints.

**UI impact**

- Import wizard.
- Duplicate review.
- Import result screen.

## F015 Grill Game-Plan Import and Crew-Size Configuration

**Status**

Phase 1 (Settings foundation) and Phase 2 (game-plan import) are merged on `main` (commits
`b1599202940a2898aa299651fcbebcf16b47063b` and `3757d1cf11c93e96772bbaa064a803032b30f36b`):
organization-scoped `HomeVenue` allowlist, ordered `CrewSizeRule` table, editable
`OrganizationSettings`, `ImportBatch`/`ImportRow` staging with a 5-way diff engine
(neu/geändert/verschoben/entfernt/unverändert), and the ADMIN-only "Einstellungen"/
"Spielplan-Import" admin views.

Phase 3 (shift crew-size suggestion) is implemented locally and passes full checks, but is not yet
committed/merged: `Shift` gained `shift_type` (`GRILL`/`KIOSK`), `assignment_mode`
(`OPEN_SIGNUP`/`FIXED_ASSIGNMENT`, both Kiosk-module preparation), `menu_type`, and
`crew_suggestion_overridden`. `SettingsService.suggest_crew_size` evaluates the organization's
crew-size rules against an event's team text; a new read-only
`GET /events/{event_id}/shift-suggestion` endpoint lets the Planning shift-creation form offer a
"Crew-Vorschlag übernehmen" pre-fill (menu + required griller count) that stays fully editable
before submit, matching the "never silently applied" decision. `create_shift`/`update_shift`
independently recompute the suggestion server-side to set `crew_suggestion_overridden` as
bookkeeping. **This is the point at which VolunteerSignup becomes fully replaceable** — import,
shift creation with a crew suggestion, and the existing open public signup flow now cover a full
season end to end. See D-041 for the ratified product direction and `ai/incoming/claude-latest.md`
for the implementation report.

All three phases were subsequently verified end-to-end against a local PostgreSQL instance and a
real browser session using the association's actual `Spielbetrieb - Kiosk.xlsx` export (season
2026/27, 171 rows): login, every admin surface, the settings/home-venue/crew-rule forms, the full
import → diff → confirm flow (123 `Event` rows created), and crew-suggestion shift creation all work
against real data. This verification surfaced and fixed two real-world parser gaps — `SpielTyp`
prefix matching for verbose tournament labels, and "keine" as an additional Spielnummer placeholder
alongside "Ohne" — documented in `docs/DATA_MODEL.md`'s `ImportRow` section.

Phase 4A (retroactive child assignment and per-signup compensation classification) is implemented:
`WorkRecord` (`docs/DATA_MODEL.md`) lets ADMIN/KOORDINATION retroactively assign an `ATTENDED` signup
to a `CHILD` family member (or leave it explicitly unassigned) and classify it as `WORK_HOURS`,
`VOLUNTARY`, or `PAYOUT`. `PAYOUT` computes and stores the amount from the organization's current
payout rate (commercial rounding, BR-003/D-028) and tracks `payoutStatus`
(`OPEN`/`APPROVED`/`PAID`, ADMIN-only to advance) plus a manual "Unterschrift erhalten" note
(timestamp and confirming staff member) in place of a digital signature, per D-041 point 8. The
Attendance admin view exposes this as a per-signup "Nachträgliche Zuordnung" control next to
completed entries; public pages remain unchanged. Coordination-time tracking, the season-end report,
and the Kiosk fixed-assignment module (Phases 5-6) remain planned per D-041 but not yet implemented.

**Goal**

Replace the manual Excel/WhatsApp/VolunteerSignup workflow for organizing grill (and later kiosk)
volunteer shifts with an organization-configurable, auditable pipeline: import the association's
home game schedule, suggest crew size/menu per shift, and let volunteers self-signup exactly as
today's public flow already supports.

**User stories**

- As Admin, I can configure which venues count as home venues for catering and which team-name
  patterns suggest which menu/crew size.
- As Koordination, I can import the season's game plan, review a diff before anything changes, and
  decide per game whether it needs a grill shift.
- As Koordination, I get an editable crew-size/menu suggestion when creating a shift instead of
  guessing from scratch.

**Acceptance criteria**

- Home venues and crew-size rules are organization-scoped, editable only by ADMIN.
- Import never silently overwrites a coordinator's manual edits or auto-moves a shift on a game
  reschedule.
- Crew-size suggestions are always shown as editable, never silently applied.

**Dependencies**

F003 Seasons, F004 Events, F005 Shifts.

**Estimated complexity**

High (multi-phase).

**Database impact**

- `home_venue`, `crew_size_rule` (Phase 1, implemented).
- `import_batch`, `import_row`, `event.kickoff_time`/`external_game_number`/`import_match_key`
  (Phase 2, implemented). `import_row.season_id` was added during implementation (not in the
  original design note) so `confirm()` never has to re-derive a season from sheet-tab text.
- `shift.shift_type`/`assignment_mode`/`menu_type`/`crew_suggestion_overridden` (Phase 3,
  implemented).
- `work_record` (Phase 4A, implemented; see `docs/DATA_MODEL.md` for the exact field set and
  invariants). A dedicated `payment` table and `coordination_time_entry` (Phase 5) remain planned.

**API impact**

- `GET/PATCH /api/admin/{org}/settings/organization-settings`,
  `GET/POST/PATCH /api/admin/{org}/settings/home-venues`,
  `GET/POST/PATCH /api/admin/{org}/settings/crew-size-rules`,
  `POST /api/admin/{org}/settings/crew-size-rules/reorder` (Phase 1, implemented).
- `POST /api/admin/{org}/imports` (multipart upload), `GET /api/admin/{org}/imports/{id}/rows`,
  `PATCH /api/admin/{org}/imports/{id}/rows/{row_id}`, `POST /api/admin/{org}/imports/{id}/confirm`
  (Phase 2, implemented, ADMIN-only).
- `GET /api/admin/{org}/events/{event_id}/shift-suggestion` (Phase 3, implemented, read-only,
  ADMIN-or-KOORDINATION per the existing planning guard).
- `GET/PATCH /api/admin/{org}/signups/{signup_id}/work-record` (Phase 4A, implemented,
  ADMIN-or-KOORDINATION) and `PATCH .../work-record/payout-status` (Phase 4A, implemented,
  ADMIN-only). `GET /api/admin/{org}/families/children` (Phase 4A, implemented,
  ADMIN-or-KOORDINATION) lists active `CHILD` family members for the assignment control.

**UI impact**

- New ADMIN-only "Einstellungen" admin view (implemented): organization settings form, home-venue
  list with create/deactivate, crew-size rule ordered list with create/reorder/deactivate and a
  visually distinct default rule.
- New ADMIN-only "Spielplan-Import" admin view (implemented): club-year-scoped file upload, diff
  review grouped by classification (unchanged rows collapsed behind a disclosure), per-row
  include/grill-shift controls, verschoben-acknowledgement action, and a confirmation-gated
  "Import übernehmen" action. Import review adds a classification-count stat row (reusing the new
  shared `StatSummary` component, extracted from the Overview dashboard).
- Shift-creation crew-size suggestion wiring (Phase 3, implemented): "Crew-Vorschlag übernehmen"
  pre-fills menu/required-griller-count, fully editable before submit; a menu-type badge appears
  on shift cards once set.
- Retroactive assignment/classification control on the Attendance admin view (Phase 4A,
  implemented): a per-signup "Nachträgliche Zuordnung" disclosure next to completed (`ATTENDED`)
  entries offers compensation-type, child-assignment, and duration fields; `PAYOUT` shows the
  computed amount and status, with an ADMIN-only control to advance `payoutStatus` and record the
  manual signature-received note.

## Recommended Implementation Order

1. F001 Platform Core
2. F002 Authentication and Organization Permissions
3. F003 Seasons and Club Years
4. F004 Events
5. F005 Shifts
6. F006 Volunteers
7. F007 Families and Requirements
8. F008 Public Signup
9. F009 Attendance
10. F010 Work Records
11. F011 Payments
12. F012 Dashboard and Operational Tasks
13. F013 Statistics, Reports, and Exports
14. F014 Import and Onboarding Data Migration
15. F015 Grill Game-Plan Import and Crew-Size Configuration

F001 comes first because every future feature depends on a trustworthy organization context, database-driven branding, and tenant-safe data model. Authentication starts only after the tenant boundary exists.

# F015 Phase 4B - Koordinationszeit

- ADMIN kann private Koordinationszeit in den Einstellungen erfassen, bearbeiten und auf
  `OPEN`, `APPROVED`, `PAID` fortschalten.
- Der eigene Stundensatz und der pro Eintrag gerundete Betrag bleiben getrennt von Helfer-
  WorkRecords, Anmeldungen, Kiosk-Zuteilungen und oeffentlichen Kennzahlen.
- Schreibzugriffe sind tenant-gebunden und durch ADMIN-Rolle, Origin/Host-Pruefung und CSRF
  geschuetzt; unveraenderte Wiederholungen erzeugen weder Commit noch Audit-Ereignis.

## Planning-period administration

ADMIN and KOORDINATION can correct labels/names and date ranges, close or archive periods, and explicitly delete never-used drafts. Closed/archived periods stay visible and labelled in history but are disabled for imports and new planning records. Conflicts are reported in German without changing existing data.
## Kiosk- und Grillplanung – Phase 1

The external Kiosk-plan comparison lets ADMIN and KOORDINATION upload the historical matrix workbook
as a separate review dataset. The Kiosk view separates the Spielbetrieb proposal, imported workbook,
and difference/status; the Grill view uses the same verified, missing, or manually overridden state.
Rows can be explicitly acknowledged or overridden. This workflow never creates or changes proposals,
confirmed shifts, public signups, or Spielbetrieb data.

Die privaten Planungsansichten zeigen transparente Vorschläge aus dem Spielbetrieb. Kiosk gruppiert Heimspiele in Tagesfenster, zeigt Abdeckung und Teilungsgrund und erlaubt manuelle Zeit-/Öffnungsanpassungen. Grill zeigt nur offene Kioskfenster, Crew-Regel-Kontext und änderbare Grillbedarfs-/Platzvorschläge. Vorschläge bleiben sichtbar von bestätigten Schichten und öffentlichen Anmeldungen getrennt.
