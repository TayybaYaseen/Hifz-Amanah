# ADR-015 — Sync protocol v1: idempotent push, change-log pull, conflict store, per-organization lock

- **Status:** Accepted 2026-11-08. The user accepted the F12 plan's recommendations and technical choices
  ([`docs/handover/F12-plan.md`](../handover/F12-plan.md) §10 "Answers"). Refines ADR-003 and ADR-004.
- **Feature:** F12 (US-051…US-054). **Requirements:** NFR-OFF-001…011, FR-SYNC-006…009, FR-HW-017 (contract only),
  DEC-B18, DEC-B29, DEC-B42.
- **Code:** `packages/contracts/src/sync.ts`, `packages/domain/sync/*`, `apps/api/src/modules/sync/*`,
  `apps/api/migrations/0004_sync.sql`, `0005_sync_hardening.sql`, `apps/mobile/src/sync/*`.

## Context

ARCHITECTURE.md §8 fixes the shape (client UUIDv7 IDs, an outbox, an `op_id`-keyed `sync_ops`, a `change_log`
cursor, no last-write-wins for meaningful fields). F12 is built before any offline entity exists (F03, F04, F05,
F08 come later), so the protocol must be generic, and several details were open: replay of a changed payload,
retryable vs stored results, rows with an open conflict, conflicting edits to different fields, and how a pull
cursor stays correct when `BIGSERIAL` values commit out of order.

## Decision

1. **Protocol version.** `PROTOCOL_VERSION = 1`. Push carries it in the body, pull as the `protocolVersion` query
   parameter (absent means 1). Below `SYNC_MIN_PROTOCOL_VERSION` the whole request is `426 UPGRADE_REQUIRED` and
   nothing is applied; the app keeps every queued operation (F12-AC15). Adding an entity does not bump the version.
2. **Push** (`POST /sync/push`, ≤ 100 ops, outbox order). Each op runs in **its own tenant transaction**, in order, so
   one refusal never rolls back the others. Results: `APPLIED`, `CONFLICT`, `REJECTED` (terminal: `VALIDATION`,
   `NOT_FOUND`, `ENTITY_NOT_SUPPORTED`, `ID_TAKEN`, `OP_ID_REUSED`) and `RETRY` (`DEPENDENCY_PENDING`,
   `CONFLICT_OPEN`). There is no `DELETE` op type (no hard deletes).
3. **Idempotency (NFR-OFF-004, F12-AC5).** `sync_ops` stores every terminal result with `op_hash` = SHA-256 of the
   canonical JSON of the operation (sorted keys, `seq` excluded). A replay by the same user with the same hash
   returns the stored result and writes nothing. The same `op_id` with another payload, another user, or another
   organization is `REJECTED OP_ID_REUSED` and reveals nothing. `RETRY` results are **never stored**.
   - Because `sync_ops` rows of other organizations are invisible under RLS (ADR-016), the service first probes the
     `op_id` claim inside a savepoint that is rolled back, so another madrasa's `op_id` is `OP_ID_REUSED` before any
     dependency or conflict check. The real claim at the end (`ON CONFLICT DO NOTHING`) re-checks it for concurrent
     pushes and rolls the whole op back if it lost.
4. **Dependencies (F12-AC4).** An op waits (`RETRY DEPENDENCY_PENDING`) until each `dependsOn` op of the same user is
   `APPLIED`, or is a `CONFLICT` whose conflict has since been `RESOLVED`. On the device, an `UPDATE` of a row whose
   `CREATE` has not synced yet is queued with `dependsOn = [create op]` and `baseVersion = 1`.
5. **Client IDs (F12-AC3).** A `CREATE` keeps the client UUIDv7 as the primary key. An ID already used in any
   organization is `REJECTED ID_TAKEN` without detail.
