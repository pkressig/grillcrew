---
name: grillcrew-migration-safety
description: Design, implement, or review GrillCrew schema and data migrations for tenant safety, backward compatibility, realistic legacy data, deployment ordering, rollback, and recovery. Use whenever models, constraints, indexes, enum values, identifiers, organization-scoped data, or stored personal data change. Do not approve destructive or irreversible migration behavior without explicit authority and recovery evidence.
---

# GrillCrew Migration Safety

1. Read the task contract, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/BUSINESS_RULES.md`, `docs/PERMISSIONS.md`, relevant decisions, models, migrations, deployment configuration, and migration tests.
2. Inventory affected tables, relations, constraints, indexes, enum/state values, personal data, organization keys, and existing production-compatible values.
3. Prove organization ownership for every transformed row. Treat missing or ambiguous tenant ownership as blocking.
4. Prefer expand-migrate-contract: introduce compatible structures, deploy readers/writers safely, backfill idempotently in bounded batches, verify, then remove obsolete structures only in a later authorized step.
5. Define behavior for nulls, duplicates, malformed legacy values, partially migrated data, retries, concurrent writes, and interrupted execution.
6. Check locking, transaction duration, index build behavior, table size assumptions, service-version compatibility, and deployment order.
7. Provide forward validation, rollback or roll-forward recovery, backup requirements, observability, and a stop condition. Never describe rollback as safe when data loss makes it impossible.
8. Require tests for empty and populated databases, representative legacy data, tenant separation, retry/idempotency, constraint failures, and mixed-version compatibility where relevant.
9. Update data-model, architecture, deployment, feature-plan, status, and decision documentation when their truth changes.

Report a verdict, migration phases, risks, required evidence, rollback/roll-forward plan, and any Product Owner decision still needed.
