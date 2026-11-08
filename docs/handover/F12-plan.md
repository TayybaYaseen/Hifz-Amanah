# F12 plan — Offline and synchronization

**Branch:** `feature/f12-offline-sync`, from `origin/main` (F01 and F02 merged; specs Approved in `b11d337`).
**Specs:** `docs/specs/04-*` · **Stories:** US-051, US-052, US-053, US-054 · **Requirements:** NFR-OFF-001…011,
FR-SYNC-006…009, FR-HW-017 (contract only), DEC-B18, DEC-B29, DEC-B42, DEC-B54 · **ADRs:** ADR-003, ADR-004, ADR-006
· **Status:** slices 1–8 done on 2026-11-08, not merged; F12 gate **PENDING** (see §12). Decisions answered by
the user on 2026-11-08 (§10 "Answers"); new ADRs: ADR-015 (sync protocol), ADR-016 (row-level security).

## 1. The central problem: F12 comes before the entities it syncs

F12 is build order 4. The entities it is meant to carry (attendance F04, daily records/portions/attempts F05,
mistakes F07, homework F08) and the roster that defines Teacher scope (classes, students, assignments, F03) do not
exist yet. Today the only data is accounts and organization settings, which are online-only (ARCHITECTURE §8.3).
So F12 can build the **protocol, storage, engine, conflict store, and UI**, but not real offline entities.

The plan therefore builds a **generic engine with an entity-handler registry**:
- `packages/domain/sync` holds the pure rules (ordering, backoff, conflict detection, safe merge, resolution).
- The API `sync` module owns `sync_ops`, `change_log`, `sync_conflicts` and the endpoints. It never touches another
  module's tables. Each owning module (calendar, hifz, homework) registers a `SyncHandler` for its entities when
  that feature is built (ARCHITECTURE §5: modules talk through service interfaces).
- The mobile `local-db` + `sync` folders hold the SQLite store, the outbox, and the engine. Entity repositories
  register per-entity local tables when their feature lands.

In F12, **no production entity handler is registered**. Unit and integration tests drive the engine through a
**test-only entity** (`sync_probe`, see decision Q1). This is the same pattern as F02: build and unit-test the
mechanism now, keep the entity-dependent E2E tests pending.

## 2. Already in place from F01/F02

- `memberships.status` (`ACTIVE`/`REVOKED`), `users.status` (`ACTIVE`/`DEACTIVATED`), `sessions.device_id`,
  `sessions.revoked_reason`. Deactivation ends sessions; every request re-checks session, account, and membership.
- The access policy (`apps/api/src/modules/access/policy.ts`): matrix row "Resolve sync conflict: Owner ✔, Admin ✔,
  Teacher own conflicts" already exists as data. `scopeOf`/`studentsInScope` take assigned classes as input.
- Audit writes in the same transaction (`apps/api/src/modules/audit/audit.ts`), append-only trigger on `audit_logs`.
- Error shape `{ error: { code, message, fields? } }`, `ERROR_CODES` in `packages/contracts/src/identity.ts`.
- Mobile: `expo-secure-store`, `SessionContext` with refresh, `OfflineScreen`, `SessionExpiredScreen`, tokens, i18n
  in three locales. **Missing:** `expo-sqlite`, Drizzle for SQLite, a connectivity listener, a local-auth module.
- `packages/domain` has test stubs only. It has **no `package.json`, no `tsconfig`, and is not an npm workspace or
  part of `npm run typecheck`.** Slice 1 scaffolds it as `@hifz/domain` (pure, no I/O).

## 3. Build slices, in order

Each slice ends with lint, typecheck, and `npm test` green. Slices 3 and 4 can run in parallel once slice 2 is done
(no shared files).

| # | Slice | Owner | Files | Done when |
|---|---|---|---|---|
| 1 | **Domain** `@hifz/domain/sync` | backend-agent | `packages/domain/package.json`, `tsconfig.json`, `packages/domain/sync/*.ts`; root `package.json` workspaces + typecheck | `conflict.test.ts` todos are real tests; fast-check properties for ordering and merge |
| 2 | **Contracts** `packages/contracts/src/sync.ts` | backend-agent | `sync.ts`, `index.ts`, new error codes | Shapes below; strict schemas; round-trip tests |
| 3 | **API sync module + migration 0004** | backend-agent, then security-agent review | `apps/api/migrations/0004_sync.sql`, `apps/api/src/modules/sync/*`, test control, `apps/api/test/sync/*.test.ts`, identity tweak for `ACCESS_REVOKED` | Integration tests for idempotency, dependency, conflict, resolution, pull cursor, revocation, protocol version |
| 4 | **Mobile local DB, outbox, engine** | frontend-agent | `apps/mobile/src/local-db/*`, `apps/mobile/src/sync/*` (no screens) | `outbox.test.ts` todos are real tests; local-migration test with a populated outbox (NFR-OFF-009) |
| 5 | **Mobile UI** | ui-ux-agent (spec), then frontend-agent | sync banner, Sync Queue, Conflict Review, sign-out warning, app lock, locked-workspace screen; strings in `en`, `ur`, `ur-Latn` | Every state in design.md §8 and §4.13; Maestro flows updated as far as entities allow |
| 6 | **Tests and gates** | testing-agent | `e2e/api/f12-sync.spec.ts`, `e2e/mobile/f12-sync/*` | Buildable `test.fixme`s turned real; gate run and reported honestly |
| 7 | **Review** | code-review-agent + security-agent | — | No open blocker/high findings |
| 8 | **Docs** | documentation-agent | `apps/api/README.md`, `apps/mobile/README.md`, ADR(s), this file's Status | `docs:check`, `e2e:trace` OK |

