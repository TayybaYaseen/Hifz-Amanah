# F12 · Offline and synchronization

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Offline and synchronization ([design.md §4.13, §5.9, §8](../../design.md)); conflict review
**Requirements:** NFR-OFF-001…010, FR-SYNC-006…009, NFR-OFF-011
**Stories:** US-051 – US-054 · **Depends on:** F01, F02
**Build order:** 4 of 17 (dependency level 2)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-051](us-051-save-daily-work-offline.md) | US-051 — Save daily work offline | F12-AC1, F12-AC2, F12-AC3, F12-AC16, F12-AC18, F12-AC19 |
| [SPEC-US-052](us-052-sync-queued-changes.md) | US-052 — Sync queued changes | F12-AC4, F12-AC5, F12-AC6, F12-AC7, F12-AC14, F12-AC15, F12-AC20 |
| [SPEC-US-053](us-053-see-sync-status.md) | US-053 — See sync status | F12-AC8, F12-AC9, F12-AC10 |
| [SPEC-US-054](us-054-resolve-conflicting-edits.md) | US-054 — Resolve conflicting edits | F12-AC11, F12-AC12, F12-AC13, F12-AC17 |

## Context

Teachers often work without internet. Their attendance, daily records, attempts, and draft homework must save on the phone and survive a crash. The work then reaches the server later, exactly once.

When two people change the same teaching data, both versions are kept, and a person decides which one wins. Nothing is silently overwritten.

There is no code yet. This feature builds:
- on the device: the local SQLite store, the outbox, and the sync engine
- on the server: the `sync` module, with `/sync/push`, `/sync/pull`, `sync_ops`, `change_log`, and `sync_conflicts` ([ARCHITECTURE.md §8](../../ARCHITECTURE.md))

F04, F05, and F08 write through it.

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

## Open questions (resolved 2026-10-30)

- [x] Local cache retention, app lock (PIN/biometric), and what happens to locked data after revocation (SRS §13 #8). **Resolved:** 120-day cache; app lock required for Owner/Admin; purge rules in NFR-OFF-011 (DEC-B42).
- [x] Who may resolve conflicts: the Teacher who made the change, any Admin, or both? **Resolved:** The author or any Owner/Admin (DEC-B18, FR-SYNC-008).
- [x] D2: is homework confirmation an operation that can run offline? **Resolved:** Yes (DEC-B29, FR-HW-017).

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

**Traceability:** Each test name starts with its criterion, e.g. `F12-AC05 (US-052) …`. Every AC 1–20 has at least one test.

**Coverage:** ≥80% on new code.
