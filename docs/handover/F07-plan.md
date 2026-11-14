# F07 · Mistakes and quality: implementation plan

**Spec:** [10-f07-mistakes-quality.md](../specs/10-f07-mistakes-quality.md) · **Stories:** US-028…US-032 · **Criteria:** F07-AC1…AC15
**Requirements:** FR-ATT-008…012, FR-RPT-004, FR-AI-004, FR-QTY-008 · **Decisions:** DEC-B27, DEC-B28, DEC-B38, DEC-B86 (new)
**Branch:** `feature/f07-mistakes-quality` (from `feature/f05-daily-hifz-entry`; the PR targets `main` after F05 merges)

## 1. What F05 already built

F05 already stores and edits: mistake category, severity, and the repeated flag (`attempt_mistakes`), quality 1–5 or NULL, and explicit "No mistakes" (`portion_attempts.no_mistakes`). It also has the portion-card UI for all of them. F07 adds:

| Piece | Where |
|---|---|
| Approved quality scale with labels in en / ur / ur-Latn, average (NULL excluded, nearest score, .5 rounds up), trend direction (lower is better) | `packages/domain/quality` |
| Mistake rules: note length, note visibility, category counts, the "not recorded" vs "No mistakes" count | `packages/domain/mistakes` |
| Overall performance label (`EXCELLENT`, `GOOD`, `AVERAGE`, `NEEDS_IMPROVEMENT`), one per daily record, never derived from or to quality | `daily_records.overall_label`, `daily_record` sync field `overallLabel` |
| Mistake note (≤ 200 characters, DEC-B86) with visibility `INTERNAL` (default) / `SHARED` (FR-ATT-012, DEC-B28) | `attempt_mistakes.note`, `note_visibility`; inside the attempt's `mistakes` list |
| Staff performance summary for a student and period: mistake counts per category, quality average | `GET /hifz/performance-summary` |
| Student/Parent projection of a mistake: the note only when `SHARED` | `projectFor(STUDENT/PARENT, 'attempt_mistake', …)` |
| App: note and visibility per mistake, "Overall performance" selector, quality labels taken from the domain scale | `apps/mobile/src/features/daily-entry` |

## 2. Decisions taken with the user (2026-11-12)

1. **Report surface:** F07 adds a minimal staff summary API (`GET /hifz/performance-summary?studentId&from&to`) for F07-AC3, AC8, and AC9. F09 builds the full weekly/monthly report on the same domain functions. F07 adds no report screen to the app.
2. **Mistake note length:** 200 characters (**DEC-B86**).
3. **Features not built yet** (AI, Excel import, homework, Student/Parent portal): F07-AC11 and F07-AC15 are tested on the paths that exist today (sync, the `projectFor` projection, every server write path). F08, F10, F14, and the AI feature each add their own AC11/AC15 regression test.

## 3. Interpretations (flagged for confirmation)

- **Digits:** the F07 edge case shows "۱ · ممتاز", but **DEC-B38 / FR-I18N-009** (SRS §17, higher precedence) requires Western digits in every language. F07 shows "1 · ممتاز". The spec example and design.md §4.7 should be corrected.
- **Period counts use every attempt:** each attempt's mistakes and quality rating are separate recorded events. The summary counts every attempt in the period. The latest-attempt rule (AGENTS §5.9) applies to current progress (status, completed, remaining), which F07 does not report.
- **Overall-label translations:** the label words match the quality scale words, so the app reuses the approved translations (ممتاز / اچھا / اوسط / مزید محنت کی ضرورت; Mumtaz / Achha / Ausat / Mazeed mehnat ki zaroorat). The control is captioned "Overall performance" (design.md §4.7).
- **Audit:** mistake notes are free text. The attempt's `mistakes` field is now audited by name only, never by value (ARCHITECTURE §15).
- **Uncategorized count** (`MistakeCount` from Excel): the domain supports it and shows it apart from the category counts. The column arrives with F14.

## 4. Data

Migration `0013_mistakes_quality.sql`:
- `daily_records.overall_label text NULL CHECK (IN EXCELLENT|GOOD|AVERAGE|NEEDS_IMPROVEMENT)`
- `attempt_mistakes.note text NULL CHECK (length 1–200)` and `note_visibility text NOT NULL DEFAULT 'INTERNAL' CHECK (IN INTERNAL|SHARED)`
- Grants: `UPDATE (overall_label)` on `daily_records`. Mistakes are still corrected by detaching old rows and inserting new ones.

Device: workspace migration adds `daily_records.overall_label`. Mistakes are already JSON on the attempt row, so notes need no column.

## 5. Sync

- `daily_record` CREATE accepts `overallLabel` (optional, default null). UPDATE accepts `sessionLabel` and/or `overallLabel`. The report-mode check runs only when `sessionLabel` changes. `overallLabel` is a meaningful field of its own (no merge with quality).
- `portion_attempt` mistakes: `{category, severity, repeated, note?, noteVisibility?}`. `note` defaults to null and `noteVisibility` to `INTERNAL`.

## 6. Tests

- Unit: `packages/domain/quality/quality.test.ts`, `packages/domain/mistakes/mistakes.test.ts`, and F07-AC14 in `packages/domain/reports/build-report.test.ts`.
- Integration: `apps/api/test/hifz/quality-mistakes.test.ts` (validation, NULL storage, rejected quality on Absent/Not Assigned/Pending, overall label kept apart, note privacy, summary).
- API E2E: `e2e/api/f07-quality.spec.ts`. Mobile: the Maestro flows in `e2e/mobile/f07-quality/` (they need an emulator).