## 4. Domain rules (`packages/domain/sync`)

Pure functions only. Proposed module layout: `ids.ts`, `ordering.ts`, `backoff.ts`, `fields.ts`, `conflict.ts`,
`resolve.ts`.

- **Ordering.** `nextSendable(outbox)` returns pending operations in `seq` order. An operation is held while any
  `depends_on` operation is not `SYNCED`. If a dependency is `FAILED`, dependents are held and labelled "waiting for
  record". Device time is never used for ordering.
- **Backoff** (proposed, technical): full-jitter exponential, base 2 s, factor 2, cap 5 min. No retry limit: a
  temporarily failing operation stays `PENDING` with `attempts` and `next_attempt_at`; it is never discarded
  automatically (NFR-OFF-007).
- **Field classes.** Each registered entity declares its fields as `MEANINGFUL` or `SAFE_MERGE`, with a merge rule
  for each safe field. Per FR-SYNC-008 the meaningful set is attempt status, quantities, quality, mistakes,
  attendance status, homework status/portions. **Default for any field not listed is MEANINGFUL** (see Q4). The only
  safe-merge field named in the docs is display order (`lesson_portions.position`, F12-AC13).
- **Conflict detection** `detect(base, local, server, fieldClasses)`:
  - `localChanged = fields the operation changes`, `serverChanged = fields changed on the server since base_version`.
  - A meaningful field (or a coupled field group, see Q5) in both sets with different values → **conflict**.
  - Only safe fields overlap → the documented merge applies (proposed for `position`: the server's value wins and the
    device re-reads it; no data is lost because order is presentation only).
  - No overlap → the change applies on top of the server row (non-overlapping change, see Q5).
  - Equal values on both sides are not a conflict.
- **Resolution** `resolve(conflict, choice)` where `choice` is `KEEP_DEVICE`, `KEEP_SERVER`, or `MERGE` with a
  per-field pick. Returns the new field values; the API applies them as a new change.

## 5. API contract (`packages/contracts/src/sync.ts`)

`PROTOCOL_VERSION = 1`. The server's minimum supported version is configuration (`SYNC_MIN_PROTOCOL_VERSION`,
default 1); test control can raise it. All routes need a Teacher, Admin, or Owner session; Student and Parent get
`403 FORBIDDEN` (online read-only, out of scope). Organization comes from the membership only.

### `POST /sync/push`

```ts
request  = { protocolVersion: int, deviceId: uuid, ops: SyncOp[] /* 1..100, outbox order */ }
SyncOp   = { opId: uuidv7, seq: int, entity: SyncEntity, entityId: uuidv7,
             opType: 'CREATE' | 'UPDATE' | 'COMMAND',     // no DELETE: no hard deletes (ARCHITECTURE §6.1)
             command?: string,                             // e.g. CONFIRM_HOMEWORK (F08), APPEND_ATTEMPT (F05)
             baseVersion: int | null,                      // null for CREATE
             fields: Record<string, unknown>,              // validated by the entity handler's Zod schema
             dependsOn: uuidv7[],                          // op IDs
             clientSavedAt: datetime }                     // informational only, never used for ordering
response = { results: OpResult[] /* same order */, serverTime }
OpResult = { opId, status: 'APPLIED',         rowVersion, entityId }
         | { opId, status: 'CONFLICT',        conflictId }            // record is action required
         | { opId, status: 'REJECTED',        code, fields? }         // terminal: VALIDATION, NOT_FOUND, ENTITY_NOT_SUPPORTED, ID_TAKEN, OP_ID_REUSED
         | { opId, status: 'RETRY',           code }                  // not stored: DEPENDENCY_PENDING, CONFLICT_OPEN?
```

- Whole-request refusals (nothing applied): `426 UPGRADE_REQUIRED` (protocol below minimum), `403 ACCESS_REVOKED`
  (membership revoked or account deactivated), `401 SESSION_EXPIRED`, `400 VALIDATION` (envelope), `429`.
