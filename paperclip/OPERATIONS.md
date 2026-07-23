# GrillCrew Paperclip operations

## Canonical locations

- Portable company definition: `paperclip/company-template/`
- Role instructions: `paperclip/company-template/agents/*/AGENTS.md`
- GrillCrew-specific skills: `paperclip/company-template/skills/*/SKILL.md`
- AGY adapter bridge: `paperclip/scripts/agy-review-bridge.mjs`
- Context ownership and read/update rules: `ai/OPERATING_MODEL.md`
- Current state and next action: `ai/STATUS.md` and `ai/SESSION.md`
- Product truth: `docs/PRD.md`, `docs/DECISIONS.md`, `docs/FEATURES.md`, feature plans, business rules, permissions, and UX/UI documents
- GitHub/release authority: `ai/GIT_AUTOMATION.md`

Generated `paperclip/company-export*` directories are snapshots only. Never edit them as a source of truth.

## Live topology

The company is **GrillCrew Product Development**. The four accountable roles are Product Orchestrator, Codex implementation engineer, Claude architecture/security reviewer, and AGY product/UX reviewer. Timed heartbeats are disabled; assignment and explicit on-demand wakeups start work. Every agent has one concurrent run and a monthly budget. New agents require board approval.

The GrillCrew project uses the local Git repository as its primary workspace and isolated Git worktrees by default. Paperclip's instance-level experimental setting `enableIsolatedWorkspaces` must also be enabled; the project policy is stored but silently falls back to the shared primary workspace while that instance gate is disabled. The local Paperclip database is outside the repository under the default Paperclip instance data directory. Back it up before schema upgrades or major configuration changes.

## Scheduled governance

| Routine                               | Schedule                       | Authority                                                                                                |
| ------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Daily workflow triage                 | 08:15 every day, Europe/Zurich | Read and report; may propose/create a bounded recovery path, never change product/code/GitHub/deployment |
| Weekly context reconciliation         | Monday 08:45, Europe/Zurich    | Read and report drift; proposals only                                                                    |
| Weekly cost and review-findings audit | Friday 16:00, Europe/Zurich    | Read and report budgets/findings; recommendations only                                                   |

All routines use `coalesce_if_active` and `skip_missed`, so they do not duplicate an active run or create a backlog after downtime. Their portable definitions live under `paperclip/company-template/tasks/` with schedule fidelity in `.paperclip.yaml`.

## Skills policy

Paperclip's own operational skills are installed from the official `paperclipai/paperclip` repository at an exact commit, not a moving branch. GrillCrew-specific skills live in this repository so changes receive normal Git review. The Product Orchestrator owns task contracts and release gates; Codex owns implementation; Claude owns code/security review; AGY owns product/UX review.

After changing a skill, validate its `SKILL.md`, re-import or update it in Paperclip, sync the desired skill set to the affected agent, inspect the materialized skill snapshot, and run a representative issue. Never place secrets or tokens in skill files.

## Machine-local setup after import

1. Set the primary project workspace to the local GrillCrew checkout and confirm its Git remote and `main` base ref.
2. Enable the instance-level experimental setting `enableIsolatedWorkspaces`; the project policy alone does not activate isolated execution.
3. Set each adapter working directory to that checkout.
4. Confirm `codex`, `claude`, `node`, and `agy` resolve in the service account environment.
5. Point AGY's process adapter to `node paperclip/scripts/agy-review-bridge.mjs`. The bridge gathers the governed packet itself, writes it only into Paperclip's isolated run scratch directory to avoid Windows command-line limits, and runs AGY there in plan+sandbox mode against that single packet.
6. Sync the pinned official skills and local GrillCrew skills described in each agent's `AGENTS.md`.
7. Run adapter environment tests, a read-only isolated-workspace smoke issue, and one governed read-only issue through Codex, Claude, AGY, and board approval.

Machine paths, credentials, API keys, and provider sessions are deliberately not portable and must not be committed.

## Validation checklist

- Portable manifest parses and contains four agents and one project.
- All eight GrillCrew skills pass the skill validator.
- All role instruction paths resolve and their bundles can be read through Paperclip.
- Agent hierarchy is healthy; permissions, budgets, heartbeat behavior, and concurrency match the portable definition.
- Instance setting `enableIsolatedWorkspaces` is enabled, and project policy provisions an isolated `codex/` worktree outside the shared primary checkout for normal implementation.
- Codex and Claude can execute a real heartbeat with their authenticated local sessions.
- AGY's bridge passes JavaScript syntax validation and a real review proves that the installed AGY CLI was invoked.
- The standard execution policy reaches the explicit board gate.
- Repository checks and documentation checks pass; any known pre-existing failure is recorded in `ai/STATUS.md`.

## Recovery and upgrades

Before upgrading Paperclip, create a database backup, record the Paperclip commit/version, and preserve this repository's uncommitted work. Upgrade the Paperclip checkout independently of GrillCrew. Then rerun adapter tests, skill synchronization, template validation, and the governed smoke issue. If a run fails, keep the issue and comments as evidence, repair the smallest configuration layer, and retry; do not erase history or bypass the board gate.

On the current Windows installation, Paperclip's embedded PostgreSQL runtime does not include `psql`. The
backup is a valid gzip SQL dump, but Paperclip's restore helper requires a compatible `psql` client for dumps
containing `COPY FROM stdin`. Before calling database recovery tested, install a portable compatible client or
perform the restore on a controlled recovery host, restore into a new database, verify company/agent/issue
counts and key GrillCrew records, then destroy only that named test database. Never test against the live
`paperclip` database.

If Paperclip is unavailable, development can continue under `ai/OPERATING_MODEL.md`, but no task is considered synchronized until its state and decisions are reconciled into Paperclip after recovery.
