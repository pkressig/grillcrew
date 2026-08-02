# GrillCrew Visual & UX Reference

## Purpose

This document is the shared visual reference for ChatGPT, Claude, AGY, and Codex. The supplied GrillCrew concept image is inspiration and target direction, not a pixel-perfect requirement. Existing product rules, permissions, APIs, and data contracts remain authoritative.

Reference board: `docs/design-reference/grillcrew-product-board.png`

## Product character

GrillCrew should feel like a modern, warm, trustworthy club-management product: energetic enough for events, calm enough for administration, and simple enough for volunteers on a phone.

Visual language: charcoal sidebar, warm cream canvas, paprika primary actions, ember accents, sage/gold only as restrained platform accents, white/cream cards, subtle elevation, clear status badges, confident typography, generous spacing, and strong focus states.

## Token rules

- Organization theme controls only `primaryColor`, `secondaryColor`, and `logoUrl`.
- Platform tokens provide neutral surfaces, typography, radii, shadows, and semantic status colors.
- Never hard-code brand hex values inside page components.
- Color is never the only status signal; every badge includes visible text.
- Use existing Button, Badge, Card, PageHeader, OrganizationLogo, and Lucide conventions.
- Minimum interactive target: 44px.

## Shared admin shell

- Desktop: sticky dark sidebar, organization/logo identity, role, existing navigation, account and organization actions at bottom.
- Main canvas: warm neutral background, max readable width, one page `h1`, description, primary action.
- Navigation only links to implemented routes. Anwesenheit uses the implemented organization-scoped `/{org}/admin/attendance` route as its primary workspace; Planung retains its attendance section and links to that workspace.
- Tablet/mobile: accessible header navigation; public volunteer screens remain a separate mobile-first experience.
- Required states: authenticated loading, no permission, route loading, alert, success, empty, and retry.

## Page catalogue

### OneDrive-Karte im Spielplan-Import

Die ADMIN-only Karte zeigt Link, Aktivierung, tägliche Europe/Zurich-Zeit, Datumsbereich und „Nur ab heute und zukünftige Spiele“. „Jetzt synchronisieren“ lädt ausschliesslich lesend und öffnet danach die bestehende Importprüfung. Letzter Status/Fehler, nächste Laufvorschau, Dateiname, Hash, effektiver Bereich, Zeilenzahl und Vergleichszusammenfassung bleiben sichtbar. Der Hinweis „nur lesen, nie automatisch übernehmen“ ist dauerhaft sichtbar.

### 1. Übersicht / Dashboard — implemented reference

Reference: `docs/design-reference/admin-overview.png`

Four summary cards may only show metrics backed by an approved endpoint. Current candidates: active families, upcoming published shifts, signup coverage, unresolved attendance. Work hours and payments remain unavailable until F010+.

Below cards: next events, attendance handlungsbedarf, and one clear planning action. No fake numbers.

### 2. Planung — implemented

Reference: `docs/design-reference/admin-planning.png`

Agenda-first layout. Attendance handlungsbedarf appears above the agenda. Events are compact cards with date tile, title, location, status badge, occupancy summary, and native disclosure. Planungsperioden occupy the secondary desktop column and stack below on mobile. The shift-creation form (D-041 Phase 3) offers a "Crew-Vorschlag übernehmen" action that pre-fills menu/required-griller-count from the organization's crew-size rules — always a suggestion, never silently applied — and shift cards show a menu-type badge once set.

### 3. Familien — implemented

Reference: `docs/design-reference/admin-families.png`

Searchable family master list and selected detail. Child and helper counts come from the authenticated family-list response; do not invent location or pagination fields. Detail groups members as Kind/Helfer and keeps creation contextual.

### 4. Anwesenheit — implemented

Reference: `docs/design-reference/admin-attendance.png`

The organization-scoped `/{org}/admin/attendance` route is the primary attendance workspace. It reuses the existing planning, events, shifts, and signup request functions plus the existing attendance mutation endpoint. Use the same cards, badges, warnings, and explicit German outcomes. Planung keeps its attendance section and links to the dedicated workspace for continuity.

### 5. Öffentliche Helfer-Anmeldung — implemented mobile-first

Reference: `docs/design-reference/public-helper-signup.png`

One primary action per event card, clear date/time/location/capacity, short form, privacy notice, loading/error/success states, and management-link confirmation. Do not add profile tabs or volunteer accounts until approved.

### 6. Meine Einsätze / Helferportal — future

Only after an approved volunteer-account or management-link contract. Target: mobile list of available and booked shifts, assignment detail, status actions, and profile/settings only when backed by real auth/data.

### 7. Arbeitszeiten / Work Records — future