- **Idempotency:** `sync_ops` stores the terminal result (`APPLIED`, `CONFLICT`, `REJECTED`) with a hash of the
  operation. A replay with the same `opId`, same user and organization, and same hash returns the stored result and
  writes nothing (F12-AC5). Same `opId` with a different hash, or from another user or organization, is
  `REJECTED OP_ID_REUSED` and reveals nothing about the original. `RETRY` results are not stored.
- **Dependencies:** an op whose `dependsOn` op is not `APPLIED` in `sync_ops` gets `RETRY DEPENDENCY_PENDING` and is
  not applied (F12-AC4). If the dependency is `REJECTED`, the result is the same; the client holds it as "waiting
  for record".
- **Client IDs:** `CREATE` keeps `entityId` as the primary key (F12-AC3). An ID already used (in any organization)
  is `REJECTED ID_TAKEN`, with no detail.
- **Per op, in one transaction:** authorize (handler's scope check, out-of-scope = `NOT_FOUND`), validate (handler's
  schema plus `packages/domain` rules), compare `baseVersion`, then either apply (bump `row_version`, append
  `change_log`, audit per ARCHITECTURE §15, insert `sync_ops`) or insert `sync_conflicts` + `sync_ops`. Ops in one
  push are applied one transaction each, in order, so one rejected op does not roll back the others.
- **Client totals, roles, visibility, org IDs** are never accepted in `fields`; handler schemas are strict.

### `GET /sync/pull?cursor=<string|null>&limit=<1..500>`

```ts
response = { changes: Change[], cursor: string, hasMore: boolean, scopeReset: boolean, serverTime }
Change   = { entity, entityId, rowVersion, op: 'UPSERT' | 'REMOVE_FROM_DEVICE', fields? }
```

- `cursor` is an opaque encoding of the last `change_log.seq` delivered. With `cursor=null` the server returns a
  snapshot of the current permitted working set (bootstrap), paged.
- Only changes the caller may see are returned: each `change_log` row carries the scope key (`student_id`,
  `class_id`) written at change time, and the pull filters by the caller's current scope (F12-AC7).
  `fields` go through `projectFor('STAFF', …)`.
- `scopeReset: true` when the caller's scope changed since the cursor (class assigned or unassigned). The device then
  drops synced rows outside the new scope (`REMOVE_FROM_DEVICE`) and re-bootstraps (NFR-OFF-010). See Q8.
- **Commit-order gap:** `BIGSERIAL` values can commit out of order, so a pull could skip a row that commits later
  with a lower `seq`. The apply path takes a per-organization advisory lock around the `change_log` append (or the
  pull stops at a safe watermark). Backend to confirm the approach in slice 3.
- Same `426`, `403 ACCESS_REVOKED`, `401` refusals as push.

### Conflicts

| Route | Who | Result |
|---|---|---|
| `GET /sync/conflicts?status=OPEN&page=` | Teacher (own conflicts, in scope), Owner/Admin (all in the madrasa) | `200` list: entity, safe label, created time, caused-by user |
| `GET /sync/conflicts/:id` | same | `200` `{ entity, entityId, baseVersion, device: fields, server: fields, fieldDiff[] }`; `404` otherwise |
| `POST /sync/conflicts/:id/resolve` | the user whose operation caused it (still in scope), or any Owner/Admin | `{ choice: KEEP_DEVICE \| KEEP_SERVER \| MERGE, picks?: Record<field, 'DEVICE' \| 'SERVER'> }` → `200` `{ rowVersion }`; one `SYNC_CONFLICT_RESOLVED` audit (field names and non-sensitive old/new values only; no note bodies); conflict `RESOLVED`; `change_log` appended. `404` for another Teacher, even one assigned to the student (F12-AC17); `409 CONFLICT_STALE` if the server row changed since the conflict was opened; `409 CONFLICT_CLOSED` if already resolved |

Resolution is an online request (see Q6).

### New error codes

`ACCESS_REVOKED` (403), `UPGRADE_REQUIRED` (426), `DEPENDENCY_PENDING`, `OP_ID_REUSED`, `ID_TAKEN`,
`ENTITY_NOT_SUPPORTED`, `CONFLICT_STALE`, `CONFLICT_CLOSED`. All need localized messages in the app.

### Identity change for `ACCESS_REVOKED`

Today a deactivated account's next request fails as `401 SESSION_EXPIRED`, which the app cannot tell apart from an
ordinary expiry. Proposed: when the session was ended because the **account was deactivated or the membership
revoked** (`sessions.revoked_reason = 'DEACTIVATED' | 'MEMBERSHIP_REVOKED'`), authenticated requests and
`/auth/refresh` answer `403 ACCESS_REVOKED`. Password resets, sign-out, and expiry keep `SESSION_EXPIRED`. Security
review required (it tells the holder of a valid token that their access was removed, which is what the spec wants).

