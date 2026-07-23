---
name: grillcrew-release
description: Execute a GrillCrew GitHub release after the Product Owner and Product Orchestrator open an explicit release gate. Use for authorized commit, push, pull-request, CI, merge, cleanup, and post-merge synchronization. Do not use during implementation or review, or when the exact gate is absent.
---

# GrillCrew Release

1. Read `ai/GIT_AUTOMATION.md`, `CONTRIBUTING.md`, `ai/OPERATING_MODEL.md`, the issue contract, review
   decisions, and the exact release-gate handoff.
2. Verify branch, base, diff scope, working-tree ownership, required checks, review outcomes, and exact
   authorized Git actions. Stop on ambiguity or unrelated changes.
3. Use only the authorized commit message, PR title/body, merge method, and cleanup instructions.
4. Confirm CI is green before merge. Never bypass branch protection or hide failing checks.
5. After merge, run `npm.cmd run ai:prepare` and synchronize `ai/STATUS.md`, `ai/SESSION.md`, feature
   status/plan, GitHub, and Paperclip before new work starts.
6. Comment with commit, PR, checks, merge result, cleanup result, documentation synchronization, and any
   remaining follow-up.

Approval for implementation or review never implies approval to commit, push, merge, deploy, or delete.
