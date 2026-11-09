# Architecture decision records

ADR-001…ADR-014 are recorded as a summary table in [ARCHITECTURE.md §19](../ARCHITECTURE.md#19-architecture-decision-summary)
(approved with DEC-B51 on 2026-10-30, and SRS DEC-B60…B64 for ADR-014). Decisions made during implementation get a
file here, numbered after the last one in §19, and a row in that table.

| ID | Title | Status |
|---|---|---|
| [ADR-015](ADR-015-sync-protocol-idempotency-conflicts.md) | Sync protocol v1: idempotent push, change-log pull, conflict store, per-organization lock | Accepted 2026-11-08 (F12) |
| [ADR-016](ADR-016-postgres-row-level-security-pattern.md) | Postgres row-level security: the `hifz_tenant` role and `app.current_org_id` | Accepted 2026-11-08 (F12, decision Q9) |
| [ADR-017](ADR-017-quran-reference-data-model.md) | Quran reference data: model, 16-line layout, offline distribution, import and validation | Accepted 2026-11-09 (DEC-B72); §8 delivery waits on OD-QR-7 |
