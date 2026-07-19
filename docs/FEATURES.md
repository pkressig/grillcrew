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

Steps 1 and 2 implemented: backend foundation and organization admin planning UI; independent review remains pending.

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

## F004 Events

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

F001 comes first because every future feature depends on a trustworthy organization context, database-driven branding, and tenant-safe data model. Authentication starts only after the tenant boundary exists.
