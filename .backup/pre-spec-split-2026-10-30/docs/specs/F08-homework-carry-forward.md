# F08 · Homework and carry forward

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Homework — suggestions and confirmed assignments ([design.md §4.9, §5.7](../../design.md))
**Stories:** US-033 – US-038 · **Requirements:** FR-HW-001…015, FR-QTY-005, FR-RPT-007, NFR-PERF-003, NFR-REL-003

## Context

After a lesson, the teacher decides what the student should prepare next. Any unfinished work can be suggested automatically, but **only the teacher's explicit confirmation makes homework real**. A confirmed assignment is never changed behind the teacher's back.

There is no code yet. This feature builds:
- the `homework` module: the `homework_assignments` and `homework_portions` tables
- the pure `suggest()` function in `packages/domain/homework` ([ARCHITECTURE.md §9.2](../../ARCHITECTURE.md))

It reads attempts from F05 and quantities from F06.

## User story

- **US-033:** As a Teacher, I want to assign Sabaq, Sabqi, and Manzil homework, so that the student knows exactly what to prepare.
- **US-034:** As a Teacher, I want remaining amounts calculated automatically for incomplete work, so that I don't work them out by hand.
- **US-035:** As a Teacher, I want the app to suggest eligible unfinished portions for the next assignment, so that nothing is forgotten.
- **US-036:** As a Teacher, I want to edit, remove, add, or reject suggested portions before confirming, so that the homework is what I decide.
- **US-037:** As a Teacher, I want to confirm the next assignment explicitly, so that it is clear when homework becomes final.
- **US-038:** As a Teacher/Admin, I want earlier assignments and their source attempts kept, so that we can trace how work was carried forward.

## Acceptance criteria

1. **(US-033) Given** a Teacher creating homework, **when** they add one Sabaq portion and two Sabqi Paras with different quantities, **then** each portion is stored with its section, Para, optional range, quantity and unit, and optional instructions.
2. **(US-033) Given** a homework assignment, **when** it is saved, **then** it stores the assigned date, the due date, the status, the creator, and any general instructions.
3. **(US-034) Given** 3/4 Para assigned and 1/2 Para completed for the same portion, **when** the remaining quantity is calculated, **then** it is 1/4 Para.
4. **(US-034) Given** the assigned and completed quantities are in different units, **when** remaining is calculated, **then** no remaining quantity is shown, and the portion is flagged for the Teacher to review.
5. **(US-035) Given** a portion whose latest attempt is Partial or Not Remembered with remaining > 0, **when** suggestions are built, **then** it is suggested with its remaining quantity and linked to its source attempt (AC-HW-01, AC-HW-08).
6. **(US-035) Given** a portion whose latest attempt is Absent, Not Assigned, Pending, or Completed, **when** suggestions are built, **then** it is not suggested (AC-HW-09).
7. **(US-035) Given** a suggestion, **when** it is displayed, **then** it is labelled "Suggestion — not confirmed" and never styled like confirmed homework.
8. **(US-036) Given** a draft suggestion, **when** the Teacher edits a quantity, removes a portion, adds a new portion, or changes the due date, **then** the draft keeps those changes, and each portion records whether it was suggested, edited, or added by the Teacher (AC-HW-02).
9. **(US-036) Given** a draft suggestion, **when** the Teacher rejects it, **then** its status becomes Rejected, and it is not counted as homework.
10. **(US-037) Given** a draft, **when** the Teacher presses Confirm and accepts the summary, **then** the status becomes Confirmed with the confirming Teacher and the time, and the confirmation is audited (AC-HW-04).
11. **(US-037) Given** no Teacher action, **when** time passes or the next class arrives, **then** the draft is never confirmed automatically (AC-HW-03).
12. **(US-037) Given** a confirmation where one portion fails to save, **when** the transaction ends, **then** nothing is confirmed, and no partial assignment is left behind.
13. **(US-038) Given** a confirmed assignment, **when** the Teacher creates a new assignment for the next class, **then** the earlier assignment is kept unchanged (AC-HW-05).
14. **(US-038) Given** a source attempt is corrected, **when** recalculation runs, **then** draft suggestions are rebuilt, and confirmed assignments are unchanged (AC-HW-06, AC-HW-07). The Teacher sees "Confirmed homework was not changed — Revise?".
15. **(US-038) Given** a Teacher who chooses Revise on confirmed homework, **when** they confirm the revision, **then** a new assignment is created with a link to the old one, the old one becomes Superseded, and both are audited.
16. **(US-038) Given** the next class, **when** the Teacher records an attempt on a homework portion, **then** the attempt links to that homework portion (FR-HW-015).

## Out of scope

- AI creating, editing, or confirming homework.
- Converting between units to compute remaining work.
- Confirming homework on the Student's or Parent's behalf.
- Sending homework to students by push or messages (F16 event catalogue is open).

## Edge cases

| Situation | What should happen |
|---|---|
| The Teacher confirms homework while offline | Open question (design.md §11 D2). Until decided, the Confirm button is disabled offline with the message "Confirm needs a connection" |
| Two attempts on the same portion | Only the latest attempt decides eligibility; the assigned quantity is not counted twice |
| The suggestion is empty because everything was completed | "Nothing to carry forward"; the Teacher can still add portions |
| The source student is deactivated | Confirmed homework keeps its links for history; drafts are rebuilt |
| The due date is before the assigned date | The field shows an error |

## Open questions

- [ ] D2: can homework be confirmed offline? If yes, how are server-side changes to the source detected?
- [ ] Are both a Teacher and an Admin allowed to revise confirmed homework?
- [ ] Should the due date default to the next scheduled class day (F04)?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F08` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] SRS acceptance tests AC-HW-01…09 pass.
- [ ] `suggest()` is a pure function with unit tests for every status.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | `suggest()` eligibility for all six statuses, latest-attempt rule, remaining calculation, source links, unit mismatch flag | `packages/domain/homework/*.test.ts` |
| **Integration** | Draft → edit → confirm transaction (all-or-nothing), reject, revise/supersede, recalculation leaving confirmed homework untouched, audit | `apps/api/test/homework/*.test.ts` |
| **Component** | Suggested vs Confirmed tabs, draft label/styling, edit/add/remove portions, confirm summary, offline-disabled Confirm | `apps/mobile/src/features/homework/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: SRS §10.8 end-to-end scenario, steps 2–8 (record → suggestion → confirm → next-class attempt → correction leaves confirmed homework unchanged) | `e2e/api/f08-homework.spec.ts`, `e2e/mobile/f08-homework/` |

**Traceability:** Each test name starts with its criterion, e.g. `F08-AC14 (US-038) …`. Every AC 1–16 has at least one test.

**Coverage:** ≥80% on new code (100% branch coverage on `suggest()`).
