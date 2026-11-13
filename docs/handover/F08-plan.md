# F08 · Homework and carry forward: implementation plan

**Spec:** [11-f08-homework-carry-forward.md](../specs/11-f08-homework-carry-forward.md) · **Stories:** US-033…US-038 · **Criteria:** F08-AC1…AC22
**Requirements:** FR-HW-001…018, FR-QTY-005, FR-RPT-007, NFR-PERF-003, NFR-REL-003 · **Decisions:** DEC-B17, DEC-B29, DEC-B30, DEC-B60, DEC-B61
**Branch:** `feature/f08-homework-carry-forward` (from `main` after F07)

## 1. Shape

| Piece | Where |
|---|---|
| `suggest()` (eligibility, latest attempt, remaining, Sabaq carry-forward, source links, unit-mismatch flag), next class day, carried-over state, homework counts, lifecycle | `packages/domain/homework` (pure) |
| Sync fields, commands, views, REST queries | `packages/contracts/src/homework.ts` |
| `homework_assignments`, `homework_portions`, `lesson_portions.homework_portion_id` | migration `0014_homework.sql` |
| `homework_assignment` sync handler: CREATE (draft), UPDATE (draft edits, reject), COMMAND `CONFIRM_HOMEWORK` | `apps/api/src/modules/homework` |
| Draft recalculation when a source attempt or portion changes; "Confirmed homework was not changed" notice | homework module, called by the F05 handlers |
| `GET /homework/assignments`, `GET /homework/assignments/:id`, `GET /homework/suggestion`, `POST /homework/assignments/:id/revise` | homework routes |
| Homework screen (Suggested / Confirmed), review, offline confirm, revise (Owner/Admin), due homework in Daily Entry | `apps/mobile/src/features/homework` |

## 2. Data flow

1. **Drafts are created by the client** (the app, online or offline; ARCHITECTURE §6.1 lists homework drafts as client-created UUIDv7 rows). After a daily record is saved, the app runs `suggest()` over the record's latest attempts and saves a `DRAFT` with its portions in one SQLite transaction with the outbox op. Online, `GET /homework/suggestion?dailyRecordId=` returns the server's own `suggest()` result.
2. **Portions travel inside the assignment** (`portions` list in the `homework_assignment` op), like mistakes inside an attempt. Each portion has its own client UUIDv7, so a next-class lesson portion can link to it (FR-HW-015). The reserved `homework_portion` sync entity stays unused.
3. **The server never trusts client quantities on suggested portions** (AGENTS §6). For origin `SUGGESTED`, it re-derives section, Para, range, Total Lines, assigned quantity, and the review flag from the source attempt. It refuses a source that is not eligible (`sourceAttemptId: NOT_ELIGIBLE`), not the latest attempt (`NOT_LATEST`), another student's (`NOT_FOUND`), or already carried forward by another live assignment (`ALREADY_ASSIGNED`). `TEACHER_EDITED` and `TEACHER_ADDED` portions are validated with the F05 portion rules.
4. **Confirmation** is the COMMAND `CONFIRM_HOMEWORK` with `{confirmedAt, sources: [{entity, id, rowVersion}]}` (ARCHITECTURE §8.3). In one transaction the server checks that the draft and every source attempt and source portion are unchanged since the device built the draft. Changes by other users or devices count; the device's own earlier edits do not (F12 `changedSince`). If anything changed, it stores a sync conflict and leaves the draft as a draft (F08-AC21). Otherwise it validates every portion, sets `CONFIRMED`, `confirmed_by`, `confirmed_at` (the device's time, F08-AC20), and audits `HOMEWORK_CONFIRMED`. Any failure rolls back everything (F08-AC12).
5. **Recalculation** (FR-HW-011): when an attempt is created or corrected, or a lesson portion is corrected or removed, the server rebuilds the `SUGGESTED` portions of `DRAFT` assignments sourced from that lesson portion, in the same transaction. Confirmed assignments are never touched. When one is sourced from the changed portion, the op result carries `notices: ["CONFIRMED_HOMEWORK_UNCHANGED"]` (F08-AC14, F05-AC4).
6. **Revision** (FR-HW-012, DEC-B17) is online only: `POST /homework/assignments/:id/revise` (Owner/Admin; a Teacher gets 403). One transaction creates the new assignment already confirmed by the reviser, with `revision_of` set, marks the old one `SUPERSEDED`, and audits both.
7. **Database guard:** a trigger refuses any change to a confirmed assignment other than `CONFIRMED → SUPERSEDED`, and any change to the portions of a non-draft assignment.

## 3. Interpretations (flagged for confirmation)

1. **Homework portion status is derived, not stored.** FR-HW-002 lists "status". It is computed from the next-class attempts linked to the portion: not attempted, or the latest linked attempt's status. Reports derive and never store totals (AGENTS §5.13). A stored column could never change anyway, because confirmed rows are immutable.
2. **The next-class link is on the lesson portion** (`lesson_portions.homework_portion_id`, ARCHITECTURE §6.3). The attempt reaches its homework portion through that portion. Every attempt view also exposes the link (F08-AC16).
3. **Rebuild keeps the Teacher's work.** Recalculating a draft replaces only `SUGGESTED` portions. `TEACHER_EDITED` and `TEACHER_ADDED` portions are the Teacher's decisions and stay as they are. A suggested portion whose source is no longer eligible is removed from the draft; its row is kept.
4. **Extra portions are not carried forward.** Extra work beyond the assignment (FR-QTY-006) is not owed work.
5. **A Partial attempt with no completed amount** gives an unknown remaining, never "all of it" (missing data is not zero). It is suggested with no quantity and the "Review units" flag, like a unit mismatch (F08-AC4).
6. **Rejection is final for that draft.** A rejected draft stays `REJECTED` and is not rebuilt. The Teacher can still create a new draft from the same record.
7. **Carried over** (FR-HW-016): from the due date onward, each day that is not a scheduled class day, or on which the student was Absent or on Leave, moves the effective due date to the next class day. The first missed day gives the label reason. It is computed on read and never stored. Before every portion is attempted, a confirmed assignment is "outstanding", never "failed".
8. **Conflict resolution of a confirmation:** "Keep this device" confirms the current draft as the resolver (audited `HOMEWORK_CONFIRMED` and `SYNC_CONFLICT_RESOLVED`). "Keep server" leaves it a draft.
9. **Draft limits:** instructions up to 500 characters (the F05 remarks limit), up to 30 portions per assignment.

## 4. Not built in F08

- Weekly and monthly report totals (F09). F05-AC4 and F05-AC19 stay `test.fixme` because their E2E steps need the weekly report. F08-AC9's "not counted" is checked through the homework counts on `GET /homework/assignments`.
- Push or messages about homework (out of scope; FR-NOT-004).
- AI touching homework (out of scope).