### Test control (non-production only)

- `POST /__test/sync/min-protocol { version }` — raise the minimum (F12-AC15).
- `POST /__test/sync/fail-next { count, status }` — the next N push/pull requests fail with a temporary 503
  (F12-AC6, `queue-and-sign-out.yaml`).
- `GET /__test/sync/ops/:opId`, `GET /__test/sync/conflicts` — inspection for E2E assertions.
- Test-only `sync_probe` entity (Q1), registered only when `NODE_ENV=test`.

## 6. Tables (migration `0004_sync.sql`)

All tenant-owned, `organization_id NOT NULL`, no `ON DELETE CASCADE`, append-only where noted.

```text
sync_ops(op_id uuid PRIMARY KEY, organization_id, user_id, device_id, entity, entity_id,
         op_hash bytea, status[APPLIED|CONFLICT|REJECTED], result jsonb, received_at)
change_log(seq bigserial PRIMARY KEY, organization_id, entity, entity_id, row_version, op[UPSERT|REMOVE],
           changed_fields text[], student_id NULL, class_id NULL, actor_user_id, op_id NULL, at)
           INDEX (organization_id, seq)                               -- append-only (trigger)
sync_conflicts(id uuid, organization_id, entity, entity_id, base_version, server_version,
               device_fields jsonb, server_fields jsonb, conflict_fields text[],
               caused_by_user_id, op_id, status[OPEN|RESOLVED], resolved_by NULL, resolved_at NULL,
               resolution jsonb NULL, created_at)
               UNIQUE (organization_id, entity, entity_id) WHERE status = 'OPEN'   -- see Q7
scope_changes(organization_id, user_id, seq, at)                     -- drives scopeReset; written by roster (F03)
sync_probe(id uuid, organization_id, label, status, position, row_version)   -- test migration only (Q1)
```

`change_log.changed_fields` plus `row_version` let the server compute `serverChanged` since `baseVersion` without
storing full snapshots. `device_fields`/`server_fields` can contain note bodies once F05/F07 register notes: the
conflict routes are staff-only, never projected to Student/Parent, and never logged or audited with bodies.

Row-level security: these are the first tenant-scoped tables since F02 deferred RLS (see Q9).

## 7. Entities and operation types now vs later

| Entity | Owner feature | Op types | In F12 |
|---|---|---|---|
| `sync_probe` | F12 (tests only) | `CREATE`, `UPDATE` (fields `label` meaningful, `status` meaningful, `position` safe) | Registered in test builds only |
| `attendance_record` | F04 | `CREATE`, `UPDATE` | Contract reserved; handler in F04 |
| `daily_record`, `lesson_portion` | F05 | `CREATE`, `UPDATE` | Reserved; F05 |
| `portion_attempt` | F05 | `CREATE` (append-only; server assigns `attempt_no` in apply order, see Q10), `UPDATE` = audited correction (FR-SYNC-009) | Reserved; F05 |
| `attempt_mistake`, `note` | F07/F05 | `CREATE`, `UPDATE` | Reserved |
| `homework_assignment`, `homework_portion` | F08 | `CREATE`/`UPDATE` (drafts), `COMMAND CONFIRM_HOMEWORK` carrying the source `row_version`s (FR-HW-017, DEC-B29) | Reserved; F08 |

Until a handler is registered, an op for that entity is `REJECTED ENTITY_NOT_SUPPORTED`. Adding an entity is
additive and does not bump the protocol version. Natural-key collisions (two devices create a daily record or
attendance for the same student and date) are a create-create conflict that F04/F05 must handle; the F12 conflict
store supports it (see Q11).

## 8. Mobile (`apps/mobile`)

- **Dependencies to add:** `expo-sqlite`, `drizzle-orm` (SQLite driver; approved stack), `@react-native-community/netinfo`,
  `expo-local-authentication` (app lock). Unit tests use Node 24's built-in `node:sqlite` behind the same driver
  interface, so outbox logic is tested without a device.
- **Database:** one SQLite file per account and organization. Tables: entity tables (registered later), `outbox`
  (ARCHITECTURE §8.1 columns plus `next_attempt_at`, `failure_code`, `failure_fields`), `sync_meta`
  (`last_pull_cursor`, `last_success_at`, `protocol_version`, `schema_version`, `workspace_state`
  `ACTIVE|LOCKED_REVOKED`, `revoked_at`), `conflicts`, `discards` (local record of discarded changes).
- **Save path:** `saveWithOp(entityWrite, op)` runs both in one `withTransactionAsync`; the UI says "Saved on this
  device — waiting to sync" only after it resolves (F12-AC1). IDs from `uuid` v7, created once and never rewritten
  (F12-AC3).
