# Release Validation Prompt

Role: release reviewer.

## Assignment

- Feature ID: `{{FEATURE_ID}}`
- Feature name: `{{FEATURE_NAME}}`
- Step: `{{STEP}}`
- Branch: `{{BRANCH}}`
- Scope: `{{SCOPE}}`
- Acceptance criteria: `{{ACCEPTANCE_CRITERIA}}`
- Files to read: `{{FILES_TO_READ}}`
- Known risks: `{{KNOWN_RISKS}}`

## Required Reading

Read `CLAUDE.md`, `ai/AGENTS.md`, `ai/MEMORY.md`, `ai/STATUS.md`, `ai/SESSION.md`, `ai/CONTEXT.md`, and `ai/REVIEW.md` first. Then read relevant feature, architecture, deployment, decision, and PR documents.

## Rules

- Confirm scope, tests, documentation, migrations, deployment impact, generated files, and secrets handling.
- Do not add or change product scope during release validation.
- Do not directly edit `docs/DECISIONS.md` or other authoritative decisions without Product Owner approval.
- Do not commit or push unless explicitly requested.
- Run complete validation required for release readiness.
- Update `ai/SESSION.md` only when explicitly requested.
- Produce a structured release report with checks run, results, risks, unresolved issues, rollback considerations, and next action.
