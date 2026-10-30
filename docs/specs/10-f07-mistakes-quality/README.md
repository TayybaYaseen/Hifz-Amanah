# F07 · Mistakes and quality

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Portion card performance area and overall performance label ([design.md §4.7, §5.4](../../design.md))
**Requirements:** FR-ATT-008/009/010, FR-RPT-004, FR-AI-004, FR-ATT-011/012
**Stories:** US-028 – US-032 · **Depends on:** F05
**Build order:** 10 of 17 (dependency level 4)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-028](us-028-record-mistake-categories.md) | US-028 — Record mistake categories | F07-AC1, F07-AC2, F07-AC3, F07-AC14, F07-AC15 |
| [SPEC-US-029](us-029-set-mistake-severity.md) | US-029 — Set mistake severity | F07-AC4 |
| [SPEC-US-030](us-030-flag-repeated-mistakes.md) | US-030 — Flag repeated mistakes | F07-AC5 |
| [SPEC-US-031](us-031-rate-quality-1-5.md) | US-031 — Rate quality 1–5 | F07-AC6, F07-AC7, F07-AC8, F07-AC9, F07-AC10, F07-AC11 |
| [SPEC-US-032](us-032-set-overall-performance-label.md) | US-032 — Set overall performance label | F07-AC12, F07-AC13 |

## Context

For each attempt, the Teacher records what went wrong and, if they choose, how well the student recited. These are three separate things:
- **Mistakes:** a category, a severity, and a repeated flag.
- **Quality score:** optional, from 1 to 5. Lower is better.
- **Overall performance label:** one per daily record.

None of them is derived from another.

**Approved Quality Rating Scale (SRS FR-ATT-009):**

| Score | English | Urdu | Roman Urdu |
|---|---|---|---|
| 1 | Excellent | ممتاز | Mumtaz |
| 2 | Good | اچھا | Achha |
| 3 | Average | اوسط | Ausat |
| 4 | Needs Improvement | مزید محنت کی ضرورت | Mazeed mehnat ki zaroorat |
| 5 | Weak | کمزور | Kamzor |

There is no code yet. This feature builds:
- the `attempt_mistakes` table
- `portion_attempts.quality` and `daily_records.overall_label` ([ARCHITECTURE.md §6.3](../../ARCHITECTURE.md))
- quality averaging in `packages/domain`

## Out of scope

- Automatic or AI-assigned quality scores.
- Any mapping between the overall label and the quality score.
- Recording where in the Ayat a mistake happened.
- Quality or mistakes in Bulk Entry.
- Splitting an imported Excel `MistakeCount` into categories (it stays uncategorized, F14).

## Edge cases

| Situation | What should happen |
|---|---|
| No mistakes are recorded | "Not recorded", not "0 mistakes", unless the Teacher explicitly marks "No mistakes" (see open question) |
| An imported attempt has `MistakeCount = 3` | Shown as "3 uncategorized mistakes", separate from the category counts |
| Every quality score in the period is missing | The average shows "Not recorded", with 0 ratings |
| The quality score is edited after a report was viewed | The report recalculates on next view (F09) |
| Quality labels are shown in the Urdu interface | "۱ · ممتاز", with digits and label in the correct direction |

## Open questions (resolved 2026-10-30)

- [x] Should the Teacher be able to record "No mistakes" explicitly, to tell it apart from "not recorded"? **Resolved:** Yes, it stores 0 (DEC-B27, FR-ATT-011).
- [x] Can a mistake have a free-text note, and is that note internal by default? **Resolved:** Yes, internal by default (DEC-B28, FR-ATT-012).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F07` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] The scale table and labels come from one shared source used by the app, PDFs, Excel exports, and charts.
- [ ] No code anywhere assumes "higher quality score is better".

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Quality average (NULL excluded), nearest-score labelling with .5 rounding up, score→label table in all three languages, mistake-count aggregation by category | `packages/domain/quality/*.test.ts`, `packages/domain/mistakes/*.test.ts` |
| **Integration** | Mistake/severity/repeated validation, quality range and NULL storage, no quality on Absent/Not Assigned/Pending, overall label stored separately | `apps/api/test/hifz/quality-*.test.ts` |
| **Component** | Quality selector order and labels per language, "Not assessed" default, mistake list add/remove, overall label captioned "Overall performance" | `apps/mobile/src/components/__tests__/PortionCard.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher records two mistakes and quality 2 on a portion and chooses an overall label → the report shows "2 · Good" and the mistake counts | `e2e/api/f07-quality.spec.ts`, `e2e/mobile/f07-quality/` |

**Traceability:** Each test name starts with its criterion, e.g. `F07-AC09 (US-031) …`. Every AC 1–15 has at least one test.

**Coverage:** ≥80% on new code.