- **Engine:** triggered by connectivity regained, app foreground, a save, and a timer. Push in outbox order (batches
  of up to 100) → apply results → pull until `hasMore = false`. States `PENDING → SYNCING → SYNCED | FAILED |
  ACTION_REQUIRED`; `SYNCED` is set only from an `APPLIED` result (F12-AC9). `401` refreshes the session and resumes;
  `426` stops and keeps everything (F12-AC15); `403 ACCESS_REVOKED` locks the workspace (F12-AC14, AC20).
- **Local migrations:** versioned, each in a transaction, never touching `outbox` rows except additive column
  changes; a test runs every migration over a populated outbox (F12-AC16, NFR-OFF-009).
- **Retention:** cleanup on start and once a day removes synced rows past retention (F12-AC19; the daily-record
  predicate lands with F05). Revocation purges synced rows at once and unsynced rows on sign-out or 30 days after
  the device learned of it (F12-AC20).
- **App lock:** see Q12. Owner/Admin must set it at first sign-in on the device; Teacher may skip; locks after 5 min
  in the background (F12-AC18).
- **UI:** sync banner (design.md §5.9) on Home and work screens; Sync Queue (item label, last local change, state
  with icon + text, reason and Retry for failed, Review for action required, Discard with confirmation); Conflict
  Review (side-by-side plain-language field comparison, Keep device / Keep server / Merge per field); sign-out
  warning with the count and "Sync now", "Cancel", "Sign out anyway" (F12-AC10); workspace-locked screen. All
  strings in `en`, `ur` (RTL), `ur-Latn`.

## 9. Acceptance criteria → tests, and what F12 can finish

"Unit" = Vitest in `packages/domain/sync` or `apps/mobile/src/sync`. "Int" = `apps/api/test/sync`. "API E2E" =
`e2e/api/f12-sync.spec.ts`. "Mobile" = Maestro, all **BLOCKED** until DEC-B55 and a device/emulator exist.

| AC | Unit | Int | API E2E | Mobile flow | Can pass in F12? | Waits for |
|---|---|---|---|---|---|---|
| AC1 one local transaction before "Saved on device" | outbox `saveWithOp` atomicity (node:sqlite) | — | — | offline-save-and-sync | Unit yes; journey no | F05 Daily Entry; DEC-B55 |
| AC2 survives force-close | persisted outbox reopen | — | — | offline-save-and-sync | Unit yes | F05; DEC-B55 |
| AC3 client UUID kept | id stability | probe create keeps ID | AC3 test | offline-save-and-sync | Int yes; API E2E only with probe (Q2) | F05 for a real record |
| AC4 dependency order | `nextSendable` | `DEPENDENCY_PENDING` | AC4 test (record → portion → attempt) | offline-save-and-sync | Unit/int yes | F05 entities for the E2E as written |
| AC5 replay is idempotent | — | replay every op type twice, no duplicates | AC5 test (record, attempt, attendance, homework portion) | offline-save-and-sync | Int yes (probe) | F04, F05, F08 for the E2E as written |
| AC6 backoff, stays pending | `backoff`, engine on 503 | — | — | queue-and-sign-out | Unit yes | DEC-B55 |
| AC7 pull since cursor, in scope | — | cursor + scope filter (scope injected) | AC7 test (teacher.a2 S3 vs teacher.a1 S1) | revoked-upgrade-migration step 6 | Int partly | F03 roster for real scope |
| AC8 queue item states | state machine | — | — | queue-and-sign-out | Unit yes | DEC-B55 |
| AC9 never synced before ack | engine | — | — | offline-save-and-sync | Unit yes | DEC-B55 |
| AC10 sign-out warning | — | — | — | queue-and-sign-out | Component/Maestro only | DEC-B55; component-test setup (none in repo) |
| AC11 same base → conflict | `detect` | probe conflict | AC11 test (portion status) | conflict-review | Unit/int yes | F05 portion for the E2E as written |
| AC12 resolve as audited change | `resolve` | resolve + audit | AC12 test | conflict-review | Int yes | F05 for the E2E as written |
| AC13 safe merge (display order) | `detect` | probe `position` | AC13 test | conflict-review | Int yes; API E2E with probe | F05 `position` |
| AC14 revoked → access revoked | engine lock | `ACCESS_REVOKED` on push/pull | AC14 test | revoked-upgrade-migration | **API E2E yes** | — (mobile: DEC-B55) |
| AC15 upgrade required | engine keeps ops | `426` | AC15 test | revoked-upgrade-migration | **API E2E yes** | Mobile needs two app builds (Q13) |
| AC16 local DB upgrade keeps outbox | migration over populated outbox | — | — | revoked-upgrade-migration | Unit yes | DEC-B55; two builds (Q13) |
| AC17 other Teacher cannot resolve | policy | refused | AC17 test | — | Int yes; API E2E needs a shared student | F03 (or `all_classes` on teacher.a2, Q2) |
| AC18 app lock | lock timer | — | — | app-lock-and-cache | Unit yes | DEC-B55; Q12 |
| AC19 120-day cache cleanup | retention predicate | — | — | app-lock-and-cache | Mechanism only | F05 daily records; DEC-B55 |
| AC20 revocation purge | purge rules | — | — | app-lock-and-cache | Unit yes | DEC-B55 |

