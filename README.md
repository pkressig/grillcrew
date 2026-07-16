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

## Quality Commands

```powershell
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
cd C:\Users\pkres\Documents\GitHub\grillcrew
claude
```

Start Codex from the repository directory:

```powershell
cd C:\Users\pkres\Documents\GitHub\grillcrew
codex
```
