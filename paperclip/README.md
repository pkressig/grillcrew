# Grillcrew in Paperclip

This directory contains the stable Paperclip-facing instructions for the existing Grillcrew AI workflow. The repository remains the single source of truth. Read ai/OPERATING_MODEL.md for the binding source ownership, reading, update, and lifecycle rules.

`paperclip/company-template/` is the canonical portable Paperclip definition. The `company-export` directories are generated diagnostic snapshots and are intentionally ignored; they must not be used as authoritative configuration.

Use [WORKFLOW.md](WORKFLOW.md) for the issue contract and review chain, [OPERATIONS.md](OPERATIONS.md) for installation, recovery, validation, and upgrades, and [CONTEXT_INDEX.md](CONTEXT_INDEX.md) for the repository reading order.

The task-contract skill contains reusable feature, defect, security, migration, UX, documentation, release,
and incident templates plus the mandatory ChatGPT decision-intake form. Context, migration, and security
audits are separate skills so they can be assigned only when their evidence is relevant.

## Workflow

1. The Product Orchestrator reads the repository context, proposes scope, and waits for Product Owner approval where a product or business decision is required.
2. Codex implements only the approved scope on the assigned feature branch or Paperclip worktree.
3. Claude independently reviews architecture, security, migrations, tenant isolation, tests, and documentation.
4. AGY independently reviews product behavior, UX, accessibility, workflow, and market fit.
5. Objective findings return to Codex. Product recommendations return to the Product Owner and are not silently implemented.
6. The Product Orchestrator opens the release gate only after required reviews are acceptable.
7. GitHub commit, push, pull request, CI, merge, and cleanup follow `ai/GIT_AUTOMATION.md` and the exact release-gate handoff.

## Paperclip issue policy

Implementation issues are assigned to Codex. Their execution policy contains sequential Claude and AGY review stages followed by the Product Owner (`local-board`) approval stage. Objective findings return the same issue to Codex; a new issue is created only when scope or authority changes.

Every issue must state why, what, how, where, exclusions, authority, and acceptance criteria as defined in ai/OPERATING_MODEL.md. It must link the Grillcrew project, name the feature/step, and point to the applicable repository documents. Agent comments are audit records; durable project state still belongs in repository reports, feature/decision documents, status, and handoff files.

## Safety

- No agent may merge, delete branches, deploy, or change authoritative product decisions without the explicit authority defined in `ai/GIT_AUTOMATION.md`.
- Never place provider tokens or secrets in repository files, prompts, issue comments, or logs.
- Cross-organization leakage is a security defect.
- Existing uncommitted user work must be preserved.
- After import or adapter changes, validate the canonical template, verify all four roles and their skill assignments, and test the least-privilege AGY bridge before live work.
