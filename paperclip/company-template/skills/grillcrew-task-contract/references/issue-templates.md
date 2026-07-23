# GrillCrew issue templates

Every template retains the standard headings from `grillcrew-task-contract`: Why, Approved outcome, Scope, Exclusions, Acceptance criteria, Required sources, Base and target refs, Required validation, Review and approval policy, Documentation/update obligations, Authority and unresolved decisions.

## Feature implementation

Add the approved feature step, user-visible behavior, tenant impact, UI states, API/data changes, compatibility, focused tests, full applicable checks, Claude review, AGY review when behavior or UI changes, and Product Owner approval.

## Defect correction

Add reproduction, expected/actual behavior, evidence that it is an objective defect, smallest correction, regression test, excluded redesign, original finding link, rereview owner, and release authority.

## Security or tenant-isolation change

Require `grillcrew-security-review`, trust-boundary description, attacker scenario, server-side authorization evidence, cross-organization negative tests, privacy/logging review, Claude approval, and explicit residual risk.

## Database migration

Require `grillcrew-migration-safety`, affected legacy data, expand-migrate-contract phases, deployment order, idempotency, tenant proof, backup, observability, stop condition, rollback/roll-forward recovery, migration tests, and Claude approval.

## UX or frontend change

Require desktop and mobile evidence, primary flow, loading/empty/error/success states, keyboard and focus behavior, accessible names/semantics, touch targets, understandable German copy, automated checks, Claude technical review, and AGY product/UX review.

## Documentation maintenance

Identify the authoritative source, observed drift, mechanical updates permitted, sources that must remain unchanged, link validation, generated-context refresh, and context-audit evidence. Product contradictions require a decision rather than an edit.

## Release

Require the exact release gate, branch/base, scoped diff, review decisions, CI checks, commit/PR/merge authority, deployment authority, rollback owner, post-merge synchronization, and cleanup authorization from `ai/GIT_AUTOMATION.md`.

## Production incident

Require impact, start time, affected organizations/users, containment authority, evidence preservation, privacy/security classification, reversible mitigation, communication owner, recovery checks, follow-up issue, and post-incident documentation. Never grant destructive or deployment authority implicitly.
