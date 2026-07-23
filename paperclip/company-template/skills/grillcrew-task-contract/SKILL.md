---
name: grillcrew-task-contract
description: Create a governed GrillCrew Paperclip task contract from an approved request. Use for scoping, planning, feature breakdown, review assignments, or any issue that must preserve why, what, how, where, exclusions, authority, acceptance criteria, required sources, and update duties. Do not use to invent unapproved product decisions.
---

# GrillCrew Task Contract

1. Read `CLAUDE.md`, `ai/OPERATING_MODEL.md`, and `paperclip/CONTEXT_INDEX.md` completely.
2. Read the task-specific sources required by `ai/OPERATING_MODEL.md`.
3. Reconcile the request with `docs/DECISIONS.md`, the active feature plan, code, tests, GitHub state,
   `ai/STATUS.md`, and `ai/SESSION.md`. Escalate genuine product conflicts.
4. Write the Paperclip issue with these headings:
   - Why
   - Approved outcome
   - Scope
   - Exclusions
   - Acceptance criteria
   - Required sources
   - Base and target refs
   - Required validation
   - Review and approval policy
   - Documentation/update obligations
   - Authority and unresolved decisions
   Select the closest pattern from `references/issue-templates.md` and include every applicable requirement.
   For instructions coming from ChatGPT, first complete `references/decision-intake.md`.
5. Link the issue to the GrillCrew project, the most specific goal, and a parent issue when applicable.
6. Use a `plan` issue document plus a revision-bound confirmation when implementation needs board approval.
7. Create child issues only after approval. Preserve dependencies and assign exactly one executor per issue.

Never copy entire repository documents into an issue. Link them and quote only the exact binding clause
needed to remove ambiguity.