Only after F010 contract. Target: staff table, work-record detail, duration/breaks, compensation state, correction audit, and responsive mobile read view.

### 8. Kalender — implemented presentation view

The Planning workspace may switch between the default Agenda and a presentation-only Calendar view. Deterministic previous/current/next navigation moves only among weeks represented by the already-loaded real events; it does not request or infer additional dates.

### 9. Einstellungen — implemented, ADMIN-only

Reference: D-041. A dedicated `/{org}/admin/settings` route, visible in navigation and reachable only for ADMIN; a KOORDINATION user who navigates there directly sees the same "keine Berechtigung" state used elsewhere in the admin shell, not the settings content. Three stacked sections in one page: organization settings (payout rate, signup rate limits, coordination contact label), a home-venue allowlist (create, soft-deactivate, never hard-deleted), and an ordered crew-size rule list (create, reorder via up/down controls, deactivate) with a visually distinct, non-deletable default rule always evaluated last. All forms follow the existing hand-rolled form/busy/error/success convention; no invented components.

## Component patterns

- PageHeader: title, description, action.
- Card: surface, border, elevation, optional header/body.
- Badge: success/warning/error/neutral with visible text.
- StatSummary (`components/ui/stat-summary.tsx`): bordered stat tile — icon (primary-colored),
  label, bold number. Shared between the Overview dashboard and the Import review's
  classification-count row; only ever backed by real counts from already-loaded data.
- DateTile: decorative date plus accessible full date in parent label.
- EmptyState: explain what is empty and give one next action.
- FeedbackMessage: alert/status with token-driven styling.
- MasterDetail: list/detail desktop, list/detail back navigation mobile.
- Disclosure: native details/summary, closed by default for creation and dense detail.

## Implementation discipline

Each visual phase must name exact files, preserve APIs, include responsive/accessibility tests, and pass full checks. Design images are references; they must never justify invented fields, metrics, routes, or permissions.

## Decision record: dedicated Admin Anwesenheit workspace

**Date:** 2026-07-29

**Decision:** The GrillCrew Admin area uses a dedicated organization-scoped `/{org}/admin/attendance` route as the primary Anwesenheit workspace. It reuses the existing planning/events/shifts/signup request functions and attendance mutation endpoint. It is a presentation/navigation separation only; no new backend data contract is introduced. The Planning page keeps its attendance section and links to the dedicated workspace for continuity.

**Rationale:** Attendance follow-up is a distinct admin workflow that benefits from a focused navigation destination, while reusing the established requests and mutation keeps behavior consistent and avoids duplicating backend responsibilities.

**Scope:** Admin navigation, presentation, and documentation for the dedicated organization-scoped attendance workspace, including the continuity link from Planung.

**Non-goals:** This decision does not add or change backend endpoints, request or response schemas, permissions, attendance outcomes, or the attendance section in Planung.

## Decision record: Planning Calendar presentation and loaded-week navigation

**Date:** 2026-07-30

**Decision:** Planung keeps Agenda as its default and provides a presentation-only Calendar view. Previous, current, and next navigation deterministically selects only weeks represented by already-loaded real events. Agenda shows events from the selected loaded week, including an honest empty state for a planning period without events in that week. Calendar retains all loaded events and visibly highlights and focuses the selected week.

**Rationale:** The controls need an observable, accessible effect without expanding the existing event and shift data contracts. Loaded event weeks provide truthful navigation boundaries and preserve every event through deterministic navigation.

**Scope:** Admin Planning presentation, accessible view switching, selected-week filtering or focus, responsive controls with 44px targets, and tests for the loaded data already returned by the existing APIs.

**Non-goals:** No backend date contract, recurrence, drag/drop, timezone changes, inferred unavailable dates, month modes, collision rules, API/schema changes, or new event/shift mutations are introduced.
## Planning-period controls

Period cards show their lifecycle badge and expose 44px Edit, Schliessen, Archivieren, and (draft-only) Löschen controls as applicable. Destructive and lifecycle actions require explicit confirmation. Closed/archived options remain visible with German status labels in selectors but are disabled for new imports and creation.
## Kiosk- und Grillvorschläge

Kiosk verwendet eine nach Tagen gegliederte, responsive Kartenliste mit Fensterzeiten, Spielen, Spielorten, Teilungsgrund und sichtbarem Status `Vorschlag` oder `Manuell angepasst`. Grill zeigt ausschliesslich Fenster mit `Kiosk offen`, den Grillbedarf, ein/zwei vorgeschlagene Plätze beziehungsweise CrewSizeRule-Kontext sowie denselben Override-Status. Beide Ansichten besitzen Lade-, Leer-, Fehler- und Erfolgszustände, 44px-Bedienelemente und Textäquivalente für Statussymbole.
