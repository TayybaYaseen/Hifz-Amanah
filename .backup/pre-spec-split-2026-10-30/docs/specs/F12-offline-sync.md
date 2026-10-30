# F12 · Offline and synchronization

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Offline and synchronization ([design.md §4.13, §5.9, §8](../../design.md)); conflict review
**Stories:** US-051 – US-054 · **Requirements:** NFR-OFF-001…010, FR-SYNC-006…009

## Context

Teachers often work without internet. Their attendance, daily records, attempts, and draft homework must save on the phone and survive a crash. The work then reaches the server later, exactly once.

When two people change the same teaching data, both versions are kept, and a person decides which one wins. Nothing is silently overwritten.

There is no code yet. This feature builds:
- on the device: the local SQLite store, the outbox, and the sync engine
- on the server: the `sync` module, with `/sync/push`, `/sync/pull`, `sync_ops`, `change_log`, and `sync_conflicts` ([ARCHITECTURE.md §8](../../ARCHITECTURE.md))

F04, F05, and F08 write through it.

## User story

- **US-051:** As a Teacher, I want daily entries saved on the phone when there's no internet, so that I never lose a lesson's records.
- **US-052:** As a Teacher, I want offline changes synced when the connection returns, so that the server and reports catch up without my help.
- **US-053:** As a Teacher, I want to see pending, syncing, synced, failed, and action-required states, so that I know what has reached the server.
- **US-054:** As an authorized user, I want conflicting edits kept and reviewed, not silently overwritten, so that no teaching data is lost.

## Acceptance criteria

1. **(US-051) Given** no internet connection, **when** the Teacher saves a daily record, **then** the record and its outbox operation are written in one local transaction before the screen says "Saved on this device — waiting to sync".
2. **(US-051) Given** a saved offline change, **when** the app is force-closed and reopened, **then** the change and its pending operation are still there.
3. **(US-051) Given** a new record created offline, **when** it is saved, **then** it has a client-generated UUID that never changes, including after sync.
4. **(US-052) Given** pending operations, **when** the connection returns, **then** they are sent in order, and a record is sent before the portions and attempts that depend on it.
5. **(US-052) Given** an operation the server already applied, **when** the app sends it again because the acknowledgement was lost, **then** the server returns the stored result, and no duplicate record, attempt, attendance, or homework portion is created.
6. **(US-052) Given** a temporary server error, **when** sync fails, **then** it retries with increasing delays, and the operation stays pending.
7. **(US-052) Given** changes made by others on the server, **when** the app pulls with its last cursor, **then** it receives only changes since that cursor, filtered to what the Teacher is allowed to see.
8. **(US-053) Given** pending operations, **when** the Teacher opens the sync queue, **then** each item shows one of: pending, syncing, synced, failed (with a reason and Retry), or action required.
9. **(US-053) Given** a change saved locally, **when** the server has not yet acknowledged it, **then** the UI never shows it as synced.
10. **(US-053) Given** unsynced changes, **when** the Teacher tries to sign out, **then** a warning shows the count, with the options "Sync now", "Cancel", and "Sign out anyway".
11. **(US-054) Given** a portion's status edited on two devices from the same base version, **when** the second edit syncs, **then** a conflict is created holding both versions, and the record is marked action required. Neither version is applied over the other.
12. **(US-054) Given** a conflict, **when** an authorized user picks a version or merges fields in Conflict Review, **then** the result is applied as a new audited change, and the conflict is closed.
13. **(US-054) Given** a field that is not meaningful (such as display order) changed on both devices, **when** they sync, **then** the documented safe merge applies with no conflict.
14. **(US-052) Given** a Teacher whose access was revoked, **when** the app syncs, **then** the server refuses with "access revoked", and the app stops syncing that workspace and locks its cached data. Pending changes stay visible.
15. **(US-052) Given** an app version older than the supported sync protocol, **when** it syncs, **then** the server answers "upgrade required", and pending changes are kept.
16. **(US-051) Given** a local database upgrade in a new app version, **when** it runs with pending operations, **then** every pending operation survives and still syncs.

## Out of scope

- Offline access for Students and Parents.
- Offline sign-in, password reset, or Admin approvals.
- Last-write-wins for attempts, attendance, quantities, quality, mistakes, or homework.
- Peer-to-peer sync between devices.

## Edge cases

| Situation | What should happen |
|---|---|
| The phone's clock is wrong | Ordering uses the outbox sequence and server versions, not device time; `report_date` is whatever the Teacher chose |
| A dependency failed (the record was rejected) | Its portions stay pending, marked "waiting for record"; nothing is sent out of order |
| The session expires during sync | Sync pauses; after sign-in it resumes with no duplicates |
| The server rejects an operation as invalid | Marked failed with the field reason; the local draft is kept for correction or explicit discard |
| A user discards a pending change | Only after a confirmation; the discard is recorded locally |

## Open questions

- [ ] Local cache retention, app lock (PIN/biometric), and what happens to locked data after revocation (SRS §13 #8).
- [ ] Who may resolve conflicts: the Teacher who made the change, any Admin, or both?
- [ ] D2: is homework confirmation an operation that can run offline?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F12` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] A replay test sends every operation type twice and asserts that no duplicate rows exist.
- [ ] The local-migration test runs with a populated outbox.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Outbox ordering and dependencies, backoff schedule, conflict detection on meaningful fields, safe-merge rules | `apps/mobile/src/sync/*.test.ts`, `packages/domain/sync/*.test.ts` |
| **Integration** | `/sync/push` idempotency by `op_id`, dependency rejection, conflict creation and resolution, cursor pull with permission filter, revocation, protocol version | `apps/api/test/sync/*.test.ts` |
| **Component** | Sync banner and queue states, sign-out warning, Conflict Review screen | `apps/mobile/src/features/sync/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Airplane mode → record → kill app → reopen → reconnect → synced once; two devices edit the same portion → conflict → resolve | `e2e/api/f12-sync.spec.ts`, `e2e/mobile/f12-sync/` |

**Traceability:** Each test name starts with its criterion, e.g. `F12-AC05 (US-052) …`. Every AC 1–16 has at least one test.

**Coverage:** ≥80% on new code.
