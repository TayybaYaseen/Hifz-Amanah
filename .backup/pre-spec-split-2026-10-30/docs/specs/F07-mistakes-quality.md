# F07 · Mistakes and quality

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Portion card performance area and overall performance label ([design.md §4.7, §5.4](../../design.md))
**Stories:** US-028 – US-032 · **Requirements:** FR-ATT-008/009/010, FR-RPT-004, FR-AI-004

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

## User story

- **US-028:** As a Teacher, I want to record Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, and Waqf/Ibtida mistakes, so that I can see what kind of help a student needs.
- **US-029:** As a Teacher, I want to mark a mistake Minor or Major, so that serious mistakes stand out.
- **US-030:** As a Teacher, I want to flag a mistake as repeated, separately from its severity, so that recurring problems are visible.
- **US-031:** As a Teacher, I want to optionally rate a portion from 1 to 5, so that recitation quality can be tracked over time.
- **US-032:** As a Teacher, I want to select Excellent, Good, Average, or Needs Improvement for the day, so that I can give one overall judgement.

## Acceptance criteria

1. **(US-028) Given** a portion attempt, **when** the Teacher adds two mistakes (Tajweed and Lafzi), **then** both are stored on that attempt, each with exactly one category.
2. **(US-028) Given** a mistake saved in the Urdu interface, **when** it is viewed in English, **then** the category shows its English label, and the stored value is the same canonical value (`TAJWEED`).
3. **(US-028) Given** mistakes recorded during a week, **when** the weekly report is built, **then** it shows a count per category for that week.
4. **(US-029) Given** a mistake, **when** the Teacher sets Major, **then** it is stored and shown as Major. The API rejects any severity other than Minor or Major.
5. **(US-030) Given** a mistake, **when** the Teacher turns on Repeated, **then** its severity is unchanged, and Repeated is stored as its own flag.
6. **(US-031) Given** the quality selector, **when** it opens, **then** it lists "1 · Excellent", "2 · Good", "3 · Average", "4 · Needs Improvement", and "5 · Weak" in that order, in the active language, with "Not assessed" selected.
7. **(US-031) Given** a portion saved without a quality score, **when** it is shown, **then** it reads "Not recorded" (never 0), and the stored value is NULL.
8. **(US-031) Given** quality scores 1, 2, 2 and one missing, **when** the average is calculated, **then** it is 1.7 from 3 ratings, shown as "1.7 · Good (3 ratings)".
9. **(US-031) Given** an average of exactly 1.5, **when** it is labelled, **then** the label is "Good" (a halfway value rounds up to the higher number).
10. **(US-031) Given** an attempt with status Absent, Not Assigned, or Pending, **when** the Teacher views it, **then** no quality score can be entered, and none is counted.
11. **(US-031) Given** any AI feature or automated process, **when** it runs, **then** it never sets or changes a quality score; only the Teacher's input writes it.
12. **(US-032) Given** a daily record, **when** the Teacher picks an overall performance label, **then** it is stored once for the record, separately from every portion's quality score.
13. **(US-032) Given** portions with quality scores, **when** the daily record is saved without an overall label, **then** the label stays empty; it is never filled in from the scores, and the scores are never filled in from the label.

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

## Open questions

- [ ] Should the Teacher be able to record "No mistakes" explicitly, to tell it apart from "not recorded"?
- [ ] Can a mistake have a free-text note, and is that note internal by default?

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

**Traceability:** Each test name starts with its criterion, e.g. `F07-AC09 (US-031) …`. Every AC 1–13 has at least one test.

**Coverage:** ≥80% on new code.
