# F06 · Quran portions and metadata

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Settings → Quran metadata (design gap); Quantity field and range fields in Daily Entry ([design.md §4.7, §5.3](../../design.md))
**Requirements:** FR-SAB-001/002/005/006, FR-QTY-001…006, FR-I18N-006, NFR-MNT-003, FR-SAB-007, FR-QTY-009
**Stories:** US-024 – US-027 · **Depends on:** F02
**Build order:** 7 of 17 (dependency level 2)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-024](us-024-maintain-quran-metadata.md) | US-024 — Maintain Quran metadata | F06-AC1, F06-AC2, F06-AC3, F06-AC4, F06-AC18, F06-AC19 |
| [SPEC-US-025](us-025-select-para-and-ayat-range.md) | US-025 — Select Para and Ayat range | F06-AC5, F06-AC6, F06-AC7 |
| [SPEC-US-026](us-026-use-15-line-mushaf.md) | US-026 — Use 15-line Mushaf | F06-AC8, F06-AC9, F06-AC17 |
| [SPEC-US-027](us-027-select-portion-quantities.md) | US-027 — Select portion quantities | F06-AC10, F06-AC11, F06-AC12, F06-AC13, F06-AC14, F06-AC15, F06-AC16 |

## Context

Every portion names a place in the Quran and an amount. The Madrasa Admin maintains the reference data:
- Surahs, with Ayat counts
- Para boundaries

The MVP supports the standard 15-line Mushaf only.

Amounts must be exact and always carry a unit. A Para fraction is never added to lines.

There is no code yet. This feature builds:
- the `quran-ref` module: the `quran_surahs`, `quran_paras`, and `mushaf_layout` tables
- the quantity type in `packages/domain`, stored as `(unit, numerator, denominator)` ([ARCHITECTURE.md §6.2](../../ARCHITECTURE.md))

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

## Open questions (resolved 2026-10-30)

- [x] Initial data source and governance for Quran metadata (SRS §13 #3). Can the app ship a reviewed seed? **Resolved:** Yes, a reviewed seed plus audited Admin edits (DEC-B31, FR-SAB-007).
- [x] How are ranges reviewed when the Admin changes metadata that existing records use? **Resolved:** Records keep their ranges; invalid ones are listed for Admin review (DEC-B32, FR-SAB-007).
- [x] D6: extra work beyond the assigned quantity. **Resolved:** A separate Extra portion (DEC-B23, FR-QTY-006).
- [x] Do `PAGES` and `AYAT` quantities need fraction support, or whole numbers only? **Resolved:** Whole numbers only, also for Lines (DEC-B26, FR-QTY-009).

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

**Traceability:** Each test name starts with its criterion, e.g. `F06-AC12 (US-027) …`. Every AC 1–19 has at least one test.

**Coverage:** ≥80% on new code (100% branch coverage on the quantity type).
