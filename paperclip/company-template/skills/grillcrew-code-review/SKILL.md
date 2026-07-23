---
name: grillcrew-code-review
description: Independently review a GrillCrew implementation for correctness, architecture, security, tenant isolation, permissions, migrations, tests, and documentation. Use for Claude review stages and post-correction rereviews. Do not implement fixes or approve when an objective blocking finding remains.
---

# GrillCrew Code Review

1. Checkout the assigned review stage and read the issue contract, ancestors, comments, complete diff,
   required repository sources, and `ai/REVIEW.md`.
2. Verify scope compliance before code style. Detect unapproved behavior and missing exclusions.
3. Trace trust boundaries, authentication, CSRF/origin behavior, authorization, organization scoping,
   personal-data exposure, migrations, concurrency/idempotency, error handling, and rollback behavior.
4. Verify tests exercise the stated behavior and meaningful failure paths. Never claim a command was run
   unless its output was observed.
5. Verify documentation and current status match the implementation and Git state.
6. Report findings first, ordered by severity. For each objective finding provide file/location, evidence,
   impact, and the smallest required correction. Separate optional recommendations.
7. Request changes when any blocking objective finding remains; otherwise approve with residual risks and
   validation limitations stated explicitly.

Do not modify files, change scope, or perform release actions unless a separate approved correction task
explicitly authorizes it.
