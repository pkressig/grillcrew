# UX, Usability, and Accessibility Review Report: F003 Step 2 Seasons Admin UI

- **Date:** 2026-07-19
- **Reviewer:** Antigravity (AGY)
- **Feature:** F003 — Seasons and Club Years
- **Step:** 2 — Visible Admin UI
- **Target Files Reviewed:**
  - [admin-shell.tsx](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/admin-shell.tsx)
  - [planning-panel.tsx](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx)
  - [planning.ts](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/lib/planning.ts)
  - [planning.test.tsx](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/tests/planning.test.tsx)
  - [planning.cases.tsx](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/tests/planning.cases.tsx)

---

## 1. UX & Usability Strengths

- **Clean Mobile-First Responsive Grid:** The forms and lists adapt elegantly between mobile (single column) and desktop (`sm:grid-cols-2`). Standard horizontal list structures are avoided, preventing cramped inputs on small widths.
- **Excellent Touch Targets:** Interactive controls (inputs, selects, buttons) use custom CSS classes (`min-h-11`) ensuring they meet the minimum 44px touch target guidelines for mobile usability.
- **Robust State Management:** Forms do not clear their inputs when submission validation fails on the server. Buttons are properly disabled (`disabled={busy}`) during network transit to block accidental double-submissions.
- **Localization and Clean Copy:** All UI texts use high-quality Schweizer Hochdeutsch copy (consistent with `de-CH` locales), properly employing umlauts and adopting regional conventions (e.g. spelling "Schliessen" instead of "Schließen"). No technical enums are leaked to the user.

---

## 2. Findings by Severity

### Critical Severity
*None identified.*

### High Severity

#### Finding H-1: Accidental Terminal State Transitions (No Click Confirmations)
- **Problem:** Season status updates occur immediately upon clicking the transition buttons. However, several transitions are irreversible:
  - Moving a season to `CLOSED` locks the season and prevents future attribute editing.
  - Moving a season to `ARCHIVED` is a terminal state.
  - A user can mistakenly click "Schliessen" or "Archivieren" on a `DRAFT` season. Because there is no confirmation modal, the draft season is permanently locked or archived, potentially forcing database-level fixes.
- **Location:** [planning-panel.tsx:L223-L242](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx#L223-L242)
- **Recommendation:** Intercept irreversible state changes (`CLOSED`, `ARCHIVED`) using a standard confirmation prompt or modal (e.g. `window.confirm("Sind Sie sicher, dass Sie diese Saison schliessen möchten? Dies kann nicht rückgängig gemacht werden.")`).

---

### Medium Severity

#### Finding M-1: Flat Seasons List Lacks Club Year Context
- **Problem:** Seasons are rendered in a single flat list. However, seasons are intrinsically linked to a `Vereinsjahr` (Club Year). As the system is used year-over-year, the list will populate with multiple seasons of similar names (e.g. "Herbstrunde" in 2026/27, "Herbstrunde" in 2027/28). Without showing which club year they belong to, the flat list will become impossible to navigate.
- **Location:** [planning-panel.tsx:L208-L246](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx#L208-L246)
- **Recommendation:** Associate each season item with its corresponding club year. This can be resolved on the frontend using `clubYears.find(y => y.id === season.club_year_id)?.label`, or by grouping seasons inside the UI under their respective Club Year cards.

#### Finding M-2: Missing Accessible Names for Duplicate Button Labels (Accessibility)
- **Problem:** In the seasons list, every season card renders the same button labels ("Aktivieren", "Schliessen", "Archivieren"). For screen reader users navigating the page by list of buttons, they will hear "Aktivieren, button", "Aktivieren, button" consecutively without knowing which season each button applies to.
- **Location:** [planning-panel.tsx:L226-L240](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx#L226-L240)
- **Recommendation:** Add an explicit, unique `aria-label` attribute on the button, e.g. `aria-label={`${actionLabels[next]} für ${season.name}`} / aria-label="${actionLabels[next]} für die Saison ${season.name}"`.

#### Finding M-3: Missing Client-Side Date Range Constraints
- **Problem:** Seasons are strictly constrained by the date ranges of their parent `Vereinsjahr`. Currently, there are no client-side limits on season date inputs. An administrator could select dates outside the club year's range, resulting in a failed submit and a generic error from the backend.
- **Location:** [planning-panel.tsx:L277-L284](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx#L277-L284)
- **Recommendation:** When a `Vereinsjahr` is selected in the season form, dynamically populate the `min` and `max` attributes of the start/end date inputs of the season to match the boundary dates of the chosen club year.

---

### Low Severity

#### Finding L-1: Lack of Initial Guidance/UX in Empty State
- **Problem:** If a brand-new tenant loads the panel for the first time, the `Vereinsjahr` dropdown in the season creation form is disabled (since no club years exist), but there is no helper text telling the admin that they must first create a Vereinsjahr.
- **Location:** [planning-panel.tsx:L247-L264](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx#L247-L264)
- **Recommendation:** Display an inline text hint or label color variation when `clubYears.length === 0`, instructing the user to "Erstellen Sie zuerst ein Vereinsjahr".

#### Finding L-2: Mojibake in Tests
- **Problem:** The test suite contains Unicode decoding artifacts ("FrÃ¼hlingsrunde" instead of "Frühlingsrunde"). While this is test-only, it should be cleaned up.
- **Location:** [planning.cases.tsx:L148, L161](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/tests/planning.cases.tsx#L148-L161)
- **Recommendation:** Fix the text string to "Frühlingsrunde".

#### Finding L-3: Unstructured Form Label Markup
- **Problem:** The form labels wrap text and inputs without layout styles. In standard browser behavior, this could result in poor visual separation.
- **Location:** [planning-panel.tsx:L190](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx#L190), [L249](file:///C:/Users/pkres/Documents/GitHub/grillcrew/frontend/app/[org]/admin/planning-panel.tsx#L249)
- **Recommendation:** Apply styles to labels to make them block or flex containers with spacing, e.g., `<label className="flex flex-col gap-1 text-sm font-medium">`.

---

## 3. Recommended Fixes (Before Merge)

To protect the integrity of the data and maintain high usability, the following fixes are recommended to be resolved before code promotion:

1. **Add irreversible transition prompts:** Apply confirmation logic for `CLOSED` and `ARCHIVED` actions in the frontend component.
2. **Expose Club Year name in Season labels:** Ensure the flat list is readable by adding the year's label.
3. **Add screen reader support to action buttons:** Introduce `aria-label` tags for the buttons.

---

## 4. Backlog / Future Polish Ideas
- **Default Dropdown Selection:** If only one `Vereinsjahr` is available, default select it automatically to speed up form entry.
- **Status Badges:** Use visually distinct, theme-conforming colored badge structures for statuses (DRAFT: neutral, ACTIVE: success, CLOSED: warning, ARCHIVED: muted) rather than raw text.
- **Calendar Visualization:** Integrate a timeline or calendar view to easily spot planning period overlaps.

---

## 5. Ready to Commit?
From a product and UX perspective, F003 Step 2 is **NOT YET READY to commit** without the recommended fixes (specifically the **irrevocable status transition confirmations** and **club year context on seasons**). If these usability issues are not addressed, real-world deployment is highly susceptible to user error, leading to irreversible state corruptions.

Once the high-severity items are fixed, the step is ready to proceed.
