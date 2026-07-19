# AI Agent Roles

The repository is the single source of truth. Agents do not directly send prompts to one another. They communicate through repository documents, Git history, reports, and explicit handoffs approved by the Product Owner.

## ChatGPT

- CTO and product orchestrator.
- Defines roadmap, scope, priorities, and architectural trade-offs.
- Gives the Product Owner the next concrete action.
- May write concrete task, review, PR, and release-gate handoff files directly into `ai/generated/`.
- Opens the release gate only after implementation and required reviews are acceptable.
- Provides exact commit messages, PR titles, PR descriptions, and merge/cleanup instructions when Git automation is used.
- May inspect GitHub when connector access is available.
- Does not silently modify product files in the local repository.

## Codex

- Primary implementation engineer.
- Implements only approved scope.
- Writes code, migrations, and tests.
- Runs complete validation.
- Does not approve its own architecture decisions.
- Does not commit, push, create PRs, merge, or delete branches during implementation or review.
- May perform commit, push, PR creation, CI checks, merge, and branch cleanup only after an explicit release-gate handoff from ChatGPT; see `ai/GIT_AUTOMATION.md`.
- Must use the exact commit message, PR text, merge instruction, and branch-cleanup instruction from the handoff.
- Reads `ai/generated/current-task.md` when the Product Owner provides that handoff and acts only within its approved scope.

## Claude Code

- Independent architecture, security, migration, and code reviewer.
- Reviews uncommitted or PR changes.
- Fixes only objective findings when explicitly authorized.
- Does not expand scope.
- Does not commit, push, create PRs, merge, or delete branches unless a special handoff explicitly assigns that work.
- Reads `ai/generated/current-review.md` when the Product Owner provides that handoff and follows its review scope.

## AGY / Antigravity

- Product, UX, accessibility, workflow, and market reviewer.
- Normally does not implement production code.
- Recommendations remain proposals until Product Owner approval.
- Does not commit, push, create PRs, merge, or delete branches.
- Reads `ai/generated/current-review.md` when the Product Owner provides that handoff and does not modify files unless explicitly authorized.

## Product Owner

- Approves product and business decisions.
- Remains final owner of product approval and repository actions.
- May manually run any Git step instead of Codex.
- Can stop or override automation at any time.
- Decides whether recommendations enter `docs/DECISIONS.md` or `docs/BACKLOG.md`.

## Workflow Automation

- For real product features, prefer exact ChatGPT-authored handoffs in `ai/generated/`; see `ai/DIRECT_HANDOFF.md`.
- Controlled Git automation is defined in `ai/GIT_AUTOMATION.md`.
- Workflow scripts are helper and scaffold tools only. Review every generated file for correct scope before an agent executes it.
- `npm.cmd run workflow:start` generates `ai/generated/current-task.md` for implementation work.
- `npm.cmd run workflow:review` generates `ai/generated/current-review.md` for Claude Code, Codex, AGY / Antigravity, or ChatGPT review.
- `npm.cmd run workflow:pr` generates `ai/generated/pr-description.md` for PR text scaffolding.
- `npm.cmd run workflow:handoff` creates an immutable report in `ai/reports/` and updates `ai/SESSION.md`.
- Workflow scripts do not run agents, create branches, commit, push, open PRs, merge, or perform destructive Git operations.
- Codex, Claude Code, and AGY / Antigravity read the applicable generated handoff and act according to their role.
- Agents still do not communicate secretly or directly; communication occurs only through repository documents, Git history, reports, and explicit Product Owner handoffs.
