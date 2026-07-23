---
name: grillcrew-implement
description: Implement an approved GrillCrew issue in the repository with tenant safety, tests, documentation, and a durable Paperclip handoff. Use only for bounded implementation or objective correction tasks assigned to Codex. Do not use for product approval, independent review, merge, deployment, or branch deletion.
---

# GrillCrew Implement

1. Follow the Paperclip heartbeat protocol: inspect identity, assignments, checkout, ancestors, comments,
   and the full task contract.
2. Read every mandatory and task-specific source from `ai/OPERATING_MODEL.md`; inspect the actual code,
   tests, migrations, and current Git state before editing.
3. Confirm approved scope, exclusions, branch/base, acceptance criteria, and release authority. Block with
   a precise owner/action when any required decision is missing.
4. Preserve unrelated user changes. Implement the smallest complete solution without customer-specific
   hardcoding, cross-organization leakage, public personal data, or silent errors.
5. Add or update automated tests for behavior, permissions, tenant isolation, failure paths, and migrations.
6. Apply the documentation update matrix in the same change.
7. Run focused checks while developing and the complete applicable repository checks before completion.
8. Comment with changed files, behavioral result, validation evidence, documentation impact, residual risk,
   and exact next action. Mark done only when the issue contract is satisfied.

Do not commit, push, create or merge a PR, deploy, or delete branches unless the explicit release gate in
`ai/GIT_AUTOMATION.md` authorizes that exact action.
