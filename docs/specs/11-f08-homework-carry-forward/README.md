# F08 · Homework and carry forward

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Homework — suggestions and confirmed assignments ([design.md §4.9, §5.7](../../design.md))
**Requirements:** FR-HW-001…015, FR-QTY-005, FR-RPT-007, NFR-PERF-003, NFR-REL-003, FR-HW-016/017
**Stories:** US-033 – US-038 · **Depends on:** F05, F06
**Build order:** 11 of 17 (dependency level 4)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-033](us-033-create-structured-homework.md) | US-033 — Create structured homework | F08-AC1, F08-AC2 |
| [SPEC-US-034](us-034-calculate-remaining-work.md) | US-034 — Calculate remaining work | F08-AC3, F08-AC4 |
| [SPEC-US-035](us-035-suggest-carry-forward.md) | US-035 — Suggest carry-forward | F08-AC5, F08-AC6, F08-AC7 |
| [SPEC-US-036](us-036-review-homework-suggestion.md) | US-036 — Review homework suggestion | F08-AC8, F08-AC9, F08-AC18 |
| [SPEC-US-037](us-037-confirm-next-assignment.md) | US-037 — Confirm next assignment | F08-AC10, F08-AC11, F08-AC12, F08-AC20, F08-AC21 |
| [SPEC-US-038](us-038-preserve-homework-history.md) | US-038 — Preserve homework history | F08-AC13, F08-AC14, F08-AC15, F08-AC16, F08-AC17, F08-AC19 |

## Context

After a lesson, the teacher decides what the student should prepare next. Any unfinished work can be suggested automatically, but **only the teacher's explicit confirmation makes homework real**. A confirmed assignment is never changed behind the teacher's back.

There is no code yet. This feature builds:
- the `homework` module: the `homework_assignments` and `homework_portions` tables
- the pure `suggest()` function in `packages/domain/homework` ([ARCHITECTURE.md §9.2](../../ARCHITECTURE.md))

It reads attempts from F05 and quantities from F06.

## Out of scope

- AI creating, editing, or confirming homework.
- Converting between units to compute remaining work.
- Confirming homework on the Student's or Parent's behalf.
- Sending homework to students by push or messages (not in the approved event catalogue, FR-NOT-004).

## Edge cases

| Situation | What should happen |
|---|---|
| The Teacher confirms homework while offline | Allowed: shows "Confirmed on device — waiting to sync"; the server re-checks the source on sync, and a changed source becomes a conflict (DEC-B29, F08-AC20, F08-AC21) |
| Two attempts on the same portion | Only the latest attempt decides eligibility; the assigned quantity is not counted twice |
| The suggestion is empty because everything was completed | "Nothing to carry forward"; the Teacher can still add portions |
| The source student is deactivated | Confirmed homework keeps its links for history; drafts are rebuilt |
| The due date is before the assigned date | The field shows an error |

## Open questions (resolved 2026-10-30)

- [x] D2: can homework be confirmed offline? If yes, how are server-side changes to the source detected? **Resolved:** Yes; the server re-checks the source on sync and raises a conflict if it changed (DEC-B29, FR-HW-017).
- [x] Are both a Teacher and an Admin allowed to revise confirmed homework? **Resolved:** Owner/Admin only (DEC-B17, FR-HW-012).
- [x] Should the due date default to the next scheduled class day (F04)? **Resolved:** Yes, skipping Sundays and holidays; missed homework carries over (DEC-B30, FR-HW-004, FR-HW-016).

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

**Traceability:** Each test name starts with its criterion, e.g. `F08-AC14 (US-038) …`. Every AC 1–21 has at least one test.

**Coverage:** ≥80% on new code (100% branch coverage on `suggest()`).
