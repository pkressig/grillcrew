# Grillcrew Context Index

Paperclip coordinates work; Git and the repository remain the canonical project memory.

## Mandatory reading order

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
11. Task-specific files required by the matrix in `ai/OPERATING_MODEL.md`

## Source precedence

When state differs, report the drift and use this order:

1. Approved product decisions and binding repository requirements
2. The approved feature plan
3. GitHub merged history, the checked-out commit, implementation, and tests
4. `ai/STATUS.md` and `ai/SESSION.md`
5. Paperclip issues and comments

The Product Owner resolves product ambiguity. Paperclip status never overrides a failed test, unresolved review finding, missing approval, or GitHub branch protection.

After every merge or material review, apply the update matrix in `ai/OPERATING_MODEL.md` before new work is assigned. Paperclip issues coordinate execution but are not permanent project memory.

## Delivery gates

Product Orchestrator scope -> Product Owner decision when needed -> Codex implementation -> Claude architecture/security review -> AGY product/UX review -> Codex corrections and repeated reviews -> Product Owner release approval -> exact GitHub automation from `ai/GIT_AUTOMATION.md`.
