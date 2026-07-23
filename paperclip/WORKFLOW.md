# GrillCrew Paperclip workflow

## Control boundary

ChatGPT and the Product Owner decide product direction in this conversation. Paperclip receives an explicit, bounded task contract and coordinates execution. Git, GitHub, and the repository Markdown files remain the durable record; Paperclip comments are the operational audit trail, not a replacement for repository documentation.

## Standard path

1. ChatGPT converts the approved decision into one Paperclip issue using `grillcrew-task-contract`.
2. The Product Orchestrator verifies scope, authority, dependencies, source documents, acceptance criteria, and the correct goal.
3. Codex implements in an isolated worktree on `codex/{{issue.identifier}}-{{slug}}` and records changed files and verification evidence.
4. Claude independently reviews correctness, architecture, security, tenant isolation, permissions, migrations, tests, and documentation.
5. AGY independently reviews behavior, mobile UX, accessibility, workflow clarity, privacy, German copy, and product fit through `paperclip/scripts/agy-review-bridge.mjs`.
6. Objective findings return the issue to Codex. Product recommendations are presented to the Product Owner and never silently become scope.
7. The Product Owner is the final approval participant. Commit, push, pull request, merge, deployment, and branch deletion still require the release gate in `ai/GIT_AUTOMATION.md`.

## Required issue contract

Every implementation issue states:

- **Why:** user or business outcome.
- **What:** exact deliverable.
- **How:** constraints, architecture, and verification approach without prescribing unnecessary details.
- **Where:** feature, project, workspace, and affected areas.
- **Exclusions:** explicitly out-of-scope work.
- **Authority:** approved decisions and actions that still require approval.
- **Acceptance:** observable pass/fail criteria.
- **Sources:** exact repository documents to read.
- **Update duty:** which durable files must change when implementation changes their truth.

The issue links the GrillCrew project, one active goal, the primary workspace, and Codex. Normal implementation uses `isolated_workspace`; a shared workspace is reserved for explicitly read-only diagnostics or coordinated recovery.

## Execution policy

Use `mode: auto`, require a decision comment, and configure these sequential stages:

1. `review` by GrillCrew Claude Review.
2. `review` by GrillCrew AGY Review.
3. `approval` by `local-board`.

One stage has one accountable participant. A reviewer may approve only from evidence. `CHANGES_REQUESTED` returns the issue for correction and rereview. A recommendation that changes product scope is escalated to ChatGPT and the Product Owner.

## ChatGPT-to-Paperclip handoff

The handoff must include the decision summary, unresolved questions, task contract, source files, goal, priority, workspace mode, review policy, and release authority. ChatGPT then monitors issue state, reviewer comments, failures, costs, and approvals. It writes durable outcomes back to the repository before declaring the work complete.

Use `grillcrew-task-contract/references/decision-intake.md` as the mandatory intake record and select the closest standard pattern from `references/issue-templates.md`.

## Specialized gates

- Stored-data, schema, constraint, index, or enum changes require `grillcrew-migration-safety` for Codex and Claude.
- Authentication, authorization, tenant, public-data, session, upload, integration, or abuse-sensitive changes require `grillcrew-security-review` for Codex and Claude.
- UI work requires desktop/mobile evidence and loading, empty, error, success, keyboard/focus, semantics, touch-target, and German-copy coverage before Claude and AGY approval.
- Release-ready work and post-merge synchronization require `grillcrew-context-audit`.

## Completion definition

Work is complete only when the acceptance criteria pass, required tests are recorded, both independent reviews are resolved, documentation reflects reality, the Product Owner has approved, and the authorized GitHub/release lifecycle has completed. A successful agent run alone is not completion.
