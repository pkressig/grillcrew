# Contributing

Use feature branches for every feature, fix, or housekeeping change. Do not perform direct product development on `main`.

Run local checks before pushing:

```powershell
npm.cmd run check
```

Prepare shared AI status and context when starting or handing off non-trivial work:

```powershell
npm.cmd run ai:prepare
```
For real product features, use the direct AI handoff happy path:

```powershell
git switch -c feature/<feature-name>
# Ask ChatGPT to write the exact task to ai/generated/current-task.md.
codex
# Tell Codex to read ai/generated/current-task.md and execute it. Do not commit or push during implementation.

# Ask ChatGPT to review the report and local diff, then write ai/generated/current-review.md.
claude
# Tell Claude Code to read ai/generated/current-review.md and execute the review. Do not commit or push.
# AGY may review instead: read ai/generated/current-review.md, execute the review, and do not modify files.

# ChatGPT opens the release gate when implementation and reviews are acceptable.
# Codex may then commit, push, create the PR, check CI, merge, and clean up only as explicitly instructed.
```

The agent returns a structured report for ChatGPT to review. Git release actions require an explicit ChatGPT release-gate handoff. The Product Owner may run the Git steps manually or let Codex execute the approved handoff. CI must be green before merging; after merge run `npm.cmd run ai:prepare`. See `ai/DIRECT_HANDOFF.md` and `ai/GIT_AUTOMATION.md`.

The workflow scripts remain optional helpers for starting, reviewing, handing off, or preparing PR text:

```powershell
npm.cmd run workflow:start -- F002 "Feature name" feature/example
npm.cmd run workflow:review -- claude F002 "Feature name"
npm.cmd run workflow:pr -- "F002: Feature name"
```

`workflow:start` and `workflow:review` create generic scaffolds. Review them for correct scope before an agent executes them.

After CI is green and the Product Owner merges the PR, run:

```powershell
npm.cmd run ai:prepare
```

Create historical AI reports for feature implementation, architecture or security review, release review, and major research:

```powershell
npm.cmd run ai:report -- <agent> <feature> [source.md]
npm.cmd run workflow:handoff -- Codex F002-step6 ai/generated/codex-report.md
```

Open a pull request for review. The pull request should describe the change, documentation impact, database or migration impact, tests performed, and deployment considerations.

CI must be green before merge. Do not merge changes with failing lint, formatting, typecheck, test, or build jobs.

Use clear commit messages in the imperative mood, for example `Add repository quality commands`. Keep each commit focused on one logical change.

Generated files, local caches, virtual environments, coverage output, build output, local environment files, and secrets must not be committed.

Do not commit generated files in `ai/generated/`; `CONTEXT_PACK.md`, `current-task.md`, `current-review.md`, and `pr-description.md` are ignored handoff artifacts. Do commit intentional updates to `ai/` core files, prompt templates, and reports in `ai/reports/`.
