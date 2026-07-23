# GrillCrew Operating Model

This document is the binding map for preserving project context across ChatGPT, Paperclip, Codex,
Claude, AGY, GitHub, and future contributors. It defines where knowledge belongs, what must be read,
and what must be updated. It does not replace the product or technical documents linked below.

## Core Rule

Git is the durable source of truth. Paperclip coordinates work; it does not replace approved project
documentation, code, tests, review records, or GitHub history. A task is not complete while its durable
documentation still describes an earlier state.

## Source Ownership and Precedence

When sources disagree, use the highest applicable source and correct the lower source in the same task:

1. Approved product decisions in `docs/DECISIONS.md` and feature-specific decision records.
2. Binding product and domain documents: `docs/PRD.md`, `docs/BUSINESS_RULES.md`,
   `docs/PERMISSIONS.md`, and `docs/DATA_MODEL.md`.
3. The approved feature plan for the active scope.
4. Merged code, tests, migrations, and GitHub history.
5. Current coordination documents: `ai/STATUS.md` and `ai/SESSION.md`.
6. Paperclip issues, comments, and agent state.

Do not silently choose between genuine product contradictions. Record the conflict and obtain an
explicit decision. Mechanical status drift may be corrected from merged Git history and completed
review evidence.

## Mandatory Reading

Every task starts with:

1. `CLAUDE.md`
2. `ai/OPERATING_MODEL.md`
3. `ai/AGENTS.md`
4. `ai/DIRECT_HANDOFF.md`
5. `ai/GIT_AUTOMATION.md`
6. `ai/MEMORY.md`
7. `ai/STATUS.md`
8. `ai/SESSION.md`
9. `ai/CONTEXT.md`
10. `ai/REVIEW.md`

Then read the task-specific sources:

| Task type | Additional required sources |
| --- | --- |
| Product, scope, or priority | `docs/PRD.md`, `docs/DECISIONS.md`, `docs/FEATURES.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md`, active feature plan |
| Backend, API, permissions, or security | `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/BUSINESS_RULES.md`, `docs/PERMISSIONS.md`, relevant schemas/migrations/tests |
| Frontend or UX | `docs/PRD.md`, `docs/FEATURES.md`, active feature plan, relevant frontend code/tests |
| Data model or migration | `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, relevant decisions, models, migrations, and migration tests |
| Deployment or operations | `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, relevant environment, workflow, and service configuration files |
| Review | The complete diff, acceptance criteria, relevant documents above, and `ai/REVIEW.md` |
| Release or merge | `CONTRIBUTING.md`, `ai/GIT_AUTOMATION.md`, CI status, review results, and current status/session files |
| Paperclip configuration | `paperclip/README.md`, `paperclip/CONTEXT_INDEX.md`, and `paperclip/company-template/` |

Reading a generated task bundle is a convenience, not a substitute for opening a required source when
the task depends on its exact wording.

## Task Contract

Every implementation or review assignment, including every Paperclip issue, must make these fields
unambiguous:

- **Why:** the problem or outcome being addressed.
- **What:** the bounded deliverable and acceptance criteria.
- **How:** applicable constraints, required checks, and review chain.
- **Where:** repository, base branch, relevant files/documents, and durable result location.
- **Exclusions:** decisions or adjacent scope that are intentionally not part of the task.
- **Authority:** approvals already given and decisions that still require the user.

## Update Matrix

| Event | Durable updates required |
| --- | --- |
| Product or business decision approved | Add an immutable entry to `docs/DECISIONS.md` or the feature decision record; align PRD, rules, permissions, feature description, and plan where affected |
| Scope or implementation step approved | Update the active feature plan and acceptance criteria; update roadmap/backlog only when priority or deferral changes |
| Architecture, API, permission, or data behavior changes | Update the corresponding architecture, data, business-rule, permission, environment, or deployment document with code and tests |
| Work handed to another agent | Update `ai/SESSION.md`; create the generated task context/report where the workflow requires it |
| Review completes | Record the result in the Paperclip/GitHub work item; preserve material findings in an AI report or follow-up task; do not convert a finding into an approved product decision |
| Pull request merges | Refresh `ai/STATUS.md`, `ai/SESSION.md`, and the feature-plan/status text; run `npm run ai:prepare`; synchronize the Paperclip issue with the merged PR and remaining findings |
| Work is deferred | Put the actionable item in `docs/BACKLOG.md` with context and dependency; do not leave it only in chat or a review comment |
| Paperclip structure changes | Update `paperclip/company-template/`, role instructions, and `paperclip/CONTEXT_INDEX.md`; test a dry-run import and the configured agent adapters |

`ai/STATUS.md` answers “where the project is now.” `ai/SESSION.md` answers “what the next worker needs
to continue safely.” Neither is a historical archive. Significant historical handoffs belong in
`ai/reports/`, GitHub, or the relevant feature/decision document.

## Lifecycle and Gates

1. ChatGPT and the user clarify intent and approve product decisions.
2. The orchestrator creates a bounded task contract and identifies mandatory sources.
3. Codex implements on an allowed branch and verifies the change.
4. Claude performs the independent code review.
5. AGY performs the independent UX/product review when the change affects product behavior or UI.
6. Findings return to Codex; required corrections repeat the relevant checks and reviews.
7. The explicit Git approval gate in `ai/GIT_AUTOMATION.md` controls commit, push, PR, and merge.
8. After merge, status, session, feature documentation, generated context, GitHub, and Paperclip are
   synchronized before the next feature begins.

No agent may infer approval from a Paperclip status transition, a successful test, or another agent's
comment.

## Paperclip Context Rules

- Use `paperclip/company-template/` as the canonical portable Paperclip configuration.
- Treat `paperclip/company-export*/` as generated diagnostic snapshots, never as authoritative input.
- A Paperclip issue must link or name the relevant repository documents instead of copying large,
  drifting versions of them into comments.
- Agent outputs must be attached to the issue and, when durable, written back to Git/GitHub according
  to the update matrix.
- After import or adapter changes, verify all four roles and restore/test the least-privilege AGY bridge
  before live work.

## Drift Check

Before declaring a task complete, verify:

- the current branch/commit and PR state match `ai/STATUS.md`;
- `ai/SESSION.md` contains only the current handoff;
- feature status and plan describe merged versus local work correctly;
- approved decisions appear in decision records, not only chat or Paperclip;
- review findings are resolved, explicitly accepted, or captured as follow-up work;
- local links resolve, generated files contain no secrets, and `git diff --check` passes.
