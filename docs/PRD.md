# Product Requirements Document

## 1. Product

The product is a commercial SaaS platform for organizing volunteer work across multiple organizations. Each organization has its own data, branding, settings, permissions, planning, people, families, signups, work records, payments, and reports.

The first production customer is only the first organization on the platform. It must not be hardcoded in code, configuration, UI copy, API behavior, tests, or seed data.

The first production-ready version focuses on volunteer staffing for grill, kiosk, match-day, and similar organization-run shifts. The platform remains extensible for additional volunteer work types.

## 2. Problem

Organizations often coordinate volunteer work through spreadsheets, sign-up tools, messaging apps, paper lists, and manual payment or requirement calculations. This causes:

- duplicated data entry
- inconsistent contact data
- unclear open shift coverage
- manual rework after schedule changes
- fragile family or requirement accounting
- manual payout calculations
- limited auditability
- weak data protection boundaries between public and staff-only information

## 3. Target Groups

### Platform Operator

Runs the SaaS platform, provisions organizations, supports onboarding, monitors operations, and manages commercial platform concerns.

### Organization Admin

Owns one organization's setup, branding, roles, seasons, planning, corrections, imports, exports, and reports.

### Organization Staff

Coordinates operational work inside one organization. Staff roles are scoped to that organization and expose only the required data.

### Volunteer

Signs up for shifts, optionally manages personal assignments, and may contribute work toward a family or other organization-specific requirement.

## 4. Core Flow

1. Platform Operator provisions an organization or an Organization Admin completes onboarding.
2. Organization Admin configures branding, settings, roles, seasons, and public signup behavior.
3. Organization Admin creates events and shifts.
4. Organization Admin publishes the public plan.
5. Volunteers open the organization's public plan through its domain, subdomain, slug, or other resolved route.
6. Volunteers sign up without an account and receive a management link.
7. Organization Staff tracks attendance and operational issues.
8. Volunteers or Admin submit actual worked time.
9. Admin confirms work records, family credits, and payouts.
10. Organization reports, statistics, and exports are generated within the organization boundary.

## 5. Version-1 Platform Features

### 5.1 Organization Tenancy

- multiple organizations on one platform
- strict data isolation by organization
- organization-local roles and permissions
- organization-local volunteers, families, seasons, events, shifts, signups, work records, payments, and exports
- no hardcoded organization names

### 5.2 Organization Branding and Settings

- display name, short name, slug, locale, timezone, language, currency
- Theme-driven logo and colors
- public-safe organization and Theme endpoint
- admin settings for rates, anti-abuse thresholds, coordination contacts, and public signup behavior
- Theme and settings loaded from the database before rendering organization-specific pages

### 5.3 Authentication and Permissions

- platform operator access
- organization admin access
- organization staff roles
- optional volunteer account later
- backend-enforced permission guards
- one user may have different roles in different organizations

### 5.4 Seasons and Planning

- organization-owned club years and seasons
- status-based planning lifecycle
- organization-owned events and shifts
- public/private notes
- publication controls

### 5.5 Public Plan and Signup

- public organization-specific plan
- open shift display
- signup without account
- immediate place reservation
- contact and compensation choice
- organization-specific anti-abuse controls
- hashed management links
- no public contact data

### 5.6 Volunteers and Families

- organization-owned volunteer records
- normalized contact data per organization
- public display consent per organization
- organization-owned families, children, family members, and requirements
- children never public
- requirement rules configurable by organization where needed

### 5.7 Attendance and Work Records

- attendance outcome stored on signup
- actual worked time stored as work record
- work records only for actual work
- admin corrections and paper/import entries
- audit trail for corrections

### 5.8 Payments

- organization-specific payout rate
- amount stored in minor units
- rate frozen at approval
- payment states: open, approved, paid
- organization-scoped payout reports

### 5.9 Dashboard, Statistics, and Exports

- operational action dashboard per organization
- open shift windows
- missing attendance and incomplete work records
- family fulfillment
- payout summaries
- exports with permission checks
- audit-sensitive export behavior

### 5.10 Import

- organization-scoped import batches
- import preview and validation
- duplicate review
- import protocol
- customer-specific source files handled as data, not code assumptions

## 6. Nonfunctional Requirements

- mobile-first responsive UI
- accessible public signup flow
- strict server-side validation
- strict organization data isolation
- database-driven branding
- no customer-specific hardcoding
- auditability for sensitive actions
- PostgreSQL-backed transactional integrity
- GitHub-based deployment
- daily backups for production data
- secure handling of secrets outside the repository

## 7. Success Criteria for the First Production-Ready Version

- a new organization can be onboarded without code changes
- organization branding comes from the database
- organization data is isolated from all other organizations
- an organization can create seasons, events, and shifts
- volunteers can sign up through an organization-specific public plan
- staff can manage attendance and work records
- admin can generate basic operational summaries
- contact data and child data are never public
