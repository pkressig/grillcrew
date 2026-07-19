# Git Automation Policy

Git automation is allowed only after the implementation and required reviews have passed the project release gate.

## Roles

### ChatGPT

- Decides whether the release gate is open.
- Writes the exact Git handoff into `ai/generated/`.
- Provides the commit message, PR title, PR description, and merge instructions.
- May inspect local or GitHub state when available, but does not silently approve its own assumptions.

### Codex

- May run Git actions only after an explicit release-gate handoff.
- Preferred agent for commit, push, PR creation, CI checks, merge, and branch cleanup after approval.
- Must run or verify the requested validation before release actions.
- Must not invent commit messages, PR descriptions, merge strategy, or branch cleanup scope.

### Claude Code

- Reviews implementation, security, architecture, migrations, and documentation consistency.
- May fix objective review findings when authorized.
- Does not perform Git release actions unless a special handoff explicitly assigns that work.

### AGY / Antigravity

- Reviews product flow, UX, accessibility, copy, and market/research concerns.
- Does not perform Git release actions.

### Product Owner

- Remains final owner of product approval and repository actions.
- May manually run any Git step instead of Codex.
- Can stop or override automation at any time.

## Gate Phrases

Git actions are forbidden unless ChatGPT writes one of these exact phrases in a handoff:

- `Release gate open: commit and push`
- `Release gate open: create PR`
- `Release gate open: merge and clean up`

The handoff must also name:

- branch
- expected clean/dirty state
- files or scope to include
- validation required before action
- exact commit message or PR title/body
- whether branch deletion is allowed

## Allowed After Gate

With the correct gate phrase, Codex may:

- stage approved files
- commit with the provided message
- push the current feature branch
- create a pull request with the provided title and body
- check CI status
- merge after green CI if instructed
- delete the merged feature branch if instructed
- run `npm.cmd run ai:prepare` and update handoff/status files when instructed

## Still Forbidden Without Separate Explicit Approval

- `git reset --hard`
- force push
- rewriting public history
- deleting unmerged branches
- deleting files outside the approved scope
- changing secrets or environment credentials
- bypassing failed CI
- merging with unresolved requested changes

## Standard Sequence

1. ChatGPT writes `ai/generated/current-task.md`.
2. Codex implements and reports. No commit or push.
3. ChatGPT writes `ai/generated/current-review.md` for Claude.
4. Claude reviews and fixes objective issues. No commit or push.
5. AGY reviews when UI, UX, accessibility, copy, product flow, or research risk is involved. No commit or push.
6. ChatGPT reviews reports and opens the release gate if ready.
7. Codex executes the Git handoff exactly as written.
8. Codex reports the result and any CI/PR state.
9. After merge, Codex or the Product Owner runs cleanup and `npm.cmd run ai:prepare` as instructed.
