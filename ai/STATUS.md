# AI Project Status

## Manual Status

- Current feature: F016 - Helferkonto und konto-basierte Einsatzanmeldung, plus begleitende
  Familien-Kartei-, Kiosk/Grill-Freigabe- und Spielplan-Import-Korrekturen
- Current step: Dieses Release bringt die Familien-Kartei mit editierbaren Helferdaten und
  INACTIVE-Reaktivierung, den behobenen öffentlichen Modal-/Redirect-Fehler, drei Korrekturen am
  Kiosk/Grill-Freigabeworkflow (u. a. ein Leck bestätigter Kiosk-Schichten auf der öffentlichen
  Seite), sowie eine retry-sichere, idempotente Spielplan-Import-Route auf `main`.
- Last merged feature: siehe „Current step" — Details und Review-Historie in
  `ai/incoming/claude-latest.md` und `docs/FEATURES.md`.
- Current phase: Admin Visual Application Phase 2 released; direct ChatGPT–PowerShell handoffs are active
- Active blockers: A full isolated Paperclip database restore drill requires a compatible `psql` client not included in the embedded Windows runtime
- Next intended action: Ein echter End-to-End-Test mit einem frischen Helferkonto im Live-System
  (Registrierung, Login, Anmeldung), danach den nächsten Helfer-/Familien-Workflow als begrenzten
  Vertrag definieren. Nach dem Merge `npm run ai:prepare` ausführen, um diesen Generated-Status-Block
  zu aktualisieren.
- Active workflow: Paperclip is intentionally paused for product development. Codex, Claude, and AGY are started manually from PowerShell; each must write its final report to the file-based return channel defined in `ai/DIRECT_HANDOFF.md`. Local Ollama remains optional for bounded, low-risk analysis.
- Paperclip governance automation: Three read-only routines are active (daily workflow triage, weekly context reconciliation, weekly cost/review audit); manual routine smoke test PKA-10 completed successfully
- Production frontend URL: Not configured in repository; see Vercel project settings
- Production backend URL: Not configured in repository; see Render service settings
- F002 Step 1 completed: yes
- F002 Step 2 completed: yes
- F002 Step 3 completed: yes
- F002 Step 4 completed: yes
- F002 Step 5 completed: yes
- F002 Step 6 completed: yes
- F002 Step 7 completed: yes
- F002 Step 8 completed: yes
- F003 Step 1 completed: yes
- F003 Step 2 completed: yes
- F003 Step 3 completed: yes
- F003 Step 4 completed: yes
- F004 Step 1 completed: yes
- F004 Step 2 completed: yes
- F004 Step 2.1 completed: yes
- F004 Step 3 completed: yes
- F004 Step 3.1 completed: yes
- F004 Step 4 completed: yes
- F009 Step 1 completed: merged in PR #29
- F009 Step 2 completed: merged in PR #31 after PKA-15 implementation and Claude, AGY, Product Owner, and ChatGPT approval; PKA-16 resolved the cross-platform Prettier gate
- F000.5 completed: yes
- F000.6 completed: yes

## Generated Status

<!-- GENERATED:START -->
- Current branch: main
- Current commit: 6bf5362e9d479f5e52e0aba4d11aad839138b629
- Working tree state: dirty (10 changed path(s))
- Latest commit subject: Merge pull request #33 from pkressig/codex/paperclip-claude-token-mode
- Latest update timestamp: 2026-07-23T15:03:51.362Z
<!-- GENERATED:END -->
