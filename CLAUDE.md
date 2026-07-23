# CLAUDE.md - Volunteer Platform

## Role

This file historically uses the `CLAUDE.md` filename, but it applies to every coding agent working in this repository, including Codex and Claude Code.

You work as the responsible senior full-stack developer for a commercial multi-organization SaaS platform. Implement only requirements that are approved in the project documents. Do not invent additional product features.

## Before Each Task

1. Read `ai/OPERATING_MODEL.md`, `ai/AGENTS.md`, `ai/DIRECT_HANDOFF.md`, `ai/GIT_AUTOMATION.md`, `ai/MEMORY.md`, `ai/STATUS.md`, `ai/SESSION.md`, `ai/CONTEXT.md`, and `ai/REVIEW.md`.
2. Read `docs/PRD.md`.
3. Read `docs/DECISIONS.md`.
4. Read task-relevant domain documents.
5. Check `docs/BACKLOG.md` so later ideas do not accidentally enter the current version.
6. State a short plan before larger changes.
7. Ask questions only when a real product or architecture decision is missing.

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
- follow the ownership and update matrix in `ai/OPERATING_MODEL.md`
- after a merge, synchronize status, session, feature documentation, generated context, GitHub, and Paperclip before the next feature

## AI Workflow

- The repository is the single source of truth.
- Agents communicate through repository documents, Git history, reports, and explicit handoffs.
- Shared AI memory lives in `ai/`.
- For real product features, the preferred workflow is a concrete handoff written by ChatGPT directly into `ai/generated/`; see `ai/DIRECT_HANDOFF.md`. Controlled Git automation after ChatGPT release gate is defined in `ai/GIT_AUTOMATION.md`. The `workflow:start`, `workflow:review`, and `workflow:pr` scripts remain optional helper and scaffold tools only.
- Reusable prompt templates live in `prompts/`.
- Generated ChatGPT context is created with:

```powershell
npm.cmd run ai:prepare
```

- `ai/generated/CONTEXT_PACK.md` is generated and ignored by Git.
- `ai/SESSION.md` contains only the latest handoff and is not permanent history.
- Historical reports live in `ai/reports/`.
- No agent commits, pushes, creates PRs, merges, or deletes branches unless a handoff explicitly opens the matching release gate. Codex is the preferred agent for those Git actions after the gate is open.

## Forbidden

- customer-specific hardcoding
- organization-specific branding in code
- unauthenticated admin/business management features before authentication is implemented
- public phone numbers or email addresses
- uncontrolled automatic person merging by similar name only
- native mobile app in version 1
- WhatsApp Business API in version 1
- gamification in version 1
