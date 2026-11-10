# F05 · Daily Hifz entry

**Status:** Approved
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Daily Entry — individual student ([design.md §4.7](../design.md)); record detail and attempt history
**Requirements:** FR-DAY-001…009, FR-SAB-001…004, FR-SAB-008…010, FR-QTY-010, FR-SBQ-001…004, FR-MNZ-001…004, FR-ATT-001…007, FR-QTY-007, FR-DAY-011
**Stories:** US-018 – US-023 · **Depends on:** F03, F06, F07, F12
**Build order:** 9 of 17 (dependency level 3)

Its story specs follow this page in `docs/specs/` and share the `09-` prefix, one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-018](09-us-018-create-individual-daily-report.md) | US-018 — Create individual daily report | F05-AC1, F05-AC2, F05-AC3, F05-AC4, F05-AC5, F05-AC17, F05-AC18 |
| [SPEC-US-019](09-us-019-choose-daily-report-mode.md) | US-019 — Choose daily report mode | F05-AC6, F05-AC7, F05-AC8, F05-AC9 |
| [SPEC-US-020](09-us-020-record-sabaq.md) | US-020 — Record Sabaq | F05-AC10, F05-AC20, F05-AC21, F05-AC22 |
| [SPEC-US-021](09-us-021-record-sabqi-portions.md) | US-021 — Record Sabqi portions | F05-AC11, F05-AC12 |
| [SPEC-US-022](09-us-022-record-manzil-portions.md) | US-022 — Record Manzil portions | F05-AC13, F05-AC14 |
| [SPEC-US-023](09-us-023-record-repeated-attempts.md) | US-023 — Record repeated attempts | F05-AC15, F05-AC16, F05-AC19 |

## Context

This is the teacher's main daily task. They record what a student was given and what the student actually recited, separately for:
- **Sabaq** (new memorization): one Surah's Ayat range, measured in lines (revised 2026-11-01, SRS DEC-B60…B64)
- **Sabqi** (recent revision)
- **Manzil** (older revision)

Sabqi and Manzil can each hold several Paras, and each Para is tracked on its own, with the Para presets (Rubu, Half, Salasah, Complete). Sabaq never offers those presets. A portion can be recited more than once, and every attempt is kept.

There is no code yet. This feature builds the `hifz` module: the `daily_records`, `lesson_portions`, and `portion_attempts` tables ([ARCHITECTURE.md §6.3, §9.1](../ARCHITECTURE.md)). It relies on:
- **F06** for quantities and Quran ranges
- **F07** for mistakes and quality
- **F08** for homework recalculation
- **F12** for offline saving

## Out of scope

- Recording Hifz in Bulk Entry (F04 is attendance-only).
- Audio recording or automatic grading of recitation.
- AI filling in or scoring portions.
- Extra work on the same portion. It is recorded as a separate Extra portion instead (FR-QTY-006, F06).
- Homework creation and confirmation (F08).

## Edge cases

| Situation | What should happen |
|---|---|
| The Teacher picks a future date | Refused; only today or earlier is accepted (DEC-B24, F05-AC17) |
| The Teacher switches app language mid-entry | Unsaved values stay; only labels change |
| The student is deactivated while the Teacher has a draft open on an offline device | The draft can still be saved locally; the sync result follows F12 (action required if the server refuses) |
| Another device edited the same portion | A sync conflict is created; nothing is overwritten silently (F12, US-054) |
| The Teacher removes a portion that already has attempts | It needs a confirmation, and the action is audited. Attempt history is kept for audit |
| A portion's status is Not Assigned or Pending | No quality value is entered or counted |
| A Sabaq lesson runs from the end of one Surah into the next | It is recorded as two Sabaq portions, one per Surah (DEC-B62, F05-AC21) |
| The Mushaf layout has no line data for the chosen Sabaq range | Total Lines is left empty for the Teacher to enter; nothing is guessed (FR-SAB-008) |
| A Sabaq portion arrives in a Para unit (old app build or old workbook) | Rejected for correction and never converted (FR-SAB-010) |

## Open questions (resolved 2026-10-30)

- [x] May records be created for future dates? **Resolved:** No (DEC-B24, FR-DAY-001).
- [x] Is there an edit window after which records lock? **Resolved:** No lock; every edit audited (DEC-B25, FR-DAY-009).
- [x] D6: extra work beyond the assigned quantity. **Resolved:** A separate Extra portion (DEC-B23, FR-QTY-006).
- [x] Can portions be added for a student marked Absent (late arrival)? **Resolved:** No; change the student to Late first (DEC-B22, FR-DAY-011).
- [x] How is Sabaq measured? **Resolved 2026-11-01:** lines over one Surah's Ayat range; Total Lines pre-filled and confirmed; Para derived; no Para presets (DEC-B60…B64).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F05` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] SRS acceptance tests AC-QTY-06…08, AC-ATT-01…03, and AC-ATT-05 pass.
- [ ] The UI shows "Synced" only after server acknowledgement.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Sabaq section rule (lines only, single-Surah range, Total/Assigned/Completed Lines), status semantics (Not Remembered defaults, no quality on Absent/Not Assigned/Pending), latest-attempt selection, report-mode uniqueness rules | `packages/domain/hifz/*.test.ts` |
| **Integration** | Record create/edit with portions and attempts, single vs multi-session uniqueness, mode switch blocked by conflicts, audit, recalculation trigger | `apps/api/test/hifz/*.test.ts` |
| **Component** | Three section cards, add multiple Sabqi/Manzil portions, per-portion errors, value kept on language switch, offline "Saved on this device" | `apps/mobile/src/features/daily-entry/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher records Sabaq + 2 Sabqi + 3 Manzil with different outcomes → adds a second attempt → views history | `e2e/api/f05-daily-entry.spec.ts`, `e2e/mobile/f05-daily-entry/` |

**Traceability:** Each test name starts with its criterion, e.g. `F05-AC13 (US-022) …`. Every AC 1–22 has at least one test.

**Coverage:** ≥80% on new code.
