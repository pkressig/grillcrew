# Direct AI Handoff Workflow

For real product features, the preferred workflow is a concrete handoff written by ChatGPT directly into `ai/generated/`. Workflow scripts are optional helper and scaffold tools; their generated scope must be reviewed before an agent acts on it.

## Happy Path

1. The Product Owner asks ChatGPT for the next step.
2. ChatGPT writes the exact task, review, or PR handoff file needed in `ai/generated/`, such as `current-task.md`, `current-review.md`, or `pr-description.md`.
3. The Product Owner starts the target agent from the repository root and gives only the applicable short instruction:
   - Codex: `Read ai/generated/current-task.md and execute it. Do not commit or push.`
   - Claude: `Read ai/generated/current-review.md and execute the review. Do not commit or push.`
   - AGY: `Read ai/generated/current-review.md and execute the review. Do not modify files.`
4. The agent returns a structured report.
5. ChatGPT reviews the report and, when needed, the local diff.
6. ChatGPT and the Product Owner prepare the PR description. The Product Owner alone commits, pushes, opens the PR, waits for green CI, and merges.
7. After merge, run:

```powershell
npm.cmd run ai:prepare
```

Agents do not communicate secretly or directly. The Product Owner controls each handoff, and repository files, reports, Git history, and explicitly shared output remain the communication channels.
