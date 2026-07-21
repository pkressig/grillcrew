# F002 Implementation Plan – Authentication and Organization Permissions

**Status:** approved. Decisions P-1–P-4 were ratified by the Product Owner as **D-037–D-040** in
`docs/DECISIONS.md` (detailed rationale in `docs/F002_DECISIONS.md`). This document contains no
unresolved decision placeholders; implementation proceeds per the roadmap in §22.

**Scope source:** `docs/FEATURES.md` (F002), `docs/PRD.md` §5.3, `docs/ARCHITECTURE.md` (Permissions,
Tenant Model), `docs/DATA_MODEL.md` (User, StaffMembership, AuditEvent), `docs/PERMISSIONS.md`,
`docs/DECISIONS.md` (D-025, D-034, D-037, D-038, D-039, D-040), `docs/BUSINESS_RULES.md` (BR-000,
BR-010), `docs/F002_DECISIONS.md`.

## 1. Scope Boundary

In scope (matches F002 acceptance criteria in `docs/FEATURES.md`):

- Email/password login for `User` accounts (Platform Operator, Organization Admin, Staff).
- Organization-scoped role checks combining authenticated user + resolved organization + `StaffMembership`.
- Logout, refresh, forgotten password, and staff invitation flows.
- Backend guard utilities that make every future organization-scoped endpoint enforceable.

Explicitly out of scope for F002 (do not build now):

- Volunteer self-service accounts (PRD 5.3 "optional volunteer account later"; not part of F002's
  user stories in `docs/FEATURES.md`).
- Any platform-administration screens or endpoints beyond the guard mechanism itself — no feature in
  `docs/FEATURES.md` (F001–F014) specifies a platform admin panel yet, so F002 only makes the
  `PLATFORM_OPERATOR` check possible, it does not build screens for it. The controlled platform-admin
  process required by D-037 to assign `platformRole` is therefore an operational/ops procedure
  (direct database action), not an application feature, in Version 1.
- Fine-grained/custom permissions — `docs/RFC.md` RFC-005 already rejected this (Option C) in favor of
  the fixed four-role matrix (D-025).
- Logout-of-all-devices, IP/device audit trails — cheap to add later on top of the `refresh_token`
  table, but not requested by any acceptance criterion; adding them now would violate CLAUDE.md's
  "do not invent additional product features."
- A same-site Next.js BFF/proxy architecture for cookies — recorded in `docs/BACKLOG.md` per D-039,
  not built in Version 1.

## 2. Fit With Existing Architecture (no prior decision is changed)

F002 extends, and does not contradict, F001:

- Organization resolution (`app/services/organization_context.py::resolve_organization`, domain →
  subdomain → path → dev override, D-036) is **reused as-is** for authenticated, organization-scoped
  requests. Admin/staff routes resolve their organization exactly like public routes do, so a
  logged-in Koordination member reaches `{org-domain}/admin/...` the same way a visitor reaches
  `{org-domain}/`. This avoids inventing a second, parallel "current organization" concept (e.g. an
  org id baked into the JWT), which would fight the multi-org-per-user rule in `docs/ARCHITECTURE.md`
  ("A user may be Admin in one organization and have no access to another").
- `docs/DATA_MODEL.md` already reserves `User`, `StaffMembership`, and `AuditEvent` in its ER diagram
  and field lists, but no migration has created them yet (only `0001_create_organization.py` and
  `0002_platform_core_organization.py` exist). F002 is the feature that finally materializes them —
  this is completion of the documented model, not a change to it.
- `docs/DECISIONS.md` D-025/RFC-005 fixed the four `StaffMembership.role` values
  (`ADMIN`, `KOORDINATION`, `KIOSK`, `VORSTAND_LESEN`). F002 implements exactly these, unchanged.
- CORS in `app/main.py` currently uses a static `CORS_ALLOWED_ORIGINS` allowlist with
  `allow_credentials=True`. D-039 replaces the static list with a dynamic, database-backed allowlist
  (§10) built from the `Organization` table that F001 already migrated — no new migration is needed to
  support this.

No existing decision needs to be reversed. Two gaps existed that `docs/DATA_MODEL.md` did not
anticipate: a platform-level role flag on `User` (closed as **D-037**) and three new token tables for
refresh/reset/invitation (schema additions the ER diagram hadn't foreseen, not themselves requiring
product-level ratification). Both are additive.

## 3. Architecture Overview

```text
Browser (Next.js, org-branded or platform login page)
  -> Backend API (FastAPI)
       AuthN: cookie-based JWT access token + rotating opaque refresh token
       AuthZ: get_current_user -> resolve_organization (existing F001 service) -> StaffMembership lookup
       CSRF/Origin: dynamic origin allowlist + Host cross-check + double-submit CSRF token (§10)
  -> PostgreSQL (user, staff_membership, refresh_token, password_reset_token, invitation, audit_event)
```

