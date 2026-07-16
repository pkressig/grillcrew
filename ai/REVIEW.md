# AI Review Checklist

Use the relevant sections for feature implementation, architecture review, security review, release review, or UX review. Keep findings specific and tied to files, lines, behavior, or documentation.

## Scope Compliance

- Matches the approved feature, step, and acceptance criteria.
- Does not add deferred product behavior.
- Does not change decisions without Product Owner approval.
- Does not mix unrelated refactors into the change.

## Architecture

- Follows `docs/ARCHITECTURE.md`.
- Uses existing project patterns and boundaries.
- Keeps platform logic organization-agnostic.
- Avoids hidden coupling to the first tenant.

## Tenant Isolation

- Every organization-scoped record is filtered by organization.
- Backend authorization combines authenticated user, resolved organization, and membership or role.
- Cross-organization access is denied and tested where relevant.
- Exports, background jobs, and admin views preserve tenant boundaries.

## Authentication and Security

- Server-side guards enforce permissions.
- Tokens, passwords, and secrets are never logged or committed.
- Cookie, CORS, CSRF, rate-limit, and origin behavior matches decisions.
- Errors do not leak sensitive state.

## Migrations

- Migrations are reversible where practical.
- Existing data is preserved.
- Enum, index, constraint, and naming choices match project conventions.
- Migration tests or manual upgrade checks cover the change.

## Privacy and PII

- Personal data is minimized.
- Phone numbers, email addresses, child data, and internal notes are not public.
- Logs and generated artifacts do not include secrets or unnecessary PII.

## API Behavior

- Request and response schemas are explicit.
- Inputs are validated server-side.
- Status codes are consistent and do not leak sensitive details.
- Existing public contracts are not broken unintentionally.

## Frontend UX and Accessibility

- Mobile-first layout is preserved.
- Interactive targets are large enough.
- Forms have labels, error states, and keyboard support.
- Color contrast and focus states are accessible.
- Public UI stays clear and does not expose staff-only data.

## Tests

- Business rules are covered by automated tests.
- Tenant isolation and permission behavior have negative tests.
- Security-sensitive paths include failure cases.
- Frontend behavior has appropriate component or integration coverage.

## Documentation Consistency

- `docs/DECISIONS.md` is updated only for approved decisions.
- Feature plans and architecture docs match implementation.
- Deferred work is recorded in `docs/BACKLOG.md`.
- Documentation avoids contradictory duplicate rules.

## Deployment

- New environment variables are documented.
- No provider-specific secret values are committed.
- Render and Vercel behavior remains customer-neutral.
- Health checks and startup behavior remain valid.

## Generated Files and Secrets

- Generated files that should not be reviewed as source are ignored.
- `ai/generated/CONTEXT_PACK.md` contains no `.env` contents, tokens, passwords, source dumps, Excel content, dependencies, or virtual environments.
- Reports in `ai/reports/` are intentional historical artifacts.
