# Handoff Prompt

Role: handoff/report author.

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

Read `CLAUDE.md`, `ai/AGENTS.md`, `ai/MEMORY.md`, `ai/STATUS.md`, `ai/SESSION.md`, `ai/CONTEXT.md`, `ai/REVIEW.md`, and `ai/REPORT_TEMPLATE.md` first. Then read relevant feature, architecture, decision, and validation documents.

## Rules

- Respect the approved scope and summarize only what actually happened.
- Do not directly edit `docs/DECISIONS.md` or other authoritative decisions without Product Owner approval.
- Do not commit or push unless explicitly requested.
- Confirm validation status and unresolved issues explicitly.
- Update `ai/SESSION.md` only when explicitly requested.
- Create a historical report only for feature implementation, architecture/security review, release review, or major research.
- Use the structured report format: agent, timestamp, branch, commit, assignment, scope, files changed, decisions proposed, checks run, results, risks, unresolved issues, next action, responsible next agent.
