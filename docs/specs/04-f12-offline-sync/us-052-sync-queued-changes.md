# SPEC-US-052 · Sync queued changes

| | |
|---|---|
| **Spec ID** | SPEC-US-052 |
| **User story** | US-052 |
| **Feature** | [F12 · Offline and synchronization](README.md) |
| **Epic** | EPIC 12 — Offline and Synchronization ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F12-offline-sync.md` on 2026-10-30 |

## User story

**US-052 — Sync queued changes**

As a Teacher, I want offline changes synchronized when connectivity returns.

Spec wording (from F12):

- **US-052:** As a Teacher, I want offline changes synced when the connection returns, so that the server and reports catch up without my help.

**Feature context** (shared by every story in F12, copied from the feature spec):

> Teachers often work without internet. Their attendance, daily records, attempts, and draft homework must save on the phone and survive a crash. The work then reaches the server later, exactly once.
>
> When two people change the same teaching data, both versions are kept, and a person decides which one wins. Nothing is silently overwritten.
>
> There is no code yet. This feature builds:
> - on the device: the local SQLite store, the outbox, and the sync engine
> - on the server: the `sync` module, with `/sync/push`, `/sync/pull`, `sync_ops`, `change_log`, and `sync_conflicts` ([ARCHITECTURE.md §8](../../ARCHITECTURE.md))
>
> F04, F05, and F08 write through it.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-SYNC-006, FR-SYNC-007, FR-SYNC-009
- **Non-functional:** NFR-OFF-004, NFR-OFF-005, NFR-OFF-007, NFR-OFF-011
- **SRS acceptance tests cited:** None

Feature requirement set (from F12; additions of 2026-10-30 at the end): NFR-OFF-001…010, FR-SYNC-006…009, NFR-OFF-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

### Detailed acceptance criteria

From the F12 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F12-AC4** — **(US-052) Given** pending operations, **when** the connection returns, **then** they are sent in order, and a record is sent before the portions and attempts that depend on it.
- **F12-AC5** — **(US-052) Given** an operation the server already applied, **when** the app sends it again because the acknowledgement was lost, **then** the server returns the stored result, and no duplicate record, attempt, attendance, or homework portion is created.
- **F12-AC6** — **(US-052) Given** a temporary server error, **when** sync fails, **then** it retries with increasing delays, and the operation stays pending.
- **F12-AC7** — **(US-052) Given** changes made by others on the server, **when** the app pulls with its last cursor, **then** it receives only changes since that cursor, filtered to what the Teacher is allowed to see.
- **F12-AC14** — **(US-052) Given** a Teacher whose access was revoked, **when** the app syncs, **then** the server refuses with "access revoked", and the app stops syncing that workspace and locks its cached data. Pending changes stay visible.
- **F12-AC15** — **(US-052) Given** an app version older than the supported sync protocol, **when** it syncs, **then** the server answers "upgrade required", and pending changes are kept.
- **F12-AC20** — **(US-052) Given** a device that learns its access was revoked, **when** the workspace locks, **then** synced data is purged at once, and unsynced changes stay locked and visible until sign-out or 30 days, then are purged. *(Added 2026-10-30, DEC-B42.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F12-AC6, F12-AC15.

## Edge cases and error handling

Rows from the F12 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A dependency failed (the record was rejected) | Its portions stay pending, marked "waiting for record"; nothing is sent out of order |
| The session expires during sync | Sync pauses; after sign-in it resumes with no duplicates |

**Out of scope for the whole feature** (verbatim from F12):

- Offline access for Students and Parents.
- Offline sign-in, password reset, or Admin approvals.
- Last-write-wins for attempts, attendance, quantities, quality, mistakes, or homework.
- Peer-to-peer sync between devices.

## Dependencies

- **Feature F12 depends on:** F01, F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F12:** [US-051](us-051-save-daily-work-offline.md), [US-053](us-053-see-sync-status.md), [US-054](us-054-resolve-conflicting-edits.md)

## Related screens and UI

- **Feature flow** (from F12): Offline and synchronization ([design.md §4.13, §5.9, §8](../../design.md)); conflict review

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-051 to US-054 | §4.13 Offline and sync; §5.9 sync banner | Banner → Sync queue; Retry; Review conflict; sign-out warning when unsynced changes exist | All sync states in §8 | — | No success check before acknowledgement; count in text, not icon only |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): mobile `local-db`/`sync`, API `sync`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F12-AC4, F12-AC6, F12-AC14, F12-AC15, F12-AC20.

And in these edge cases (see above):

- The session expires during sync

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-052` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC4 (US-052) a record must exist before its dependent portions and attempts
- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC5 (US-052) replaying an applied op_id returns the stored result and creates nothing
- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC7 (US-052) a pull returns only changes since the cursor, within scope
- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC14 (US-052) a revoked Teacher gets "access revoked" on sync
- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC15 (US-052) an unsupported protocol version gets "upgrade required"

**Mobile (Maestro):**

- [e2e/mobile/f12-sync/app-lock-and-cache.yaml](../../../e2e/mobile/f12-sync/app-lock-and-cache.yaml) — F12 app lock, cache retention, and revocation purge
- [e2e/mobile/f12-sync/offline-save-and-sync.yaml](../../../e2e/mobile/f12-sync/offline-save-and-sync.yaml) — F12 offline — save, kill app, reopen, reconnect, synced once
- [e2e/mobile/f12-sync/queue-and-sign-out.yaml](../../../e2e/mobile/f12-sync/queue-and-sign-out.yaml) — F12 sync queue — states, retry, sign-out warning
- [e2e/mobile/f12-sync/revoked-upgrade-migration.yaml](../../../e2e/mobile/f12-sync/revoked-upgrade-migration.yaml) — F12 sync edges — access revoked, upgrade required, local DB upgrade keeps outbox

**Unit (Vitest):**

- [apps/mobile/src/sync/outbox.test.ts](../../../apps/mobile/src/sync/outbox.test.ts) — F12-AC4 (US-052) operations are sent in order, a record before its portions and attempts
- [apps/mobile/src/sync/outbox.test.ts](../../../apps/mobile/src/sync/outbox.test.ts) — F12-AC6 (US-052) temporary errors retry with increasing delays and the operation stays pending
- [apps/mobile/src/sync/outbox.test.ts](../../../apps/mobile/src/sync/outbox.test.ts) — F12-AC14 (US-052) "access revoked" stops syncing that workspace and keeps pending changes visible
- [apps/mobile/src/sync/outbox.test.ts](../../../apps/mobile/src/sync/outbox.test.ts) — F12-AC15 (US-052) "upgrade required" keeps pending changes

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-052 → SPEC-US-052 (this file)
- **Detailed criteria:** F12-AC4, F12-AC5, F12-AC6, F12-AC7, F12-AC14, F12-AC15, F12-AC20
- **Requirements:** NFR-OFF-004, NFR-OFF-005, NFR-OFF-007, FR-SYNC-006, FR-SYNC-007, FR-SYNC-009, NFR-OFF-011
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 12
- **Previous location:** `docs/specs/F12-offline-sync.md`
