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
Generate workflow-ready prompts when starting, reviewing, handing off, or preparing PR text:

```powershell
git switch -c feature/f002-step6-password-reset
npm.cmd run workflow:start -- F002 "Step 6 Password Reset" feature/f002-step6-password-reset
codex
# Tell Codex to read ai/generated/current-task.md and execute it. Do not commit or push.

npm.cmd run workflow:review -- claude F002 "Step 6 Password Reset"
claude
# Tell Claude Code to read ai/generated/current-review.md and execute the review. Do not commit or push.

npm.cmd run workflow:pr -- "F002 Step 6: Password Reset"
# Product Owner opens the PR manually and pastes ai/generated/pr-description.md.
```

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
