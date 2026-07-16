# AI Reports

Reports are historical and immutable. Corrections create a new report instead of editing an existing one.

Use this filename format:

```text
YYYY-MM-DD-HHMM-agent-feature.md
```

Reports are required for feature implementation, architecture/security review, release review, and major research. They are not required for trivial one-line fixes.

Create a report with:

```powershell
npm.cmd run ai:report -- <agent> <feature> [source.md]
```
