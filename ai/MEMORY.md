# AI Project Memory

Stable long-term memory only. Do not copy full business rules or implementation plans here; link to the authoritative repository documents instead.

## Product Direction

- The product is a commercial closed-source SaaS platform.
- The platform is organization-agnostic and built for multiple tenants.
- FC Thusis-Cazis is only the first seed/configured tenant, not the product boundary.
- Repository documentation is authoritative. Start with `docs/PRD.md`, `docs/DECISIONS.md`, `docs/FEATURES.md`, `docs/ROADMAP.md`, and `docs/ARCHITECTURE.md`.

## Technical Baseline

- Frontend: Next.js.
- Backend: FastAPI.
- Database: PostgreSQL.
- Production targets: Vercel for `frontend/`, Render for backend and PostgreSQL.
- Strict tenant isolation is mandatory for all organization-scoped data.
- UX is mobile-first and accessible.
- Public phone numbers and email addresses are forbidden.
- Volunteer accounts are optional; public volunteer signup must not require registration.

## Approved AI Workflow

- The repository is the single source of truth.
- AI agents communicate through version-controlled documents, reports, Git history, and explicit handoffs.
- ChatGPT orchestrates product direction and priorities.
- Codex implements approved scope.
- Claude Code reviews architecture, security, migrations, and code independently.
- AGY / Antigravity reviews product, UX, accessibility, workflow, and research topics.
- The Product Owner approves product decisions, commits, pushes, PRs, and merges.

## Rejected Directions

- Not open source.
- Not a single-club hardcoded application.
- No direct hidden agent-to-agent communication.
- No undocumented architecture changes.

## Authoritative References

- Product requirements: `docs/PRD.md`
- Decisions: `docs/DECISIONS.md`
- Feature roadmap: `docs/FEATURES.md`
- Delivery roadmap: `docs/ROADMAP.md`
- Architecture: `docs/ARCHITECTURE.md`
- Current F002 plan: `docs/F002_PLAN.md`
- Contribution workflow: `CONTRIBUTING.md`
- Agent operating rules: `CLAUDE.md`