**Expected F12 gate after this feature: PENDING** (like F02). Concretely, API E2E AC14 and AC15 can pass; AC3, AC11,
AC12, AC13, AC17 can pass only if the user accepts the probe entity in E2E (Q2); AC4, AC5, AC7 as written need
F03/F04/F05/F08. Every mobile flow stays BLOCKED until DEC-B55. The feature-level "replay every operation type twice"
done-item can only be met per entity as F04/F05/F08 add them.

## 10. Decisions needed (not built until answered)

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | How to exercise the engine before any real entity exists | (a) test-only `sync_probe` entity and table, registered only with `NODE_ENV=test`; (b) pull minimal F03/F05 tables forward into F12; (c) no entity, engine tested by mocks only | **(a)**. (b) pre-empts F03/F05 specs; (c) leaves the SQL path untested |
| Q2 | May API E2E tests use the probe for AC3, AC11, AC12, AC13, AC17 (rewriting the comments in `f12-sync.spec.ts` that name records/portions), or stay `test.fixme` until F05 | (a) use the probe now and re-point to real entities in F05; (b) keep fixme | **(b) keep fixme** and cover these at integration level now; the pre-written tests describe real records, and changing them to pass a gate would weaken them |
| Q3 | Expected F12 gate result | Accept PENDING until F03/F04/F05/F08 and DEC-B55 | Accept PENDING, as for F02 |
| Q4 | Fields the docs do not classify (note body, remarks, overall label, Leave reason, absent note, Para range, homework instructions, session label, `report_date`) | (a) meaningful by default, safe-merge allowlist = display order only; (b) only the FR-SYNC-008 list is meaningful, the rest last-write-wins | **(a)**. NFR-OFF-006 forbids silent overwrites of teaching data; (b) would silently overwrite notes and remarks |
| Q5 | Two devices change **different** meaningful fields of the same row from one base version | (a) apply both (field-level merge, no conflict); (b) conflict whenever both sides changed any meaningful field; (c) field-level, but coupled groups conflict as a unit (attempt outcome = status + completed quantity + quality + mistakes; attendance = status + Leave reason/status + absent note) | **(c)**. Status and completed are coupled (NOT_REMEMBERED forces completed 0), so splitting them could create a state no one entered |
| Q6 | Is conflict resolution an online request or a queued offline operation (ARCHITECTURE §8.2 says "a new operation"; §8.3 lists neither) | (a) online `POST /sync/conflicts/:id/resolve`; (b) queued op | **(a)**. Resolving needs the current server version; queueing it could create a conflict about a conflict |
| Q7 | Edits to a row that already has an open conflict | (a) further meaningful edits are held as action required until resolved; (b) each creates another conflict | **(a)**, one open conflict per row |
| Q8 | When a Teacher loses a class (not full revocation), what happens to cached data for its students | (a) pull sends `REMOVE_FROM_DEVICE`, synced rows purged, unsynced ops for them become action required (`NOT_FOUND`); (b) keep until next sign-in | **(a)**, per NFR-OFF-010 / FR-SYNC-009 ("lock or remove newly unauthorized cached data"). F12 defines it; F03 emits it |
| Q9 | Row-level security (ADR-006), still open from F02 | (a) add RLS now for the three sync tables and set `app.current_org_id` per transaction; (b) add with F03 for all tenant tables at once | **(a)** small and isolated, and it sets the pattern F03 copies. Either way needs your call |
| Q10 | Attempt numbering when two devices append attempts offline | (a) server assigns `attempt_no` in apply order, device number is provisional; (b) client number, conflict on clash | **(a)**; ordering by device time is forbidden (edge case "wrong clock"). Decided finally in F05 |
| Q11 | Two devices create the same natural key (daily record in SINGLE mode, attendance for student + date) | (a) second create becomes a conflict holding both; (b) second rejected `VALIDATION` | **(a)**, never last-write-wins for attendance/records. F04/F05 implement; F12 store supports it |
| Q12 | App lock details not in the docs: PIN length, wrong-PIN limit, forgotten PIN, biometric without PIN | PIN 4 or 6 digits; after N wrong tries require full sign-in; fingerprint as optional shortcut over a required PIN, or fingerprint alone | **6-digit PIN required as the base; fingerprint optional shortcut; after 5 wrong PINs, sign in again with User ID + password (online); forgotten PIN = sign in again.** All values need your approval |
| Q13 | F12-AC15/AC16 mobile journeys install a previous app build (`E2E_PREVIOUS_APK`). No build pipeline produces one, and there is only one protocol version | (a) cover AC15/AC16 by API E2E + unit migration test now, and add the two-build Maestro run in CI later; (b) build the pipeline now | **(a)** |
| Q14 | "Sign out anyway" with unsynced changes: what happens to them | (a) purge synced cache, keep unsynced ops locked for that account up to 30 days and resume when the same account signs in again; (b) purge everything, including unsynced; (c) keep everything | Your call. (a) mirrors the revocation rule and avoids data loss; (b) is safest on shared phones; the docs only say "explain the risk" |
| Q15 | 120-day cache: measured from what | (a) `report_date` vs device date in the org timezone; (b) time since the record synced | **(a)**; it matches "records older than 120 days" |
| Q16 | How long synced items stay listed in the Sync Queue (AC8 lists "synced" as an item state) | 24 hours / last 50 / until next app start | 24 hours. UI choice for ui-ux-agent unless you prefer otherwise |
| DEC-B55 | Android application ID (Deferred) | — | Stays Deferred; `APP_ID` from env, flows BLOCKED. Needed before any F12 mobile gate can pass |
| DEC-B45 | AI provider (Deferred) | — | Not touched by F12 |