Two independent guard mechanisms, composed per endpoint:

1. **Organization-scoped guard** (most future endpoints): `require_staff_role(*roles)` — needs a
   resolved organization, an authenticated user, and an active `StaffMembership` with an allowed role.
2. **Platform guard** (rare, `/api/platform/*` only): `require_platform_operator` — needs an
   authenticated user with `User.platform_role == PLATFORM_OPERATOR`; no organization involved.

Frontend route hiding remains convenience only, exactly as `docs/ARCHITECTURE.md` mandates; every
guard above is enforced server-side.

## 4. Database Changes

Two new Alembic migrations, kept separate because they serve different purposes (see §20):

**Migration A – core identity (already implied by `docs/DATA_MODEL.md`'s ER diagram):**

- `user`
- `staff_membership`
- `audit_event`

**Migration B – F002-specific auth tokens (net-new tables not previously in `docs/DATA_MODEL.md`):**

- `refresh_token`
- `password_reset_token`
- `invitation`

All tables follow existing conventions: UUID PK with `gen_random_uuid()` server default, `created_at`
(and `updated_at` where the row is mutated after creation), the naming convention already registered
in `app/db/base.py`.

## 5. Entities

### User (extends the stub in `docs/DATA_MODEL.md`)

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| emailNormalized | string, unique, indexed | login identifier, lower-cased/trimmed |
| displayName | string, nullable | filled by the user at invitation acceptance |
| passwordHash | string, nullable | null until an invitation is accepted (see §11) |
| status | enum `INVITED \| ACTIVE \| DISABLED` | replaces the untyped `status` placeholder |
| platformRole | enum `PLATFORM_OPERATOR`, nullable | **new field**, D-037: never writable via any public or admin API; assignable only through a controlled platform-admin process |
| createdAt | timestamp | |

### StaffMembership (as documented, now materialized)

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organizationId | UUID FK → organization | |
| userId | UUID FK → user | |
| role | enum `ADMIN \| KOORDINATION \| KIOSK \| VORSTAND_LESEN` | D-025, unchanged |
| active | boolean | admin can deactivate without deleting history |
| scope | string, nullable | reserved, unused in V1 (per RFC-005) |

Constraint: partial unique index on `(organization_id, user_id) WHERE active` — at most one *active*
role per user per organization, matching the fixed-matrix model; no stacking of active roles within a
single organization in V1. The index is partial rather than a plain unique constraint precisely because
`active` rows are deactivated, not deleted (see `active` above): a user can accumulate multiple inactive
`StaffMembership` rows over time (history) while never having more than one active row at once, so
re-inviting a previously deactivated staff member can insert a new row instead of being blocked by their
old, inactive one. Per D-037, organization roles remain exclusively here — `User.platformRole` is never a
substitute for a `StaffMembership` check.

### AuditEvent (as documented, now materialized)

Exactly the fields already listed in `docs/DATA_MODEL.md`. Used by F002 for: `StaffMembership` role
grants/changes (invitation acceptance, admin edits) and password resets. Individual login/logout
events are **not** audited, to honor "minimize and protect personal data" (CLAUDE.md) — no acceptance
criterion requires a login audit trail, and BR-010's audit list (role, money, settings, imports,
corrections) does not include authentication events.

### RefreshToken (new)

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| userId | UUID FK → user | |
| tokenHash | string, unique, indexed | SHA-256 of the opaque token; raw value never stored |
| familyId | UUID, indexed | groups a rotation chain for reuse detection; also the CSRF-token binding key (§10) |
| expiresAt | timestamp | |
| revokedAt | timestamp, nullable | set on logout or on reuse detection |
| createdAt | timestamp | |

No IP address or user-agent column in V1 — same data-minimization reasoning as AuditEvent above; this
can be added later without a breaking migration if abuse monitoring needs it.

### PasswordResetToken (new)

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| userId | UUID FK → user | |
| tokenHash | string, unique, indexed | |
| expiresAt | timestamp | default 1 hour |
| usedAt | timestamp, nullable | single-use |
| createdAt | timestamp | |

### Invitation (new)

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organizationId | UUID FK → organization | |
| emailNormalized | string, indexed | |
| role | enum, same `StaffRole` as `StaffMembership.role` | |
| tokenHash | string, unique, indexed | |
| invitedByUserId | UUID FK → user | |
| expiresAt | timestamp | default 7 days |
| acceptedAt | timestamp, nullable | |
| revokedAt | timestamp, nullable | admin can cancel a pending invite |
| createdAt | timestamp | |

