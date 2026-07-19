# Direct AI Handoff Workflow

For real product features, the preferred workflow is a concrete handoff written by ChatGPT directly into `ai/generated/`. Workflow scripts are optional helper and scaffold tools; their generated scope must be reviewed before an agent acts on it.

## Happy Path

1. The Product Owner asks ChatGPT for the next step.
2. ChatGPT writes the exact task, review, PR, or release-gate handoff file needed in `ai/generated/`, such as `current-task.md`, `current-review.md`, or `pr-description.md`.
3. The Product Owner starts the target agent from the repository root and gives only the applicable short instruction:
   - Codex implementation: `Read ai/generated/current-task.md and execute it. Do not commit or push.`
   - Claude review: `Read ai/generated/current-review.md and execute the review. Do not commit or push.`
   - AGY review: `Read ai/generated/current-review.md and execute the review. Do not modify files.`
   - Codex release action: `Read ai/generated/current-task.md and execute the release-gate Git instructions exactly.`
4. The agent returns a structured report.
5. ChatGPT reviews the report and, when needed, the local diff.
6. ChatGPT opens the release gate only after implementation and required reviews are acceptable.
7. After the release gate is open, Codex may perform explicitly authorized Git actions: commit, push, PR creation, CI status checks, merge, and branch cleanup.
8. The Product Owner may still perform any Git action manually and remains the final owner of approvals.
9. After merge, run:

```powershell
npm.cmd run ai:prepare
```

Agents do not communicate secretly or directly. The Product Owner controls each handoff, and repository files, reports, Git history, and explicitly shared output remain the communication channels.

## Release Gate

Git automation is allowed only after ChatGPT writes an explicit handoff containing one of these phrases:

- `Release gate open: commit and push`
- `Release gate open: create PR`
- `Release gate open: merge and clean up`

Without one of those phrases, agents must not commit, push, create a pull request, merge, or delete branches.

The release-gate handoff must name:

- branch
- expected clean or dirty state
- files or scope to include
- validation required before action
- exact commit message or PR title/body
- whether branch deletion is allowed

Codex may execute Git actions after the gate because it is the implementation engineer and can update local reports, run validation, and prepare the PR consistently. Claude Code and AGY do not perform Git release actions unless a special handoff explicitly assigns that work.

## Still Forbidden Without Separate Explicit Approval

- `git reset --hard`
- force push
- rewriting public history
- deleting unmerged branches
- deleting files outside the approved feature scope
- changing secrets or environment credentials
- bypassing failed CI
- merging with unresolved requested changes
