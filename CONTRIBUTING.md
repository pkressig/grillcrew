# Contributing

Use feature branches for every feature, fix, or housekeeping change. Do not perform direct product development on `main`.

Run local checks before pushing:

```powershell
npm.cmd run check
```

Open a pull request for review. The pull request should describe the change, documentation impact, database or migration impact, tests performed, and deployment considerations.

CI must be green before merge. Do not merge changes with failing lint, formatting, typecheck, test, or build jobs.

Use clear commit messages in the imperative mood, for example `Add repository quality commands`. Keep each commit focused on one logical change.

Generated files, local caches, virtual environments, coverage output, build output, local environment files, and secrets must not be committed.