**Technical choices made in this plan (tell us if you disagree):** protocol version 1; push batch ≤ 100 ops; pull page
≤ 500; backoff 2 s × 2 up to 5 min with jitter, no retry limit; `426` for upgrade required and `403` for access
revoked; display-order merge = server value; terminal results stored in `sync_ops`, retryable ones not; Node's
`node:sqlite` for mobile unit tests.

### Answers (user, 2026-11-08)

- **Q1–Q8, Q10, Q11, Q13, Q15, Q16 and the technical choices:** the recommendations above are accepted as written.
- **Q9:** add row-level security now, for the three sync tables (`sync_ops`, `change_log`, `sync_conflicts`), setting
  `app.current_org_id` per transaction. F03 copies the pattern.
- **Q12:** a 6-digit PIN is required as the base; fingerprint is an optional shortcut. After 5 wrong PINs, or a
  forgotten PIN, the user signs in again online with User ID + password.
- **Q14:** "Sign out anyway" purges the synced cache and keeps unsynced operations locked to that account for up to
  30 days; they resume when the same account signs in again.
- **DEC-B55** and **DEC-B45** stay Deferred.

## 11. Inconsistencies found in the documents

1. **Spec order vs dependencies.** F12 (order 4) is meant to sync entities from F04, F05, F08 and filter by F03 scope,
   all built later; its pre-written E2E tests and Maestro flows use daily records, portions, attempts, attendance,
   homework, and students S1/S3. The gate cannot pass in F12. Not a contradiction, but the index's "Depends on: F01,
   F02" understates it.
2. **"Portion's status" (F12-AC11) vs the data model.** Status lives on `portion_attempts`, not `lesson_portions`
   (ARCHITECTURE §6.3). Read as "the latest attempt's status"; F05 to confirm.
3. **Sync-state lists differ.** NFR-OFF-003 names four states (saved locally, syncing, synchronized,
   action-required/conflict); FR-SYNC-007 and F12-AC8 name five (adds failed); design.md §4.13 lists nine banner
   states (adds offline, waiting to sync, session expired, access revoked). Proposed: five queue-item states
   (FR-SYNC-007) plus workspace-level banner states for offline, session expired, access revoked.
4. **Resolution as "a new operation"** (ARCHITECTURE §8.2) vs "applied as a new audited change" (F12-AC12) and no
   mention in §8.3's offline/online table. See Q6.
5. **ADR-004** is "Decided" in ARCHITECTURE §19 while every other ADR is "Approved 2026-10-30"; DEC-B51 approved all.
   Cosmetic.
6. **Bulk Entry statuses.** ARCHITECTURE §6.5 says Bulk Entry writes only `PRESENT`/`ABSENT`; FR-CAL-007, §8.3,
   and AGENTS.md §5 say all five statuses. Affects F04's attendance sync handler, not F12 itself.
7. **`packages/domain` is not a workspace** (no `package.json`, not typechecked) although ARCHITECTURE §4 treats it
   as a package. Fixed in slice 1, no decision needed.
8. **`sync_ops` in ARCHITECTURE §6.3** has no op hash or status; storing a hash is needed to detect a reused `op_id`
   with a different payload. Additive.
9. **F12-AC17 fixture.** No seeded student is shared by two Teachers (S1 is only in A1/teacher.a1). The test needs
   F03 assignments or `all_classes` on teacher.a2.