Recommended partial unique index: `(organization_id, email_normalized)` where
`accepted_at IS NULL AND revoked_at IS NULL` — prevents duplicate active invitations for the same
person in the same organization at the database level, not just in application code.

Both token tables and `Invitation` follow the existing rule already stated in
`docs/ARCHITECTURE.md` ("Store management tokens only as hashes"), generalized from
`Signup.managementTokenHash` to every bearer token this feature introduces.

## 6. Role System

Unchanged from D-025/RFC-005/`docs/PERMISSIONS.md`: four organization-scoped roles
(`ADMIN`, `KOORDINATION`, `KIOSK`, `VORSTAND_LESEN`) with the fixed rights matrix already published.
V1 actively assigns `ADMIN` and `KIOSK`; `KOORDINATION` and `VORSTAND_LESEN` exist in code but are
granted only when actually needed, per the RFC-005 recommendation.

Added by F002 (not a role, a separate platform-level flag, D-037): `User.platformRole = PLATFORM_OPERATOR`.
It is deliberately **not** a `StaffMembership` row, because platform operation is not organization-
scoped — it is a platform-wide capability, orthogonal to the tenant model in
`docs/ARCHITECTURE.md`.

## 7. Permissions Enforcement (Middleware / Dependencies)

FastAPI dependencies, composed in this fixed order so error codes never leak more than the existing
public endpoints already do:

1. `get_current_organization` — reuses `resolve_organization` unchanged; 404 if unresolved. (Same
   information a public visitor could already obtain from `/api/public/organization`, so resolving it
   before authentication leaks nothing new.)
2. `get_current_user` — reads the access-token cookie, verifies the JWT, loads the `User` row fresh
   from the database by id. A DB round trip per request is a deliberate choice over pure JWT
   statelessness: the next dependency needs a `StaffMembership` query anyway, so the marginal cost is
   one indexed lookup, and it buys immediate effect for `User.status = DISABLED` (an admin disabling
   an account takes effect on the very next request, not only after the access token expires).
   401 if missing/invalid/expired token or `status != ACTIVE`.
3. `require_staff_role(*roles: StaffRole)` — loads `StaffMembership` for `(user.id, organization.id)`;
   403 if missing, inactive, or role not in the allowed set.
4. `require_platform_operator` — checks `user.platformRole == PLATFORM_OPERATOR` directly; no
   organization dependency; mounted only under `/api/platform/*`.

`app/middleware/organization_context.py` is untouched — it only ever attached lookup *hints*; the
actual resolution already happens per-request via the dependency, which F002 reuses.

## 8. JWT Strategy (Access Token)

- Library: `PyJWT` (actively maintained; avoids the CVE history of `python-jose`).
- Algorithm: HS256, symmetric secret (`JWT_SECRET_KEY`, new required env var, never committed —
  consistent with PRD §6 "secure handling of secrets outside the repository" and the existing
  Render/Vercel secret-management pattern in `docs/DEPLOYMENT.md`).
- Claims: `sub` (user id), `iat`, `exp`, `jti`. **No organization id and no role in the token.**
  Baking in a role would go stale the moment an admin changes it, and baking in an organization would
  contradict the multi-org-per-user model — role/org are always re-checked against the database per
  request via `require_staff_role`.
- Lifetime: 15 minutes.
- Transport: `HttpOnly`, `Secure`, `SameSite=None` cookie (frontend on Vercel, backend on Render are
  different registrable domains today, so cross-site cookies are required, per D-039 — see §10 for the
  full CORS/CSRF design that makes this safe). Never returned in a JSON body, to reduce the XSS blast
  radius.

## 9. Refresh Token Strategy

- Opaque random value (256-bit, `secrets.token_urlsafe`), not a JWT — nothing needs to be decoded
  client-side.
- Stored server-side only as its SHA-256 hash in `refresh_token`, exactly like `Signup.managementTokenHash`.
- Rotation on every use: `/api/auth/refresh` validates the presented token, revokes it
  (`revoked_at = now()`), issues a new refresh token in the same `family_id`, and a new 15-minute
  access token.
- Reuse detection: if a token with `revoked_at IS NOT NULL` is presented again, the entire `family_id`
  is revoked and both cookies are cleared — this is the standard signal that a refresh token was
  stolen and later reused by both the legitimate client and an attacker.
- Lifetime: 30 days, refreshed (sliding) on each successful rotation.
- Transport: `HttpOnly`, `Secure`, `SameSite=None` cookie, scoped via `Path=/api`. CSRF validation on
  authenticated admin writes needs the refresh-family binding, so the cookie must reach `/api/admin`
  as well as `/api/auth`; the API-only path avoids attaching it to frontend/non-API routes.
- `family_id` doubles as the CSRF-token binding key (§10) — revoking a family invalidates its CSRF
  tokens as a side effect, with no separate cleanup mechanism needed.

