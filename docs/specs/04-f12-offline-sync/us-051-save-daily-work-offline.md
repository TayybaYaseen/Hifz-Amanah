# SPEC-US-051 · Save daily work offline

| | |
|---|---|
| **Spec ID** | SPEC-US-051 |
| **User story** | US-051 |
| **Feature** | [F12 · Offline and synchronization](README.md) |
| **Epic** | EPIC 12 — Offline and Synchronization ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F12-offline-sync.md` on 2026-10-30 |

## User story

**US-051 — Save daily work offline**

As a Teacher, I want daily entries saved locally when internet is unavailable.

Spec wording (from F12):

- **US-051:** As a Teacher, I want daily entries saved on the phone when there's no internet, so that I never lose a lesson's records.

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

- **Functional:** FR-SYNC-006
- **Non-functional:** NFR-OFF-001, NFR-OFF-002, NFR-OFF-009, NFR-OFF-010, NFR-OFF-011
- **SRS acceptance tests cited:** None

Feature requirement set (from F12; additions of 2026-10-30 at the end): NFR-OFF-001…010, FR-SYNC-006…009, NFR-OFF-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

### Detailed acceptance criteria

From the F12 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F12-AC1** — **(US-051) Given** no internet connection, **when** the Teacher saves a daily record, **then** the record and its outbox operation are written in one local transaction before the screen says "Saved on this device — waiting to sync".
- **F12-AC2** — **(US-051) Given** a saved offline change, **when** the app is force-closed and reopened, **then** the change and its pending operation are still there.
- **F12-AC3** — **(US-051) Given** a new record created offline, **when** it is saved, **then** it has a client-generated UUID that never changes, including after sync.
- **F12-AC16** — **(US-051) Given** a local database upgrade in a new app version, **when** it runs with pending operations, **then** every pending operation survives and still syncs.
- **F12-AC18** — **(US-051) Given** an Owner or Admin, **when** they first sign in on a device, **then** they must set a PIN or fingerprint app lock. A Teacher may skip it. The app locks after 5 minutes in the background. *(Added 2026-10-30, DEC-B42.)*
- **F12-AC19** — **(US-051) Given** synced daily records older than 120 days on a device, **when** the app cleans its cache, **then** they are removed from the device and still load from the server when online. Unsynced records are never removed. *(Added 2026-10-30, DEC-B42.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F12 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The phone's clock is wrong | Ordering uses the outbox sequence and server versions, not device time; `report_date` is whatever the Teacher chose |

**Out of scope for the whole feature** (verbatim from F12):

- Offline access for Students and Parents.
- Offline sign-in, password reset, or Admin approvals.
- Last-write-wins for attempts, attendance, quantities, quality, mistakes, or homework.
- Peer-to-peer sync between devices.

## Dependencies

- **Feature F12 depends on:** F01, F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F12:** [US-052](us-052-sync-queued-changes.md), [US-053](us-053-see-sync-status.md), [US-054](us-054-resolve-conflicting-edits.md)

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

Stated in these criteria: F12-AC1, F12-AC2, F12-AC3, F12-AC16, F12-AC18, F12-AC19.

And in these edge cases (see above):

- The phone's clock is wrong

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-051` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC3 (US-051) the server keeps the client-generated UUID

**Mobile (Maestro):**

- [e2e/mobile/f12-sync/app-lock-and-cache.yaml](../../../e2e/mobile/f12-sync/app-lock-and-cache.yaml) — F12 app lock, cache retention, and revocation purge
- [e2e/mobile/f12-sync/offline-save-and-sync.yaml](../../../e2e/mobile/f12-sync/offline-save-and-sync.yaml) — F12 offline — save, kill app, reopen, reconnect, synced once
- [e2e/mobile/f12-sync/revoked-upgrade-migration.yaml](../../../e2e/mobile/f12-sync/revoked-upgrade-migration.yaml) — F12 sync edges — access revoked, upgrade required, local DB upgrade keeps outbox

**Unit (Vitest):**

- [apps/mobile/src/sync/outbox.test.ts](../../../apps/mobile/src/sync/outbox.test.ts) — F12-AC3 (US-051) an offline-created record gets a client UUIDv7 that never changes, including after sync

## Open decisions and blockers

Open questions from F12 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Local cache retention, app lock (PIN/biometric), and what happens to locked data after revocation (SRS §13 #8). **Resolved:** 120-day cache; app lock required for Owner/Admin; purge rules in NFR-OFF-011 (DEC-B42).
- [x] D2: is homework confirmation an operation that can run offline? **Resolved:** Yes (DEC-B29, FR-HW-017).

## Traceability

- **Story:** US-051 → SPEC-US-051 (this file)
- **Detailed criteria:** F12-AC1, F12-AC2, F12-AC3, F12-AC16, F12-AC18, F12-AC19
- **Requirements:** NFR-OFF-001, NFR-OFF-002, NFR-OFF-009, NFR-OFF-010, FR-SYNC-006, NFR-OFF-011
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 12
- **Previous location:** `docs/specs/F12-offline-sync.md`
