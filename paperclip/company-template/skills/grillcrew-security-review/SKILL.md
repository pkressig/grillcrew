---
name: grillcrew-security-review
description: Threat-model and independently review GrillCrew changes involving authentication, authorization, tenant isolation, public endpoints, personal data, uploads, integrations, sessions, CSRF/CORS/origin handling, or abuse controls. Use during planning, implementation, Claude review, and pre-release security gates. Do not accept missing organization scope or rely on UI hiding as authorization.
---

# GrillCrew Security Review

1. Read the issue contract, complete diff, `docs/ARCHITECTURE.md`, `docs/PERMISSIONS.md`, `docs/BUSINESS_RULES.md`, `docs/DATA_MODEL.md`, relevant decisions, routes, schemas, services, migrations, and tests.
2. Map actors, assets, trust boundaries, entry points, data flows, and attacker goals. Include anonymous users, authenticated members, admins, compromised accounts, and cross-organization attackers.
3. Trace authentication, session lifecycle, CSRF, CORS/origin checks, authorization, resource ownership, organization scoping, and response filtering end to end. Enforce checks server-side at every boundary.
4. Check identifier enumeration, mass assignment, insecure direct object references, information leakage, public personal data, logs, errors, caches, exports, uploads, webhook replay, and third-party inputs.
5. Check validation, rate limits, brute force, denial-of-service amplification, concurrency, idempotency, secrets handling, dependency boundaries, and safe failure behavior.
6. Verify tests include denied access, cross-organization access, malformed input, stale/replayed requests, anonymous access, and least-privilege success cases.
7. Report findings first by severity with attack path, evidence, impact, and smallest required correction. Separate defense-in-depth recommendations from release blockers.
8. Request changes for any reproducible authorization bypass, tenant leak, exposed sensitive data, unsafe secret handling, or missing critical negative test.

Never weaken controls merely to make tests pass, and never treat frontend visibility as a security boundary.
