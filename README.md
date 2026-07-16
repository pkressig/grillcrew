# Volunteer Platform

Commercial multi-organization SaaS platform for coordinating volunteer operations.

The application is organization-agnostic. Customer names, branding, colors, settings, and operational data are stored in the database and must not be hardcoded in application code.

## Development Setup

Run all commands from the repository root unless a command explicitly changes directory.

### Windows PowerShell Prerequisites

Verify Git:

```powershell
git --version
```

Verify Node.js and npm:

```powershell
node --version
npm --version
```

Verify Python 3.12:

```powershell
py -3.12 --version
```

Create and activate a Python 3.12 virtual environment:

```powershell
py -3.12 -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python --version
```

Install backend development dependencies:

```powershell
npm.cmd run install:backend
```

Install frontend dependencies:

```powershell
npm.cmd run install:frontend
```

Run all project checks:

```powershell
npm.cmd run check
```

## AI Project Workflow

The file `CLAUDE.md` historically has that filename, but it applies to every coding agent in this repository. All agents read the shared AI files in `ai/` before non-trivial work:

```powershell
Get-Content .\CLAUDE.md
Get-Content .\ai\AGENTS.md
Get-Content .\ai\MEMORY.md
Get-Content .\ai\STATUS.md
Get-Content .\ai\SESSION.md
Get-Content .\ai\CONTEXT.md
Get-Content .\ai\REVIEW.md
```

Generate the ChatGPT context pack:

```powershell
npm.cmd run ai:prepare
```

The Product Owner uploads `ai/generated/CONTEXT_PACK.md` to ChatGPT when starting a new chat, when context may be stale, when GitHub connector access is unavailable, or when an independent complete review is requested. ChatGPT GitHub access is optional; the context pack remains the reliable fallback.

Create a historical AI report:

```powershell
npm.cmd run ai:report -- <agent> <feature> [source.md]
```

## Quality Commands

```powershell
npm.cmd run ai:status
npm.cmd run ai:context
npm.cmd run ai:prepare
npm.cmd run install:frontend
npm.cmd run install:backend
npm.cmd run check:backend:ruff
npm.cmd run check:backend:format
npm.cmd run check:backend:mypy
npm.cmd run check:backend:pytest
npm.cmd run check:frontend
npm.cmd run check
```

## Agent Startup

Start Claude Code from the repository directory:

```powershell
cd <your-repository-root>
claude
```

Start Codex from the repository directory:

```powershell
cd <your-repository-root>
codex
```

Start AGY / Antigravity from the repository directory:

```powershell
cd <your-repository-root>
agy
```

On Windows PowerShell, use `npm.cmd` when a command shell cannot resolve
`npm` directly. On macOS, Linux, Git Bash, WSL, or CI, use the same commands
without the `.cmd` suffix.