## 12. Status (2026-11-08)

### Built, per slice

| # | Slice | Commits |
|---|---|---|
| 1 | `@hifz/domain` workspace and pure sync rules (ordering, backoff, field classes, conflict, resolve, queue states) | `9dccca0` |
| 2 | Contracts `packages/contracts/src/sync.ts` and the new error codes | `4e00561` |
| 3 | API `sync` module, migration 0004 with RLS, `ACCESS_REVOKED` on identity | `5b75bb8` |
| 4–5 | Mobile local DB, outbox, engine, retention, app lock; sync banner, Sync Queue, Conflict Review, sign-out warning, workspace-locked screen (3 locales) | `de0b4aa` |
| 6 | API E2E F12-AC14 and AC15 real; F01-AC22 now expects `403 ACCESS_REVOKED` | `c20127e` |
| 7 | Review fixes: API/domain and migration 0005 | `e3d6804` |
| 7 | Review fixes: mobile and security hardening (local migration v2) | `a3cf972` |
| 8 | Docs: `apps/api/README.md`, `apps/mobile/README.md`, ADR-015, ADR-016, ARCHITECTURE §4, §6.3, §8.1, §8.2, §15, §19, this section | not committed |

### Deviations from this plan

- **`RETRY CONFLICT_OPEN` is used** (the `?` in §5): any edit of a row with an open conflict is held as action
  required, not stored, and re-sent once the conflict is resolved (Q7). The domain adds a `CONFLICT_CLEARED` event.
- **`GET /sync/pull` takes `protocolVersion`** (absent = 1), so `426` applies to pull as well as push.
- **RLS also covers `scope_changes`** (the plan named three tables). **`sync_conflicts` stores scope keys**
  (`student_id`, `class_id`), used to list a Teacher's conflicts within scope.
- **Migration `0005_sync_hardening.sql`:** the tenant role may update only `status`, `resolved_by`, `resolved_at`,
  `resolution` on `sync_conflicts`.
- **Server conflict check ignores the same user and device's own earlier edits**; a dependency counts as met once its
  conflict is resolved; coupled groups must be sent whole.
- **Mobile:** `deferred_changes` table (pulled changes held while a row has unsynced edits); **Retry re-queues the
  change under a new `op_id`** (the old one would replay its stored refusal); an UPDATE after an unsynced CREATE is
  queued with `dependsOn` the create and `baseVersion` 1. Drizzle is not used yet (a small SQL driver over
  `expo-sqlite`; `node:sqlite` in tests).

### Results

- **F12 gate: PENDING**, as expected in §9. API E2E F12-AC14 and F12-AC15 pass; the other F12 API tests stay
  `test.fixme` (Q2) and every mobile flow stays pending (no real entities yet; DEC-B55; no emulator here).
- `npm run docs:check` and `npm run e2e:trace`: OK (slice 8).

### Open items for the user

| # | Item |
|---|---|
| D1 | The device SQLite workspaces are not encrypted (SQLCipher). Today they rely on app sandboxing, `allowBackup: false`, and the app lock |
| D2 | No `FLAG_SECURE` on sync, conflict, and PIN screens (nor on F01's recovery-code screens) |
| D3 | The revoked, offline, and session-expired screens are not behind the app lock |
| D4 | No rate limiting on `/sync/*` |
| D5 | **Offline cold start:** after an app restart while offline, a Teacher cannot reach work screens, which defeats offline daily entry once F04/F05 land |
| D6 | **`queue-and-sign-out.yaml` step 2** expects a temporary 503 to show "Failed" with Retry; the app keeps the item "Pending, retrying automatically" (F12-AC6, NFR-OFF-007). Change the flow or the app |
| D7 | A reactivated account's workspace stays locked on the device until that user signs out |
| D8 | Android 12+ device-to-device transfer is not blocked by `allowBackup: false`; needs `dataExtractionRules` |
| D9 | Domain gap: `@hifz/domain/sync` `transition` has no `ACTION_REQUIRED → FAILED` event for a conflict that is no longer reachable (`404`, out of scope, Q8). The engine writes `FAILED` directly (`conflictGone` in `apps/mobile/src/sync/engine.ts`); add a `CONFLICT_GONE` event |
| D10 | Doc inconsistency: F12-AC18, NFR-OFF-011, and ARCHITECTURE §8.2 say "PIN or fingerprint"; decision Q12 makes the PIN required with fingerprint as a shortcut. SRS/spec wording needs the user's approval to change |
| D11 | Doc inconsistency: F01-AC22 E2E now expects `403 ACCESS_REVOKED` (not `401`) for a deactivated account's session; confirm the F01 spec wording |
| — | DEC-B55 (application ID) and DEC-B45 (AI provider) stay Deferred |
