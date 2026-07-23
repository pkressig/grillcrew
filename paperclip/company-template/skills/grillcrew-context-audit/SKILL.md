---
name: grillcrew-context-audit
description: Reconcile GrillCrew code, tests, migrations, product documentation, AI status files, Paperclip issues, and GitHub state. Use before release, after merge, during weekly drift checks, when resuming work after interruption, or whenever implementation and documentation may disagree. Do not change product decisions or hide unresolved drift.
---

# GrillCrew Context Audit

1. Read `ai/OPERATING_MODEL.md`, `ai/STATUS.md`, `ai/SESSION.md`, the active feature plan, relevant product sources, and the complete task/review history.
2. Compare the current branch, base ref, commits, diff, migrations, tests, and GitHub state with Paperclip issue status and recorded review decisions.
3. Verify that approved behavior appears consistently in `docs/DECISIONS.md`, PRD, features, business rules, permissions, data model, UX/UI, roadmap/backlog, and the active plan wherever applicable.
4. Check that material review findings have exactly one disposition: corrected, explicitly deferred with an owner, rejected with evidence, or awaiting Product Owner decision.
5. Check that `ai/STATUS.md` answers where the project is now and `ai/SESSION.md` gives the next worker an exact safe continuation point.
6. Run `npm.cmd run ai:prepare` only when authorized to update generated context. Run `git diff --check` and applicable validation; never claim unobserved results.
7. Report drift as findings with conflicting sources, controlling authority, required update, owner, and urgency. Separate mechanical synchronization from genuine product conflicts.
8. Correct mechanical documentation drift only inside an explicitly authorized implementation or maintenance task. Escalate product contradictions without choosing silently.

Completion requires a concise reconciliation table covering code/tests, product docs, AI handoff, Paperclip, GitHub, reviews, and remaining risks.
