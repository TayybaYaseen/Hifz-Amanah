# SPEC-US-053 · See sync status

| | |
|---|---|
| **Spec ID** | SPEC-US-053 |
| **User story** | US-053 |
| **Feature** | [F12 · Offline and synchronization](README.md) |
| **Epic** | EPIC 12 — Offline and Synchronization ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F12-offline-sync.md` on 2026-10-30 |

## User story

**US-053 — See sync status**

As a Teacher, I want to see pending, syncing, synced, failed, and action-required states.

Spec wording (from F12):

- **US-053:** As a Teacher, I want to see pending, syncing, synced, failed, and action-required states, so that I know what has reached the server.

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

- **Functional:** FR-SYNC-007
- **Non-functional:** NFR-OFF-003, NFR-OFF-007
- **SRS acceptance tests cited:** None

Feature requirement set (from F12; additions of 2026-10-30 at the end): NFR-OFF-001…010, FR-SYNC-006…009, NFR-OFF-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

### Detailed acceptance criteria

From the F12 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F12-AC8** — **(US-053) Given** pending operations, **when** the Teacher opens the sync queue, **then** each item shows one of: pending, syncing, synced, failed (with a reason and Retry), or action required.
- **F12-AC9** — **(US-053) Given** a change saved locally, **when** the server has not yet acknowledged it, **then** the UI never shows it as synced.
- **F12-AC10** — **(US-053) Given** unsynced changes, **when** the Teacher tries to sign out, **then** a warning shows the count, with the options "Sync now", "Cancel", and "Sign out anyway".

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F12-AC8.

## Edge cases and error handling

Rows from the F12 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The server rejects an operation as invalid | Marked failed with the field reason; the local draft is kept for correction or explicit discard |
| A user discards a pending change | Only after a confirmation; the discard is recorded locally |

**Out of scope for the whole feature** (verbatim from F12):

- Offline access for Students and Parents.
- Offline sign-in, password reset, or Admin approvals.
- Last-write-wins for attempts, attendance, quantities, quality, mistakes, or homework.
- Peer-to-peer sync between devices.

## Dependencies

- **Feature F12 depends on:** F01, F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F12:** [US-051](us-051-save-daily-work-offline.md), [US-052](us-052-sync-queued-changes.md), [US-054](us-054-resolve-conflicting-edits.md)

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

Stated in these criteria: F12-AC8, F12-AC9, F12-AC10.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-053` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- None

**Mobile (Maestro):**

- [e2e/mobile/f12-sync/offline-save-and-sync.yaml](../../../e2e/mobile/f12-sync/offline-save-and-sync.yaml) — F12 offline — save, kill app, reopen, reconnect, synced once
- [e2e/mobile/f12-sync/queue-and-sign-out.yaml](../../../e2e/mobile/f12-sync/queue-and-sign-out.yaml) — F12 sync queue — states, retry, sign-out warning

**Unit (Vitest):**

- [apps/mobile/src/sync/outbox.test.ts](../../../apps/mobile/src/sync/outbox.test.ts) — F12-AC8 (US-053) each item is pending, syncing, synced, failed (with reason), or action required
- [apps/mobile/src/sync/outbox.test.ts](../../../apps/mobile/src/sync/outbox.test.ts) — F12-AC9 (US-053) an item is never synced until the server acknowledges it

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-053 → SPEC-US-053 (this file)
- **Detailed criteria:** F12-AC8, F12-AC9, F12-AC10
- **Requirements:** NFR-OFF-003, NFR-OFF-007, FR-SYNC-007
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 12
- **Previous location:** `docs/specs/F12-offline-sync.md`