## 10. CSRF, Origin, and Host Validation Strategy (D-039)

This section is the binding specification referenced by D-039; it replaces any looser prior mention of
"a custom header" with a concrete, implementable design.

### 10.1 Dynamic origin allowlist (CORS)

- The CORS origin allowlist is resolved dynamically, not from a static env var alone: platform origins
  (the platform's own app domain(s)) come from `Settings`; organization origins come from
  `Organization.customDomain` and the slug-derived subdomain pattern F001's
  `organization_context.py` already uses for public resolution. `Organization` already exists
  (migrated in F001), so this allowlist needs no new migration.
- Wildcard origins (`*`) combined with `allow_credentials=True` are forbidden as a standing rule, not
  merely avoided by convention — the current `CORSMiddleware` setup already uses an explicit list and
  stays that way.
- A missing, malformed, or unapproved `Origin` is rejected outright; there is no default-allow
  fallback, matching the fail-closed pattern F001 already established for organization resolution
  (`resolve_organization` never falls back in production).

### 10.2 Host/Origin cross-check

- Every request additionally checks that the `Host` header's hostname matches the resolved `Origin`
  header's hostname (when both are present), before organization resolution or authentication
  proceeds. This defends against a request whose `Origin` cleared CORS but whose `Host` was
  manipulated to point at a different tenant than the one the browser's own same-origin checks
  believe it is talking to.

### 10.3 CSRF token — signed double-submit cookie

Required on every state-changing (`POST`/`PUT`/`PATCH`/`DELETE`) request that relies on the
cookie-authenticated session — i.e. everything **except** `POST /api/auth/login` (no session cookie
exists yet at that point; protected instead by the Origin/CORS-preflight check in §10.1, the standard
defense for "login CSRF") and public token-gated endpoints such as invitation accept (protected by
possession of the emailed token, not by a cookie session).

1. On login and on every refresh, the server generates a CSRF token: a random nonce plus
   `HMAC-SHA256(csrf_secret, refresh_token_family_id + ":" + nonce)`, where `csrf_secret` is derived
   from `JWT_SECRET_KEY` via a fixed-context HMAC (key separation, so a leak of one derived key does
   not hand over the other).
2. The token is set as a **readable** (non-`HttpOnly`) cookie (`gc_csrf`), alongside the `HttpOnly`
   access/refresh cookies, with the same `Secure`/`SameSite=None` attributes.
3. Because the frontend and API use different origins, the authenticated frontend obtains the same
   family-bound proof through `GET /api/auth/csrf` after session hydration. That safe endpoint requires
   an allowlisted `Origin` and a valid refresh cookie, returns only `{csrf_token}`, and does not rotate
   or expose access/refresh tokens. The frontend keeps the returned token in memory and echoes it in
   the `X-CSRF-Token` request header on every state-changing call; the readable cookie remains a
   same-origin fallback.
4. The server recomputes the HMAC over the presented nonce and the caller's *current*
   `refresh_token_family_id`, and compares it to the presented signature with a constant-time
   comparison (`hmac.compare_digest`). A missing header, a mismatched signature, or a token bound to a
   different (e.g. already-revoked) family is rejected with `403`.
5. Because the token is bound to the refresh-token family, revoking that family (logout, password
   reset, reuse-detection per §9) invalidates its CSRF tokens as a side effect — no separate CSRF-token
   table, expiry job, or cleanup mechanism is needed.

This works because a cross-site attacker can make the browser *send* a request (that is what CSRF is),
but — given the origin allowlist in §10.1 — cannot read the `gc_csrf` cookie's value from script
running on their own origin, so they cannot produce a matching `X-CSRF-Token` value. This is the
standard "signed double-submit cookie" pattern, and it needs no server-side token storage.

### 10.4 Deferred

A same-site Next.js BFF proxy (first-party cookies, `SameSite=Lax`, simpler CSRF story) is recorded in
`docs/BACKLOG.md` as a future hardening option, to revisit if the operational cost of maintaining the
dynamic allowlist becomes real. Not built in Version 1.

## 11. Password Hashing

- Library: `argon2-cffi` (Argon2id), current OWASP recommendation, actively maintained — preferred
  over `passlib[bcrypt]`, whose upstream maintenance has slowed.
- Verification against a dummy hash when the looked-up email does not exist, so login timing does not
  reveal whether an account exists (defense in depth on top of the generic error message in §13).
- Password policy: minimum length 10 characters, no forced composition rules (current NIST guidance:
  length over complexity). This is an implementation default, not a product decision requiring
  ratification.

## 12. Organization Isolation

Enforced at two layers, matching `docs/ARCHITECTURE.md`'s "Role checks must combine: authenticated
user, current organization, staff membership, role permission":

1. **Resolution layer** — the organization is resolved once per request (§7 step 1), from the request
   itself (domain/subdomain/path), never from a client-supplied "current org" claim that could be
   forged or stale.
2. **Membership layer** — every organization-scoped query additionally filters by the resolved
   organization's id, and `require_staff_role` refuses access if no active `StaffMembership` exists
   for that exact `(user, organization)` pair. A user with `ADMIN` in organization A gets a plain 403
   when visiting organization B's admin routes, even though they are fully authenticated.

Cross-organization leakage tests (§19) explicitly cover: same user, two organizations, role granted in
one only.

## 13. Login Flow

`POST /api/auth/login {email, password}`

1. Normalize email; look up `User`.
2. Verify password (dummy-hash fallback if user not found, per §11).
3. Reject with a single generic `401 invalid credentials` for: unknown user, wrong password,
   `status != ACTIVE` (including `INVITED`, so an unaccepted invite doesn't leak "this email exists").
4. On success: issue access + refresh + CSRF tokens as cookies (§8, §9, §10). Response body returns the
   current user's profile and their `StaffMembership` list (organization slug, name, role) — this is
   what the frontend organization switcher renders; no bearer tokens in the body.
5. No audit event (see §5 AuditEvent rationale).
6. Rate-limited per account and per IP, per D-038's dedicated `login_per_account`/`login_per_ip` limits
   (§10 covers CSRF/Origin; rate limiting is a separate, complementary defense — see §16 step 6).

## 14. Logout Flow

`POST /api/auth/logout`

1. Read the refresh token cookie, revoke the matching `refresh_token` row (`revoked_at = now()`).
2. Clear all three cookies (access, refresh, CSRF; `Max-Age=0`).
3. Idempotent: calling it with no/invalid cookie still returns success.

## 15. Forgotten Password Flow

`POST /api/auth/forgot-password {email}`

1. Always respond `202 Accepted`, regardless of whether the email exists (no enumeration).
2. If a matching `ACTIVE` user exists: invalidate their outstanding unused reset tokens, create one
   `PasswordResetToken` (1 hour expiry), send an email containing the raw token as a link
   (`/reset-password/{token}`) via the `EmailSender` abstraction (D-040), dispatched through FastAPI
   `BackgroundTasks`; only the hash is persisted before the send attempt, so the token is safely
   retryable regardless of delivery outcome.
3. Rate-limited per account and per IP, per D-038's dedicated `password_reset_request_per_account`/
   `password_reset_request_per_ip` limits.

`POST /api/auth/reset-password {token, new_password}`

1. Look up by token hash; reject if missing, expired, or already used.
2. Set the new `passwordHash`, mark `used_at = now()`.
3. Revoke **all** of that user's refresh tokens (forces re-login on every device — the standard
   response to a password reset, since the old password may have been compromised).
4. Write an `AuditEvent` (`action = PASSWORD_RESET`, `metadata = {}` beyond the fact it happened,
   to avoid persisting the password itself in any form).

## 16. Invitation Flow

`POST /api/admin/{organization_slug}/invitations {email, role}` — `ADMIN` only.

1. Normalize email. If no `User` with that email exists, create one with `status = INVITED`,
   `passwordHash = NULL`. If one already exists (e.g. staff at another organization), reuse it.
2. Reject if an active (`accepted_at IS NULL AND revoked_at IS NULL`) invitation already exists for
   `(organization, email)` — surfaced via the partial unique index in §5.
3. Create `Invitation` (7-day expiry), send an email with the raw token
   (`/invite/{token}`) via `EmailSender`/`BackgroundTasks` (D-040); only the hash is persisted.
4. **Deliberately does not create `StaffMembership` yet** — access is granted only on acceptance, so a
   mistyped or intercepted invitation never itself grants access.

`GET /api/invitations/{token}` — public, token-gated preview (organization name + offered role), for
the frontend accept screen to render without requiring login first. **Not implemented in Step 7**;
planned for Step 8 alongside the `/invite/[token]` frontend page.

`POST /api/auth/accept-invitation {token, display_name, password?}` — public, token-gated,
rate-limited per D-038's `invitation_accept_per_token`/`invitation_accept_per_ip` limits. Implemented
under `/api/auth` (not `/api/invitations` as originally sketched here) so it shares the auth router's
public-endpoint origin/Host handling with `/api/auth/reset-password`.

1. Validate token hash, expiry, not already accepted/revoked.
2. If the target `User.status == INVITED` (brand-new account): require `password`, set `passwordHash`,
   `displayName`, `status = ACTIVE`. If the target user already existed and is `ACTIVE` (already has an
   account from another organization), no password is needed — they just gain a new membership.
3. Create `StaffMembership(organization, user, role, active=true)`.
4. Mark `invitation.accepted_at = now()`.
5. Write an `AuditEvent` (`action = STAFF_MEMBERSHIP_GRANTED`, `entityType = staff_membership`),
   satisfying BR-010's requirement to log role/permission changes.

`DELETE /api/admin/{organization_slug}/invitations/{id}` — `ADMIN` only, sets `revoked_at`.
**Not implemented in Step 7**; planned for a follow-up admin invitation-management step.

## 17. API Structure

```text
/api/auth/login                          POST   public
/api/auth/logout                         POST   authenticated
/api/auth/refresh                        POST   refresh-cookie only
/api/auth/me                             GET    authenticated
/api/auth/csrf                           GET    refresh-cookie only, allowlisted Origin
/api/auth/forgot-password                POST   public
/api/auth/reset-password                 POST   public (token-gated)
/api/auth/accept-invitation              POST   public (token-gated)

/api/invitations/{token}                 GET    public (token-gated) — not implemented in Step 7, planned for Step 8

/api/admin/{organization_slug}/invitations        POST        ADMIN
/api/admin/{organization_slug}/invitations        GET         ADMIN — not implemented in Step 7
/api/admin/{organization_slug}/invitations/{id}   DELETE      ADMIN — not implemented in Step 7
/api/admin/{organization_slug}/staff              GET         ADMIN, KOORDINATION (read per matrix) — not implemented in Step 7
/api/admin/{organization_slug}/staff/{id}         PATCH       ADMIN — not implemented in Step 7

/api/platform/*                          reserved, guard only — no endpoints built in F002
```

`/api/admin/{organization_slug}/...` deliberately mirrors the existing
`/api/public/organization/{organization_slug}` path shape from F001, so organization resolution code
and conventions stay uniform across public and authenticated routers.

## 18. Frontend Architecture

- `AuthProvider` (client context, alongside the existing `OrganizationProvider` in
  `frontend/components/`): exposes `{ user, memberships, isLoading }`, hydrated via
  `GET /api/auth/me` with `credentials: "include"`.
- `/login` page: reuses `OrganizationProvider`/`fetchPublicOrganization` so the login form is branded
  when reached through an organization's domain/subdomain, and falls back to the platform-neutral
  styling otherwise — no new branding mechanism, reuses F001.
- `/invite/[token]` and `/reset-password/[token]` pages: token-gated forms, no auth required to view.
- Protected routes live under `app/[org]/admin/**`, extending the existing `app/[org]/page.tsx`
  pattern. Each such route performs a server-side fetch to a backend endpoint, echoing the `gc_csrf`
  cookie value (§10.3) in the `X-CSRF-Token` header for any state-changing call; a `401` triggers a
  redirect to `/login`, a `403` renders a "not permitted" state (per FEATURES.md UI impact: "role-aware
  navigation and forbidden states") — never a silent blank page.
- Organization switcher: renders `memberships` from `/api/auth/me`; each entry links to that
  organization's own `/admin` URL. No client-side "switch active org" state is introduced — switching
  is just navigation, consistent with §3's decision to resolve organization from the request, not from
  session state.
- Role-aware nav hides links the current membership's role can't use; the linked pages remain
  independently guarded server-side, so hiding a link is UX polish only, never the enforcement.

## 19. Testing Strategy

Backend (pytest + `httpx`/`TestClient`, matching existing `backend/tests/`):

- Password hashing: round-trip, dummy-hash timing path, argon2 parameter regression guard.
- JWT: valid/expired/tampered/wrong-signature tokens rejected; claim shape.
- CSRF: matching nonce/signature accepted; wrong secret, wrong binding key (different family),
  malformed token, and missing header all rejected.
- Origin/Host: allowlisted origin accepted, unlisted/missing/malformed origin rejected, wildcard never
  matches, Host/Origin mismatch rejected.
- Login: correct credentials, wrong password, unknown email, `INVITED`/`DISABLED` status — all return
  the same generic 401.
- Refresh: rotation issues a new pair; reuse of a revoked token revokes the whole family (and its CSRF
  tokens); expired token rejected.
- Logout: revokes the presented refresh token; idempotent on repeat/garbage cookies.
- Forgot/reset password: token single-use, expiry, all-refresh-tokens-revoked-after-reset,
  no-enumeration (`202` for both existing and non-existing email, verified via the in-memory
  `EmailSender` test double), rate limits enforced per D-038.
- Invitation: create → accept happy path creates exactly one `StaffMembership`; duplicate active
  invite rejected; expired/revoked token rejected; existing-user acceptance skips password step.
- **Permission matrix**: parametrized test iterating every `(role, endpoint)` cell implied by
  `docs/PERMISSIONS.md`'s table, asserting allow/deny matches the document exactly — this test is the
  living enforcement of that table and should fail loudly if the two ever drift.
- **Organization isolation**: same user, `ADMIN` in org A / no membership in org B, asserting 403 on
  org B's admin routes and no data bleed.
- `AuditEvent` written for role grants and password resets, not for login/logout.
- Email sending failures: `EmailSendError` from the SMTP transport never propagates a raw token into
  any log record (assert log capture contains no token substring).

Frontend (Vitest + Testing Library, matching `frontend/tests/`):

- Login form validation and error rendering.
- `AuthProvider` hydration and unauthenticated redirect.
- Organization switcher renders one link per membership.
- Forbidden (`403`) state renders instead of a blank/crashed page.

## 20. Migration Strategy

Two migrations, each independently revertible:

1. `000X_auth_core_identity.py` — `user`, `staff_membership`, `audit_event`, plus the `staff_role`,
   `user_status`, and `platform_role` Postgres enum types. No data backfill needed (no existing rows).
2. `000Y_auth_tokens.py` — `refresh_token`, `password_reset_token`, `invitation`.

Both run through the existing `alembic upgrade head` step already wired into the Render backend start
command (`docs/DEPLOYMENT.md`); no change to the deployment mechanism itself.

No destructive change to any existing table. `Organization`/`Theme`/`OrganizationSettings` are
untouched. F002 Step 1 (§22) ships no migration at all — configuration and security primitives only.

## 21. Rollout Strategy

F002 ships on the current `feature/f002-authentication` branch, in the ordered steps in §22, each
independently testable and mergeable to that branch (or split into sub-PRs against it, per
`CONTRIBUTING.md`'s "keep each commit focused on one logical change"). Suggested sequencing:

1. Land backend auth core (§22 Steps 1–4) behind no frontend change yet — CI (`npm run check`
   equivalent backend checks) stays green throughout since no existing endpoint is touched.
2. Land forgotten-password and invitation flows (§22 Steps 6–7) — the email-transport (D-040) and
   CSRF/CORS (D-039) decisions are already ratified, so these steps are no longer blocked on an
   external decision.
3. Land the frontend auth shell (§22 Step 8) last, once the backend contract is stable, to avoid
   churn on the frontend from backend API shape changes.
4. Update `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/PERMISSIONS.md` (add the Platform
   Operator row) and `docs/DEPLOYMENT.md` (new env vars) as documented state settles — largely done
   already alongside this plan's ratification pass; finish any remaining detail once Step 2+'s models
   exist.
5. New Render env vars (`JWT_SECRET_KEY`, SMTP credentials) are added to the Render dashboard, never
   committed, matching the existing `docs/DEPLOYMENT.md` secret-handling rule.
6. No production organizations exist to migrate yet (only F001's seed organization), so there is no
   user data migration risk — this is a greenfield rollout for this feature.

## 22. Implementation Roadmap

1. **Backend foundation** *(current step)* — add `argon2-cffi`, `PyJWT` to `backend/pyproject.toml`;
   extend `Settings` with `jwt_secret_key`, token TTLs, cookie flags, D-038's per-action
   `AuthRateLimits`; password hashing, JWT, and CSRF primitives; `EmailSender` abstraction with a
   development-safe in-memory implementation; origin/Host validation primitives. No migration, no
   endpoints, no frontend — see the Step-1 completion notes tracked alongside this plan.
2. **Core identity models** — `User`, `StaffMembership`, `AuditEvent` SQLAlchemy models + migration A;
   `StaffRole`/`UserStatus`/`PlatformRole` enums.
3. **Login/logout/refresh** — `RefreshToken` model + migration B (can merge with step 2's migration if
   preferred); JWT issuance/verification service; `/api/auth/login`, `/logout`, `/refresh`, `/me`;
   `get_current_user` dependency; cookie plumbing (including the CSRF cookie from §10.3); tests from §19.
4. **Organization role guards** — `require_authenticated_user`, `require_organization_context`,
   `require_staff_membership`, and `require_staff_role`; reuse of `get_current_organization`;
   temporary `/api/internal/test-support/*` smoke endpoints for the guard categories; the
   permission-matrix and isolation tests from §19. **Completed in Step 4:** role checks load active
   `StaffMembership` rows scoped to the resolved organization, accept `ADMIN` for all organization
   staff/admin guards, reject inactive memberships and non-active users, and never use organization or
   role claims from JWTs for authorization. The `/api/internal/test-support/*` router is mounted only
   when `APP_ENV != production` (same gate already used for `/api/docs`), since these routes are smoke
   tests, not product API.
5. **Platform operator guard** — `require_platform_operator`; smoke test only (no platform endpoints
   built, per §1 scope boundary). **Completed in Step 5:** platform access now requires an
   authenticated active `User` with database-backed `platform_role = PLATFORM_OPERATOR`, without
   resolving organization context. `StaffMembership` roles, including organization `ADMIN`, do not
   grant platform access, and JWT role/platform claims are ignored. The temporary
   `/api/internal/test-support/platform/operator` endpoint exercises the guard only when
   `APP_ENV != production`, matching the existing internal router gate.
6. **Forgotten password** — `PasswordResetToken` model/migration; `/forgot-password`, `/reset-password`
   wired to the Step-1 EmailSender; rate limiting wired to D-038's limits; tests. **Completed
   in Step 6:** password reset requests now create only hashed, single-use, expiring tokens for
   active users, return generic responses without account enumeration, dispatch reset email through
   EmailSender via FastAPI BackgroundTasks, and reset submissions update the Argon2id password
   hash, consume the token, audit PASSWORD_RESET, and revoke existing refresh-token sessions.
   D-038 rate limiting is wired for `/forgot-password` (per account and per IP); `/reset-password`
   submission has no separate rate-limit bucket, deferred per `docs/BACKLOG.md` since the token's
   256-bit entropy already makes brute-forcing it infeasible.
7. **Invitation flow** — `Invitation` model/migration; admin invitation endpoints; public accept
   endpoint; `EmailSender` reused; rate limiting wired; tests. **Completed in Step 7:** organization
   admins can issue hashed, seven-day invitations through
   `POST /api/admin/{organization_slug}/invitations`; missing users are created as `INVITED` and
   existing users are reused. `POST /api/auth/accept-invitation` validates and atomically consumes
   the opaque token, activates invited users with an Argon2id password, creates or reactivates the
   database-scoped membership, and audits the role grant. Raw tokens appear only in the deferred
   email payload and never in database rows, API responses, logs, or audit metadata. Invitation
   acceptance uses D-038's dedicated per-token-hash and per-IP limits.
8. **Frontend auth shell** — `AuthProvider`, `/login`, `/invite/[token]`, `/reset-password/[token]`,
   protected `app/[org]/admin/**` shell, organization switcher, forbidden-state handling, CSRF header
   plumbing; Vitest coverage. **Completed in Step 8:** the frontend uses the existing cookie session
   without storing access or refresh tokens in JavaScript-accessible storage, adds clear loading/unauthenticated/
   forbidden states and navigation-only organization switching, and echoes the readable `gc_csrf`
   cookie or the in-memory token from `GET /api/auth/csrf` on logout. `GET /api/invitations/{token}` now returns only organization name, offered role,
   and whether a password is required for safe invitation rendering.
9. **Documentation and rollout** — finish any remaining detail in `docs/ARCHITECTURE.md`,
   `docs/DATA_MODEL.md`, `docs/PERMISSIONS.md`, `docs/DEPLOYMENT.md` once Steps 2–7's concrete shape
   exists; configure Render/Vercel env vars; deploy and smoke-test.

## 23. Ratified Decisions (D-037–D-040)

The four decisions that were open when this plan was first drafted are now ratified by the Product
Owner. Full problem statements, options, and impact analysis remain in `docs/F002_DECISIONS.md`; the
binding wording is in `docs/DECISIONS.md`. Summary:

- **D-037 (P-1) — Platform Operator representation.** Nullable `User.platformRole` enum (single value
  `PLATFORM_OPERATOR` in V1), never writable via any public or organization-admin API, assignable only
  through a controlled platform-admin process. Organization roles remain exclusively in
  `StaffMembership` (§5, §6).
- **D-038 (P-2) — Authentication rate-limit configuration.** Platform-wide, environment-backed
  `Settings` fields (`AuthRateLimits`, §22 Step 1), with a separate conservative limit per sensitive
  auth action (login, refresh, password-reset request, invitation acceptance), not stored in
  `OrganizationSettings` or a new table in V1.
- **D-039 (P-3) — Cross-site cookies, CORS, and CSRF.** `HttpOnly`/`Secure` cookies, `SameSite=None`
  while frontend and backend remain cross-site, a database-backed dynamic origin allowlist (never a
  wildcard with credentials), consistent `Origin`/`Host` validation, and a mandatory signed
  double-submit CSRF token on every state-changing cookie-authenticated request. Full design in §10. A
  future same-site BFF proxy is in `docs/BACKLOG.md`.
- **D-040 (P-4) — Email transport.** Provider-agnostic `EmailSender` interface, SMTP transport
  configured via environment variables, dispatched via FastAPI `BackgroundTasks` (no broker/worker in
  V1). Failed sends are logged with metadata only (never the body/token) and are operator-visible;
  reset/invitation tokens remain safely retryable regardless of delivery outcome.
