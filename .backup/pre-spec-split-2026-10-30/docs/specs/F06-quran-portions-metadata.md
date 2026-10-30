# F06 · Quran portions and metadata

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Settings → Quran metadata (design gap); Quantity field and range fields in Daily Entry ([design.md §4.7, §5.3](../../design.md))
**Stories:** US-024 – US-027 · **Requirements:** FR-SAB-001/002/005/006, FR-QTY-001…006, FR-I18N-006, NFR-MNT-003

## Context

Every portion names a place in the Quran and an amount. The Madrasa Admin maintains the reference data:
- Surahs, with Ayat counts
- Para boundaries

The MVP supports the standard 15-line Mushaf only.

Amounts must be exact and always carry a unit. A Para fraction is never added to lines.

There is no code yet. This feature builds:
- the `quran-ref` module: the `quran_surahs`, `quran_paras`, and `mushaf_layout` tables
- the quantity type in `packages/domain`, stored as `(unit, numerator, denominator)` ([ARCHITECTURE.md §6.2](../../ARCHITECTURE.md))

## User story

- **US-024:** As a Madrasa Admin, I want to add and edit Surah, Ayat, and Para reference data, so that teachers pick from correct references.
- **US-025:** As a Teacher, I want to specify a Para and an optional Surah/Ayat start–end range, so that the exact portion is recorded.
- **US-026:** As a Teacher, I want line quantities to follow the standard 15-line Mushaf, so that line counts mean the same thing for everyone.
- **US-027:** As a Teacher, I want to choose Rubu, Half, Salasah, or Complete quantities, so that common Para fractions take one tap.

## Acceptance criteria

1. **(US-024) Given** a Madrasa Admin, **when** they add or edit a Surah (number, Arabic name, Ayat count) or a Para boundary, **then** it is saved for their madrasa and the change is audited.
2. **(US-024) Given** a Teacher, **when** they try to edit Quran metadata, **then** there is no edit control, and the API returns forbidden.
3. **(US-024) Given** a Surah's Arabic name, **when** it is saved and shown in English, Urdu, or Roman Urdu, **then** the Arabic text is exactly what was entered and is never translated or transliterated.
4. **(US-024) Given** a Para boundary whose end comes before its start, **when** the Admin saves, **then** it is rejected with a field error.
5. **(US-025) Given** a Para between 1 and 30, **when** the Teacher saves a portion, **then** it is accepted. Para 0 or Para 31 is rejected.
6. **(US-025) Given** a Surah with 7 Ayat, **when** the Teacher enters Ayat 3 to 9 for it, **then** the field shows an error that names the maximum Ayat.
7. **(US-025) Given** a range whose end Ayat is before its start Ayat in the same Surah, **when** the Teacher saves, **then** the range field shows an error.
8. **(US-026) Given** a portion measured in lines, **when** it is saved, **then** the unit is `LINES` with a whole number, counted on the standard 15-line Mushaf.
9. **(US-026) Given** 10 lines assigned and 6 lines completed, **when** the remaining quantity is calculated, **then** it is 4 lines (AC-QTY-02).
10. **(US-027) Given** a Teacher choosing Salasah, **when** the portion is saved, **then** it is stored as 3/4 Para and displayed as "Salasah (3/4 Para)" (AC-QTY-01).
11. **(US-027) Given** Rubu, Half, or Complete, **when** saved, **then** each is stored exactly as 1/4, 1/2, or 1 Para.
12. **(US-027) Given** 3/4 Para assigned and 1/2 Para completed for the same portion, **when** the remaining quantity is calculated, **then** it is 1/4 Para (AC-QTY-03).
13. **(US-027) Given** one portion in lines and another in Para fractions, **when** a total is requested, **then** they are shown as two separate totals and never added together (AC-QTY-04).
14. **(US-027) Given** a completed quantity larger than the assigned quantity, **when** the Teacher saves, **then** the completed field shows an error (AC-QTY-05).
15. **(US-027) Given** a Teacher who changes the unit after typing a value, **when** the unit changes, **then** the app asks whether to keep or clear the value and never silently reinterprets the number.

## Out of scope

- Mushaf editions other than the standard 15-line edition.
- Any conversion between lines, Ayat, pages, and Para fractions.
- Importing metadata from an external provider.
- Showing Quran text or audio.

## Edge cases

| Situation | What should happen |
|---|---|
| The Admin edits a Surah's Ayat count after records already use it | Existing records keep their stored values; ranges that become invalid are flagged for review, never changed automatically |
| A range spans two Surahs | Allowed when the start and end Surah/Ayat are both valid and in order |
| The Admin has not yet entered any metadata | Daily Entry still accepts a Para number; Surah/Ayat pickers show "No Quran reference data yet — ask your Admin" |
| A quantity is entered with decimals (0.75) | Not accepted. Para amounts are chosen from the fraction presets |
| Mixed Arabic and digit ranges in the RTL Urdu interface | Use bidi isolation so "البقرة 2:255–260" reads correctly |

## Open questions

- [ ] Initial data source and governance for Quran metadata (SRS §13 #3). Can the app ship a reviewed seed?
- [ ] How are ranges reviewed when the Admin changes metadata that existing records use?
- [ ] D6: extra work beyond the assigned quantity.
- [ ] Do `PAGES` and `AYAT` quantities need fraction support, or whole numbers only?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F06` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] Quantity math in `packages/domain` uses no floating point; property-based tests cover add, subtract, and compare within one unit.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Quantity type: presets, remaining, same-unit sums, cross-unit refusal, completed > assigned; range validation (property-based) | `packages/domain/quantity/*.test.ts`, `packages/domain/quran-ref/*.test.ts` |
| **Integration** | Metadata CRUD by role with audit, Arabic stored byte-exact, server-side range validation against org metadata | `apps/api/test/quran-ref/*.test.ts` |
| **Component** | Quantity field (unit always visible, unit-change prompt), Surah/Ayat pickers, empty-metadata state, RTL mixed ranges | `apps/mobile/src/components/__tests__/QuantityField.test.tsx`, `apps/mobile/src/features/daily-entry/__tests__/range*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin adds a Surah → Teacher records a Salasah portion within it → remaining shows 1/4 Para after a Half is completed | `e2e/api/f06-quran-portions.spec.ts`, `e2e/mobile/f06-quran-portions/` |

**Traceability:** Each test name starts with its criterion, e.g. `F06-AC12 (US-027) …`. Every AC 1–15 has at least one test.

**Coverage:** ≥80% on new code (100% branch coverage on the quantity type).
