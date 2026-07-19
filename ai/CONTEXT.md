# AI Onboarding Context

## Read First

1. `CLAUDE.md`
2. `ai/AGENTS.md`
3. `ai/DIRECT_HANDOFF.md`
4. `ai/GIT_AUTOMATION.md`
5. `ai/MEMORY.md`
6. `ai/STATUS.md`
7. `ai/SESSION.md`
8. `ai/CONTEXT.md`
9. `ai/REVIEW.md`

## Authoritative Requirements

- Product requirements: `docs/PRD.md`
- Feature definitions: `docs/FEATURES.md`
- Business rules: `docs/BUSINESS_RULES.md`
- Permissions: `docs/PERMISSIONS.md`
- Data model: `docs/DATA_MODEL.md`

## Decisions

- Binding decisions live in `docs/DECISIONS.md`.
- Do not edit decisions without Product Owner approval.
- Deferred ideas belong in `docs/BACKLOG.md`.

## Feature Plans

- Current authentication plan: `docs/F002_PLAN.md`
- Supporting F002 decisions: `docs/F002_DECISIONS.md`
- Roadmap order: `docs/ROADMAP.md`

## Current Status

- Manual and generated project status live in `ai/STATUS.md`.
- The latest handoff only lives in `ai/SESSION.md`.
- Historical reports live in `ai/reports/`.

## Review Rules

- Use `ai/REVIEW.md` for reusable review checklists.
- Review scope compliance first.
- Cross-organization leakage is a security defect.
- Product decisions remain proposals until approved by the Product Owner.

## Quality Commands

Run from repository root in PowerShell:

```powershell
npm.cmd run ai:prepare
npm.cmd run check
git diff --check
```

## Branch and PR Workflow

- Use feature branches.
- Do not commit, push, create PRs, merge, or delete branches unless a ChatGPT release-gate handoff explicitly authorizes it; see `ai/GIT_AUTOMATION.md`.
- Pull requests must describe scope, documentation impact, database or migration impact, tests, and deployment considerations.
- CI must be green before merge.


## Workflow Automation

- Create branches manually; workflow scripts do not create branches.
- For product features, prefer concrete task, review, and PR handoffs written directly by ChatGPT into `ai/generated/`; see `ai/DIRECT_HANDOFF.md`.
- Generate implementation prompts with `npm.cmd run workflow:start -- <feature-id> "<feature-name>" <branch>`.
- Tell Codex to read `ai/generated/current-task.md` and execute it.
- Generate review prompts with `npm.cmd run workflow:review -- <claude|codex|agy|chatgpt> <feature-id> "<feature-name>"`.
- Tell the selected reviewer to read `ai/generated/current-review.md`; agents still do not communicate secretly or directly.
- Generate PR text with `npm.cmd run workflow:pr -- "<title>"`.
- After ChatGPT opens the release gate, Codex may commit, push, create PRs, check CI, merge, and clean up only as explicitly instructed. The Product Owner may still perform these steps manually.
- Generated workflow files in `ai/generated/` are ignored by Git; keep `ai/generated/.gitkeep` tracked.
- `workflow:start` and `workflow:review` produce generic scaffolds. Review and correct their scope before any agent executes them.
## Deployment Overview

- Frontend: Vercel with root directory `frontend`.
- Backend: Render web service from `backend`.
- Database: Render PostgreSQL.
- Deployment details and required environment variables live in `docs/DEPLOYMENT.md`.

## Historical Reports

- Store significant feature, review, release, and research reports in `ai/reports/`.
- Use `ai/REPORT_TEMPLATE.md` or `npm.cmd run ai:report -- <agent> <feature> [source.md]`.
