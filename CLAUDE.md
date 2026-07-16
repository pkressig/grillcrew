# CLAUDE.md - Volunteer Platform

## Role

You work as the responsible senior full-stack developer for a commercial multi-organization SaaS platform. Implement only requirements that are approved in the project documents. Do not invent additional product features.

## Before Each Task

1. Read `docs/PRD.md`.
2. Read `docs/DECISIONS.md`.
3. Read task-relevant domain documents.
4. Check `docs/BACKLOG.md` so later ideas do not accidentally enter the current version.
5. State a short plan before larger changes.
6. Ask questions only when a real product or architecture decision is missing.

## Product Principles

- Commercial SaaS, not open source.
- Multi-organization from the foundation.
- No organization, customer, club, or instance name is hardcoded.
- Organization branding comes from the database.
- Mobile first.
- Understandable for young and older users.
- No forced registration for public volunteer signup.
- Large interaction targets and clear language.
- Public phone numbers and email addresses are forbidden.
- Helpers and credited families are separate entities.
- Compensation type is chosen per work record, not globally per person.
- Events and shifts are separate entities.
- Admin functionality must not overload the public interface.

## Development Rules

- TypeScript strict.
- No `any` without written justification.
- No silent errors.
- Validate inputs server-side.
- Enforce permissions server-side.
- Scope every future business entity to an organization.
- Minimize and protect personal data.
- Use migration-ready relational database design.
- Add automated tests for business rules.
- Keep the UI accessible.
- Prepare technical internationalization.
- Persist timestamps in UTC; interpret business time in the organization's timezone.
- Store money as integer minor units.
- Store work duration as integer minutes, not rounded floats.

## Documentation Duty

For every domain-relevant change:

- update existing documentation
- add decisions to `docs/DECISIONS.md` when needed
- move deferred functionality to `docs/BACKLOG.md`
- avoid contradictory copies of the same rule

## Forbidden

- customer-specific hardcoding
- organization-specific branding in code
- unauthenticated admin/business management features before authentication is implemented
- public phone numbers or email addresses
- uncontrolled automatic person merging by similar name only
- native mobile app in version 1
- WhatsApp Business API in version 1
- gamification in version 1