6. **Conflict detection** (pure, `@hifz/domain/sync`):
   - Each entity declares its fields as `MEANINGFUL` or `SAFE_MERGE`; **an unlisted field is meaningful**
     (decision Q4). The only safe-merge field named in the docs is display order (`position`), where the server value
     wins (F12-AC13).
   - The server computes "changed since `baseVersion`" from `change_log.changed_fields`, **excluding changes made by
     the same user on the same device** (a device's own successive offline edits never conflict with each other).
     Changes with no op (conflict resolutions) always count. The base is never rebased.
   - A meaningful field, or a **coupled group** (decision Q5, e.g. attempt status + completed quantity + quality +
     mistakes), changed on both sides to different values is a conflict. Coupled groups must be sent whole
     (`VALIDATION … GROUP_INCOMPLETE`), and resolution picks whole groups. Disjoint changes apply on top of the
     server row. Equal values are not a conflict.
7. **Conflict store (FR-SYNC-008, NFR-OFF-006).** `sync_conflicts` keeps both versions, the conflicting fields, the
   author, and the record's scope keys (`student_id`, `class_id`). **One open conflict per row** (decision Q7, a
   partial unique index): any later edit of that row, by anyone, is `RETRY CONFLICT_OPEN` (not stored). The device
   holds it as action required without backoff and sends it again once the conflict is resolved.
8. **Resolution is an online request** (decision Q6): `POST /sync/conflicts/:id/resolve` with `KEEP_DEVICE`,
   `KEEP_SERVER`, or `MERGE` + per-field picks. It writes a new row version and a `change_log` entry (even for
   `KEEP_SERVER`, so every device re-reads the settled row), closes the conflict, and writes one
   `SYNC_CONFLICT_RESOLVED` audit entry in the same transaction: field names, picks, and old/new values only for the
   fields the handler declares non-sensitive, never note bodies. Who may resolve: the author while the record is
   still in their scope, or any Owner/Admin (DEC-B18); anyone else gets `404` (F12-AC17). `409 CONFLICT_STALE` if the
   row changed since, `409 CONFLICT_CLOSED` if already resolved.
9. **Pull** (`GET /sync/pull`, ≤ 500 changes). The cursor is opaque (`v1.` + base64url JSON of `change_log.seq`
   positions, never row data). Without a cursor the server sends a paged **bootstrap** of the latest change of each
   row up to a watermark. Rows are filtered by the caller's **current** scope using the scope keys written to
   `change_log` at change time (F12-AC7); a row now out of scope comes back as `REMOVE_FROM_DEVICE`. A
   `scope_changes` row for the caller after the cursor answers `scopeReset: true` (NFR-OFF-010, decision Q8). Pull
   runs in one `REPEATABLE READ` snapshot. Fields go through `projectFor('STAFF', …)`.
10. **Commit-order guarantee: per-organization advisory lock.** Every write transaction on a tenant's sync tables
    takes `pg_advisory_xact_lock(0x53594e43, hashtext(organization_id))` **first**, before any row lock, and holds it
    to commit. So within an organization at most one transaction holds an uncommitted `change_log` row, and it has
    the highest `seq`. Every snapshot therefore sees a gap-free prefix of the organization's log, and the cursor may
    advance to the head even past out-of-scope rows. The lock order is always "organization, then rows", so there is
    no deadlock. `scope_changes.seq` draws from the same sequence so the two compare.
11. **Entity handlers.** The sync module owns only `sync_ops`, `change_log`, `sync_conflicts`, `scope_changes`. Each
    owning module (F04, F05, F07, F08) registers a `SyncHandler` (strict Zod schemas, field spec, scope keys,
    load/insert/update, audit hook). Until then the entity is `REJECTED ENTITY_NOT_SUPPORTED`. In F12 the only
    handler is the test-only `sync_probe`, registered by integration tests (decision Q1).
12. **Client side.** Outbox order, backoff 2 s × 2 up to 5 min with full jitter, no retry limit; `SYNCED` only from
    an `APPLIED` result (F12-AC9). Tapping **Retry** on a `FAILED` item queues the same change as a **new `op_id`**
    (the old one would only replay its stored refusal), re-points dependents, and records the old op in `discards`.

## Consequences

- Replays are safe and cheap; a changed payload can never ride on an old `op_id`.
- Sync writes of one madrasa are serialized. Each is one short per-op transaction; acceptable for the NFR-PERF-006
  sizing, to be watched with the sync metrics (ARCHITECTURE §16).
- F03 must call `recordScopeChange` for every Teacher whose scope a roster change affects (see
  `apps/api/src/modules/sync/change-log.ts`), or devices keep out-of-scope rows until the next sign-in.
- Natural-key create-create collisions (two devices create attendance for the same student and date) and attempt
  numbering are decided by F04/F05 on top of this store (decisions Q10, Q11).
- Conflict rows may hold note bodies once F05/F07 register notes: the conflict routes are staff-only and the bodies
  are never logged or audited.
