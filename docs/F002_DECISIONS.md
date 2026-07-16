# F002 Decisions Pending Product Owner Approval

**Status of this document: APPROVED.** The Product Owner approved P-1 through P-4, with the
refinements folded into each decision below. All four are ratified in `docs/DECISIONS.md` as
D-037 (P-1), D-038 (P-2), D-039 (P-3), D-040 (P-4). This document is retained as the detailed
rationale (problem, options, impact analysis) behind those entries; `docs/DECISIONS.md` holds the
binding, terse wording.

**Fixed constraints for all four decisions:**

- Frontend: Vercel. Backend: Render. Different registrable domains today.
- Commercial multi-organization SaaS; `Organization.customDomain` already exists in
  `docs/DATA_MODEL.md` (F001) and organizations may bring further custom domains later.
- Security must be production-grade; Version 1 must stay practical, not overengineered.
- Solutions should not need rework when more custom domains are added.

---

## P-1 — Platform Operator Representation

**Status: APPROVED as D-037.** Option A, with the Product Owner's explicit refinements: the field
is never writable through *either* the public *or* the organization-admin API surface (not just "no
public API" as originally scoped), it is assignable only through a controlled platform-admin process,
and organization roles remain exclusively in `StaffMembership` — i.e. `platformRole` must never be
used as a substitute or shortcut for an organization-level role check.

### Problem

`docs/FEATURES.md` F002 requires "As a Platform Operator, I can access platform administration," but
every documented access-control mechanism is organization-scoped: `StaffMembership.role` only takes
`ADMIN | KOORDINATION | KIOSK | VORSTAND_LESEN` (D-025), and the rights matrix in
`docs/PERMISSIONS.md` has no row for a non-tenant actor. `docs/DATA_MODEL.md`'s `AuditEvent` already
anticipates platform-level events (`organizationId` nullable, `actorType`), but `User` has no
platform-level attribute at all. There is currently no way to express "this person operates the
platform itself, outside any single organization."

### Available Options

**Option A — Nullable `User.platformRole` enum (single value `PLATFORM_OPERATOR` for now)**
- Pro: One column, no new table, no change to `StaffMembership`'s `NOT NULL organization_id`; trivially
  extensible later by adding enum values.
- Con: If the platform ever needs several distinct platform-level roles with different rights (e.g. a
  read-only platform support role), the enum grows without a matrix to check against, unlike
  `StaffMembership`'s documented rights table.

**Option B — Boolean `User.isPlatformOperator`**
- Pro: Simplest possible representation, cheapest to implement and reason about.
- Con: Binary by construction; any future second platform-level capability requires a schema change
  (a new column, then eventually a rename/migration to an enum) rather than adding a value.

**Option C — Model as a `StaffMembership` row with `organizationId = NULL`**
- Pro: Reuses existing membership machinery and guard code paths.
- Con: Breaks the current invariant that every `StaffMembership` implies exactly one organization;
  `organization_id` would have to become nullable, and every existing and future org-scoped query
  over `staff_membership` (aggregate staff counts, "list my organizations," exports) must remember to
  exclude the null-org row or it silently leaks a "ghost" row into org-scoped views. High risk of a
  forgotten `WHERE organization_id IS NOT NULL` becoming a real bug later.

**Option D — Separate `PlatformMembership` table mirroring `StaffMembership`**
- Pro: Fully extensible, cleanly separated from tenant data from day one.
- Con: A second membership table, its own migration, its own guard dependency, and its own tests — for
  a V1 need that is exactly one role held by presumably a handful of people. Overengineered relative to
  the current requirement.

### Security Impact

`platformRole`/`isPlatformOperator` is the single highest-privilege attribute in the system — it
bypasses every organization boundary. It must:
- never appear as a writable field on any authenticated request body (profile update, self-service
  endpoints, invitation acceptance) — settable only by direct operational/database action outside the
  running application (e.g. a one-off ops script or manual SQL against Render's managed Postgres).
- be excluded from any endpoint that lets a user view or edit their own `User` row.
- be treated as a candidate for stronger auth (e.g. mandatory 2FA) once that exists — noted as backlog,
  not a V1 blocker, since no MFA mechanism exists in the platform yet.

### SaaS / Multi-Organization Impact

A platform operator's whole point is to cross organization boundaries, which is exactly the behavior
`docs/ARCHITECTURE.md` calls "a security defect" for every other actor. Every future platform-level
endpoint must still require an explicit organization selection for any org-scoped data view (e.g. "list
organizations," then "view organization X") rather than an implicit "operator sees everything at once"
query, so that platform-level access remains auditable and intentional rather than an accidental
all-tenant data dump.

### Implementation Impact

One nullable enum column on `user`, one new FastAPI dependency (`require_platform_operator`), no new
table, no interaction with `StaffMembership`. Smallest option of the four choices below Option D.

### Recommendation

**Option A.** Matches the "not overengineered" constraint while remaining extensible (add enum values,
not new schema) if a second platform-level role becomes real. If platform-level roles later diversify
into a genuine rights matrix, migrate to Option D at that point — the same "start simple, extend later"
path already used for `StaffMembership.scope` (reserved, unused) in RFC-005.

### Exact Wording for Product Owner Approval — APPROVED, ratified as D-037

> Platform-wide operators are represented by a nullable `platform_role` field on `User` (enum, single
> value `PLATFORM_OPERATOR` in Version 1). This field is independent of `StaffMembership`, is never
> settable through any public or organization-admin API endpoint, and is granted only via a controlled
> platform-admin process outside the regular application endpoints. Guards for platform-level endpoints
> (`/api/platform/*`) check this field directly and require no organization context. Organization-scoped
> roles remain exclusively in `StaffMembership`; `platformRole` never substitutes for a `StaffMembership`
> role check.

---

## P-2 — Authentication Rate-Limit Configuration Location

**Status: APPROVED as D-038.** Option A, refined: rather than one generic "login/forgot-password"
limit, the Product Owner requires a **separate limit per sensitive auth action** — login, refresh,
password reset, invitation acceptance, and any further sensitive auth action added later — each with
its own conservative default.

### Problem

D-030 places public-signup rate limits in per-organization `OrganizationSettings`
(`signup_rate_limit_per_contact`, `signup_rate_limit_window_minutes`) because public signup is always
scoped to one resolved organization. Login and forgotten-password are different: a `User` can hold
`StaffMembership` in several organizations (`docs/ARCHITECTURE.md`), and `POST /api/auth/login` /
`POST /api/auth/forgot-password` are keyed by email, not by organization. There is no natural
`OrganizationSettings` row to attach these limits to, and no other documented location exists either.

### Available Options

**Option A — New fields on the platform `Settings` class (env-var-driven, `app/core/config.py`)**
- Pro: Follows the exact pattern already used for `database_url`, `cors_allowed_origins`, etc.; change
  via Render dashboard env vars + restart, no new persisted concept, no new admin UI.
- Con: Changing a limit requires touching the Render environment (not exposed to any in-app settings
  screen); acceptable since no platform admin UI is in scope for F002 anyway (`docs/F002_PLAN.md` §1).

**Option B — New `PlatformSettings` singleton table**
- Pro: Runtime-tunable without a Render restart; mirrors `OrganizationSettings`'s shape for a familiar
  pattern.
- Con: Introduces a platform-wide settings concept and its own admin surface (who edits it, and via
  which endpoint?) that nothing today requires; that endpoint would itself need a `require_platform_operator`
  guard that doesn't otherwise need to exist yet in F002.

**Option C — Hardcoded fixed thresholds in code**
- Pro: Zero configuration surface, fastest to implement.
- Con: Breaks the precedent D-030 already set — that abuse thresholds are operationally configurable,
  not baked into code — and removes the ability to loosen/tighten limits under real incident pressure
  without a code deploy.

### Security Impact

These limits are the primary defense against credential stuffing, password-spraying, and
password-reset abuse (mass token issuance, email-bombing, user-enumeration via response timing).
Must rate-limit both per-IP (coarse, unreliable behind CGNAT/shared proxies — the same caveat RFC-010
already documents for public signup) and per-account/email (primary signal). Responses must be a
generic `429` that does not reveal which dimension (IP vs. email) triggered the limit.

### SaaS / Multi-Organization Impact

Because login is not organization-scoped, the limit must be genuinely platform-wide: an attacker
hitting org A's `/admin` login page and org B's login page is hitting the same backend endpoint and,
if targeting one account, must be governed by one shared budget — not per-organization budgets that a
multi-org attack could bypass by spreading requests across organizations. This is the concrete reason
these limits cannot live in `OrganizationSettings`.

### Implementation Impact

A handful of `Settings` fields plus a rate limiter. No Redis/cache layer exists in the stack today
(only PostgreSQL; see `docker-compose.yml`). For V1, an in-process or DB-backed limiter is sufficient
given a single Render web service instance; horizontal scaling to multiple instances later would need a
shared store (e.g. Redis) — flagged as a known V1 limitation, not a blocker, and not a reason to add
Redis now.

### Recommendation

**Option A.** Consistent with the existing configuration pattern, avoids inventing a persisted
"platform settings" concept and its admin surface before anything else needs one, and is changeable
operationally (env var + restart) without a code deploy — practical for V1. Revisit Option B only if a
platform admin panel is built later (out of F002's scope per `docs/F002_PLAN.md` §1) and needs
broader runtime-tunable settings anyway.

### Exact Wording for Product Owner Approval — APPROVED, ratified as D-038

> Authentication-related rate limits (login, token refresh, password-reset requests, invitation
> acceptance, and other sensitive auth actions) are platform-wide, not organization-scoped, and each
> action has its own limit with a conservative default. They are configured via environment-variable-
> backed application settings (following the existing `Settings` pattern in `app/core/config.py`), not
> via `OrganizationSettings` and not via a new database table, in Version 1.

---

## P-3 — Cross-Site Cookie and CSRF Strategy

**Status: APPROVED as D-039.** Refined Option A, with the Product Owner's explicit additions beyond
the original recommendation: (1) a concrete, well-defined CSRF token strategy must be specified in
`docs/F002_PLAN.md` itself, not left as a one-line mention of "a custom header"; (2) `Host` must be
validated consistently alongside `Origin`, not `Origin` alone; (3) wildcard origins combined with
credentials are explicitly forbidden as a standing rule, not merely implied by using an allowlist; (4)
missing, mismatched, or unapproved origins must be rejected outright; (5) the future same-site BFF/
custom-domain proxy is kept in the backlog, not just "worth considering later." §10 of
`docs/F002_PLAN.md` ("CSRF, Origin, and Host Validation Strategy") now specifies this in full
(HMAC-based signed double-submit token, bound to the session, delivered via a readable cookie and
echoed in a custom header; dynamic DB-backed origin allowlist; Host/Origin cross-check).

### Problem

Frontend (Vercel) and backend (Render) are different registrable domains today, and organizations may
add further custom domains later (`Organization.customDomain`, F001). Access and refresh tokens are
carried as `httpOnly` cookies (`docs/F002_PLAN.md` §8–9) so they're inaccessible to JS/XSS, but cookies
crossing site boundaries raise two linked questions: (1) does the browser send the cookie at all
(`SameSite` policy), and (2) how is CSRF prevented once it does. The answer also has to keep working
as more organizations attach custom domains, not just for the current two fixed hosts.

### Available Options

**Option A — Direct cross-site cookies (`SameSite=None; Secure`) with a dynamic origin allowlist**

Cookies set directly by Render for the Render domain, sent cross-site to Vercel-originated requests.
Because `SameSite=None` cookies are sent to any origin the browser is told to trust, the real defense
is the CORS layer: only allow-listed origins get a successful preflight, and all state-changing
endpoints require a JSON body (`Content-Type: application/json`), which forces a CORS preflight for any
cross-origin call — a cross-site HTML form or `<img>` tag cannot trigger it, so a correct origin
allowlist is already a strong CSRF defense for a JSON-only API, without a separate CSRF token scheme.
The refinement this option needs: today's `CORS_ALLOWED_ORIGINS` (`app/core/config.py`) is a **static**
comma-separated env var — every new organization custom domain would otherwise require a backend env
var edit and restart just to allow login from it. Refined Option A validates the `Origin` header
dynamically against the database (`Organization.customDomain` plus the platform's own subdomain
pattern) instead of, or in addition to, the static list.
- Pro: No new service/infrastructure layer; works unmodified as custom domains are added, once the
  allowlist check is DB-backed; keeps the existing direct frontend→backend fetch pattern already used
  in `frontend/lib/organization.ts`.
- Con: Requires replacing the static CORS origin check with a dynamic one (small, contained backend
  change, out of scope for this planning document to implement); `SameSite=None` cookies are a slightly
  larger CSRF surface than same-site cookies, resting more weight on the CORS/preflight defense being
  implemented correctly.

**Option B — Next.js BFF proxy (rewrite `/api/*` from the frontend to the Render backend)**

The browser only ever talks to whichever Vercel-attached domain served the page (subdomain, custom
domain, or the platform's own domain); Next.js server-side code forwards the request to Render. Cookies
become first-party from the browser's point of view (set for the Vercel-attached domain), so
`SameSite=Lax` suffices and CSRF risk drops further.
- Pro: Strongest CSRF posture (first-party cookies); if every organization custom domain is attached to
  the same Vercel project (which F001's custom-domain resolution already implies someone configures),
  this generalizes to custom domains too, and the backend's CORS allowlist can even collapse to "same
  Vercel deployment only" — arguably fewer moving parts long-term than Option A's dynamic allowlist.
- Con: New implementation surface not present today: authenticated calls must go through Next.js route
  handlers/server actions instead of the direct `fetch(NEXT_PUBLIC_API_URL, …)` pattern currently used
  for public data; more code to write and test for F002 than Option A; couples frontend and backend
  request routing more tightly.

### Security Impact

Both options are production-grade if implemented correctly; the difference is where the CSRF defense
lives. Option A leans on strict origin validation at the CORS layer (must be airtight — a
misconfigured wildcard or overly permissive suffix match would be a real cross-tenant CSRF hole, given
that a stolen/forged request against one organization's admin session could act with that session's
role). Option B leans on `SameSite=Lax` doing most of the CSRF work, with CORS as a secondary layer. In
both cases, `Secure` and `httpOnly` are non-negotiable regardless of which option is chosen.

### SaaS / Multi-Organization Impact

This is the crux of the decision: how does the chosen strategy behave as organizations bring more
custom domains? Option A needs the CORS allowlist to become DB-backed (a contained, one-time backend
change) but then requires zero per-domain configuration afterward. Option B needs each new custom
domain attached to the Vercel project (an operational step that F001's custom-domain support already
implies happens regardless of this decision), after which the proxy pattern covers it automatically
with no backend change at all. Both scale to arbitrary custom domains; they differ in which side (
backend DB-driven allowlist vs. frontend domain attachment) carries the "new domain" operational step.

### Implementation Impact

Option A: swap the static CORS origin check for a DB-backed one (contained backend change); no new
service. Option B: add Next.js route handlers/server actions that proxy authenticated calls and forward
`Set-Cookie`; touches every authenticated frontend call site, more surface for F002's Step 8 (frontend
auth shell) to cover, and a new class of proxy-specific bugs (header/cookie forwarding correctness)
that Option A does not have.

### Recommendation

**Option A (refined with a DB-backed origin allowlist).** It keeps F002 to one contained backend
change instead of introducing a new proxy layer across every authenticated frontend call, satisfies
"not overengineered" for V1, and — once the allowlist is dynamic — scales to future custom domains
without further changes on either side. Option B remains a legitimate future hardening step (noted as
such in `docs/F002_PLAN.md` §22 P-3) if a stronger same-site CSRF posture is wanted later; adopting it
then does not require undoing Option A's cookie design, only adding the proxy layer on top.

### Exact Wording for Product Owner Approval — APPROVED, ratified as D-039

> Access and refresh tokens are transported as `HttpOnly`, `Secure` cookies; `SameSite=None` is used
> while frontend and backend remain on different sites. Allowed CORS origins are resolved dynamically
> from the database (`Organization.customDomain` and known subdomain patterns for both platform and
> organization domains), never a static environment variable and never a wildcard combined with
> credentials. `Origin` and `Host` are validated consistently on every request; missing, mismatched, or
> unapproved values are rejected. Every state-changing, cookie-authenticated request additionally
> requires a CSRF token following the double-submit strategy defined in `docs/F002_PLAN.md` §10: a
> server-issued, HMAC-signed token bound to the session, delivered via a readable (non-`HttpOnly`)
> cookie and echoed back in a custom request header, validated with a constant-time comparison. A
> same-site Next.js BFF proxy for future custom-domain hardening is recorded in `docs/BACKLOG.md`, not
> built in Version 1.

---

## P-4 — Email Transport for Invitations and Password Reset

**Status: APPROVED as D-040.** Option B, refined: failed sends must be logged and visible to
operators (not just "logged" generically), retries must be safe, and the doc must state explicitly
that password-reset/invitation tokens remain secure even when delivery fails — codified because the
token is always persisted only as a hash before the send attempt, so a failed send never leaves a
usable secret anywhere except the one email that may or may not have arrived.

### Problem

No email-sending capability exists anywhere in the codebase, `docker-compose.yml`, or `render.yaml`
today. Both the forgotten-password flow and the staff-invitation flow (`docs/F002_PLAN.md` §14–15)
require sending a link containing a bearer token to an email address. A transport and a sending
strategy (synchronous vs. deferred) must be chosen.

### Available Options

**Option A — Synchronous SMTP send within the request, via a provider-agnostic `EmailSender` interface**
- Pro: No new infrastructure; env-var-configured (host/port/credentials/from-address), so no specific
  vendor is coupled into application code.
- Con: Request latency includes the SMTP round trip (typically well under a second, acceptable at V1's
  volume); a transient SMTP outage would need explicit handling so the user-facing request doesn't fail
  outright even though the token was already persisted.

**Option B — Same `EmailSender` interface, dispatched via FastAPI `BackgroundTasks` (in-process, no
new worker/queue)**
- Pro: Removes email latency from the request/response cycle entirely; a transient SMTP failure no
  longer affects the HTTP response (the token still exists and can be resent via a repeat request); no
  new infrastructure — `BackgroundTasks` runs in the same process, unlike a real task queue.
- Con: If the web process restarts between accepting the request and the background task completing,
  the email silently doesn't send (acceptable for a password-reset/invite email — the user or admin
  can simply retry the action) but must be understood as a real, if narrow, gap.

**Option C — Background job via a dedicated queue (Celery/RQ) with a broker**
- Pro: Retries on failure, decoupled worker process, most resilient to transient outages.
- Con: New infrastructure not present anywhere in the current stack (no Redis/broker in
  `docker-compose.yml` or `render.yaml`), a new deployable process on Render, new operational surface
  (monitoring a queue, dead-letter handling) — disproportionate to sending two kinds of low-volume
  transactional email in V1.

**Option D — Third-party transactional email API (e.g. a provider's HTTP API) instead of raw SMTP**
- Pro: Better deliverability out of the box (reputation, DKIM/SPF handled by the provider), built-in
  bounce/complaint handling.
- Con: A commercial/vendor decision (cost, data-processing terms) that belongs to the Product Owner,
  not something to default into silently; also couples the concrete adapter to a specific provider SDK
  unless abstracted the same way Option A already proposes.

### Security Impact

The emails sent carry bearer tokens (invitation/reset links) that grant real access if intercepted.
Regardless of which option is chosen: the SMTP relay connection must use TLS (STARTTLS/SMTPS); raw
tokens must never appear in application logs (log only "email sent" / "email failed", never the token
or the full link); tokens remain short-lived and single-use (already specified in
`docs/F002_PLAN.md` §14–15) so transport reliability is a UX concern, not a security backstop.

### SaaS / Multi-Organization Impact

Invitation and reset emails should feel branded per organization for a professional multi-tenant
experience (organization display name in the subject/body), but the underlying send identity
(envelope-from address, DKIM-signing domain) should stay platform-controlled (e.g. a single
`no-reply@<platform-domain>` address), not per-organization. Attempting a per-organization envelope
sender without each organization owning proper SPF/DKIM records is a common, hard-to-diagnose
deliverability failure mode — worth avoiding explicitly rather than discovering in production.

### Implementation Impact

An `EmailSender` protocol with one SMTP implementation (env-var configured) and one dev/console
implementation (used in local development and `AppEnv.TEST`, so tests never perform real network
sends), plus `BackgroundTasks` wiring at the two call sites (`forgot-password`, `invitation create`/
`accept`). No new deployable process, no new broker.

### Recommendation

**Option B.** It avoids new infrastructure (no broker, no worker process — satisfying "not
overengineered" for V1) while still keeping email latency off the request path, which Option A alone
does not. The `EmailSender` abstraction keeps Option D available later purely as a configuration/
adapter change if deliverability from raw SMTP proves insufficient in production — worth flagging now:
whatever SMTP relay is configured in Render's environment should be a reputable transactional relay,
not a self-hosted mail server, even though the application code itself stays provider-agnostic.

### Exact Wording for Product Owner Approval — APPROVED, ratified as D-040

> Transactional email (password reset, staff invitations) is sent through a provider-agnostic
> `EmailSender` interface, dispatched off the request's critical path via FastAPI `BackgroundTasks` (no
> new queue/worker infrastructure in Version 1). The concrete transport is SMTP, configured entirely
> through environment variables on Render. The specific SMTP relay/provider is an operational choice
> made when configuring the Render environment, not a vendor dependency embedded in application code.
> The envelope sender/DKIM identity is platform-controlled, not per-organization; organization branding
> in these emails is limited to display name/content, not the sending identity. Failed sends are logged
> with metadata only (recipient, subject, outcome — never the body or the token) and are visible to
> operators; the underlying reset/invitation token remains valid, single-use, and hashed-at-rest
> regardless of send outcome, so a failed send is always safely retryable. Raw tokens and secrets are
> never written to any log.

---

## Approval Checklist

**All four decisions approved by the Product Owner.** Ratified in `docs/DECISIONS.md`:

- [x] **P-1 Platform Operator representation** — **Option A**, nullable `User.platformRole` enum,
      never writable via public or admin API, assignable only through a controlled platform-admin
      process. Ratified as **D-037**.
- [x] **P-2 Auth rate-limit configuration location** — **Option A**, env-var-backed `Settings`
      fields, platform-wide, one limit per sensitive auth action (login, refresh, password reset,
      invitation acceptance, …), conservative defaults, not in `OrganizationSettings`. Ratified as
      **D-038**.
- [x] **P-3 Cross-site cookie, CORS, and CSRF strategy** — refined **Option A**: `HttpOnly`/`Secure`
      cookies, `SameSite=None`, database-backed dynamic origin allowlist (no wildcards with
      credentials), consistent `Origin`/`Host` validation, mandatory double-submit CSRF token on every
      state-changing cookie-authenticated request. BFF proxy moved to `docs/BACKLOG.md`. Ratified as
      **D-039**.
- [x] **P-4 Email transport** — **Option B**, provider-agnostic `EmailSender` over SMTP, dispatched
      via FastAPI `BackgroundTasks`, no new broker/worker in V1, failed sends logged (metadata only)
      and operator-visible, tokens remain safely retryable. Ratified as **D-040**.

`docs/F002_PLAN.md` has been updated to reflect all four ratified decisions and no longer contains
unresolved decision placeholders (see its §23).
