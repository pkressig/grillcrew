# Latest AI Handoff

- Canonical current state (2026-08-13): Dieser Commit bringt die Familien-Kartei (editierbare
  Helferdaten, INACTIVE-Sichtbarkeit/Reaktivierung, tenant-/CSRF-/rollensicher), den behobenen
  öffentlichen Login-/Registrierungs-Modal- und Redirect-Fehler, drei Korrekturen am Kiosk/Grill-
  Freigabeworkflow (inkl. eines Lecks bestätigter Kiosk-Schichten auf der öffentlichen Seite), und
  eine retry-sichere Spielplan-Import-Route auf `main`. Vollständiger Review-/Testbericht:
  `ai/incoming/claude-latest.md`.

- Current work: F009 is complete through Step 3. F007 Step 1 and Step 2, Admin UX Shell Phase 1, Planning UX Phase 2, GrillCrew Visual Foundation Phase 1, and Admin Visual Application Phase 2 are released. Latest commit `235f915` applies the visual language to Families and Planning. Direct ChatGPT–PowerShell handoffs are active; Paperclip remains paused for product development.
- Goal: F016 Helferkonto end-to-end stabilisieren und den nächsten Helfer-/Familien-Workflow definieren.
- Completed product work: The attendance PATCH payload accepts `OPEN`, `ATTENDED`, `EXCUSED_CANCELLED`, `LATE_CANCELLED`, `NO_SHOW`, and `SUBSTITUTE_ORGANIZED`. The planning selector offers all six German labels. Real changes write one same-transaction `AuditEvent` with tenant, actor, signup id, previous outcome, and new outcome; idempotent repeats create none.
- Scope exclusions preserved: No migration, replacement signup/person/link, WorkRecord, public projection, public signup flow, capacity/cancellation mutation, notification, dashboard/export/statistics, commit, push, PR, merge, deployment, or branch cleanup action.
- Decision state: PKA-15 passed Codex implementation, Claude architecture/security review, AGY product/UX/accessibility review, Product Owner approval, final ChatGPT review, GitHub CI, and merge. Paperclip completed all three governed stages.
- Validation state: `npm.cmd run ai:prepare` passes. `npm.cmd run check:backend` passes (ruff, format, mypy, 272 pytest tests). Frontend lint, repository-wide Prettier, typecheck, full Vitest suite (50 tests), and production build pass through `npm.cmd run check` when `NODE_ENV` is unset. `git diff --check` passes with line-ending warnings only. PKA-16 resolved the unrelated frontend Prettier drift that previously stopped the strict repository check.
- Documentation state: `docs/F009_PLAN.md`, `docs/FEATURES.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `ai/STATUS.md`, and this handoff were updated for Step 2.
- Next exact action: F016 mit einem realen Konto end-to-end testen; danach einen begrenzten Helfer-/Familien-Vertrag festlegen. Magic Link bleibt historische Planung.
- Git state: PR #31 merged as `fe1fd0a1fbe838cd3b92980b16968bcf92c4434e`; feature branch removed.
- Timestamp: 2026-07-23.
