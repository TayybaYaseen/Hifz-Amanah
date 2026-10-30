# SPEC-US-054 · Resolve conflicting edits

| | |
|---|---|
| **Spec ID** | SPEC-US-054 |
| **User story** | US-054 |
| **Feature** | [F12 · Offline and synchronization](README.md) |
| **Epic** | EPIC 12 — Offline and Synchronization ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F12-offline-sync.md` on 2026-10-30 |

## User story

**US-054 — Resolve conflicting edits**

As an authorized user, I want meaningful sync conflicts preserved and reviewed instead of silently overwritten.

Spec wording (from F12):

- **US-054:** As an authorized user, I want conflicting edits kept and reviewed, not silently overwritten, so that no teaching data is lost.

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

- **Functional:** FR-SYNC-008, FR-SYNC-009
- **Non-functional:** NFR-OFF-006
- **SRS acceptance tests cited:** None

Feature requirement set (from F12; additions of 2026-10-30 at the end): NFR-OFF-001…010, FR-SYNC-006…009, NFR-OFF-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

### Detailed acceptance criteria

From the F12 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F12-AC11** — **(US-054) Given** a portion's status edited on two devices from the same base version, **when** the second edit syncs, **then** a conflict is created holding both versions, and the record is marked action required. Neither version is applied over the other.
- **F12-AC12** — **(US-054) Given** a conflict, **when** the Teacher whose change caused it, or an Owner/Admin, picks a version or merges fields in Conflict Review, **then** the result is applied as a new audited change, and the conflict is closed. *(Revised 2026-10-30, DEC-B18.)*
- **F12-AC13** — **(US-054) Given** a field that is not meaningful (such as display order) changed on both devices, **when** they sync, **then** the documented safe merge applies with no conflict.
- **F12-AC17** — **(US-054) Given** a conflict caused by Teacher A, **when** Teacher B, who is also assigned to the student, tries to resolve it, **then** it is refused. *(Added 2026-10-30, DEC-B18.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F12-AC11, F12-AC17.

## Edge cases and error handling

No F12 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

**Out of scope for the whole feature** (verbatim from F12):

- Offline access for Students and Parents.
- Offline sign-in, password reset, or Admin approvals.
- Last-write-wins for attempts, attendance, quantities, quality, mistakes, or homework.
- Peer-to-peer sync between devices.

## Dependencies

- **Feature F12 depends on:** F01, F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F12:** [US-051](us-051-save-daily-work-offline.md), [US-052](us-052-sync-queued-changes.md), [US-053](us-053-see-sync-status.md)

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

Stated in these criteria: F12-AC11, F12-AC13.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-054` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC11 (US-054) concurrent edits from one base version create a conflict
- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC12 (US-054) the author or an Admin resolves a conflict as an audited change
- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC13 (US-054) a non-meaningful field merges without a conflict
- [e2e/api/f12-sync.spec.ts](../../../e2e/api/f12-sync.spec.ts) — F12-AC17 (US-054) only the conflict author or an Admin can resolve a conflict

**Mobile (Maestro):**

- [e2e/mobile/f12-sync/conflict-review.yaml](../../../e2e/mobile/f12-sync/conflict-review.yaml) — F12 conflict — two edits from one base version, review, resolve

**Unit (Vitest):**

- [packages/domain/sync/conflict.test.ts](../../../packages/domain/sync/conflict.test.ts) — F12-AC11 (US-054) two edits to a portion status from the same base version create a conflict holding both versions
- [packages/domain/sync/conflict.test.ts](../../../packages/domain/sync/conflict.test.ts) — F12-AC13 (US-054) a non-meaningful field such as display order merges without a conflict
- [packages/domain/sync/conflict.test.ts](../../../packages/domain/sync/conflict.test.ts) — F12-AC12 (US-054) picking a version or merging fields produces a new change and closes the conflict

## Open decisions and blockers

Open questions from F12 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Who may resolve conflicts: the Teacher who made the change, any Admin, or both? **Resolved:** The author or any Owner/Admin (DEC-B18, FR-SYNC-008).

## Traceability

- **Story:** US-054 → SPEC-US-054 (this file)
- **Detailed criteria:** F12-AC11, F12-AC12, F12-AC13, F12-AC17
- **Requirements:** NFR-OFF-006, FR-SYNC-008, FR-SYNC-009
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 12
- **Previous location:** `docs/specs/F12-offline-sync.md`
