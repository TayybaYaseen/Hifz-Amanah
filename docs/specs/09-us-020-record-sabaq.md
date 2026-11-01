# SPEC-US-020 · Record Sabaq

| | |
|---|---|
| **Spec ID** | SPEC-US-020 |
| **User story** | US-020 |
| **Feature** | [F05 · Daily Hifz entry](09-f05-daily-hifz-entry.md) |
| **Epic** | EPIC 5 — Daily Hifz Entry ([user-stories.md](../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F05-daily-hifz-entry.md` on 2026-10-30 |

## User story

**US-020 — Record Sabaq**

As a Teacher, I want to record Sabaq portions and their performance.

Spec wording (from F05):

- **US-020:** As a Teacher, I want to record Sabaq portions and their performance, so that new memorization is tracked.

**Feature context** (shared by every story in F05, copied from the feature spec):

> This is the teacher's main daily task. They record what a student was given and what the student actually recited, separately for:
> - **Sabaq** (new memorization)
> - **Sabqi** (recent revision)
> - **Manzil** (older revision)
>
> Sabqi and Manzil can each hold several Paras, and each Para is tracked on its own. A portion can be recited more than once, and every attempt is kept.
>
> There is no code yet. This feature builds the `hifz` module: the `daily_records`, `lesson_portions`, and `portion_attempts` tables ([ARCHITECTURE.md §6.3, §9.1](../ARCHITECTURE.md)). It relies on:
> - **F06** for quantities and Quran ranges
> - **F07** for mistakes and quality
> - **F08** for homework recalculation
> - **F12** for offline saving

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-SAB-001, FR-SAB-002, FR-SAB-003, FR-SAB-004, FR-SAB-008, FR-SAB-009, FR-SAB-010, FR-QTY-010
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** AC-QTY-07, AC-QTY-08
- **Decisions:** SRS §17 DEC-B60…B64 (2026-11-01): Sabaq is measured in lines over one Surah's Ayat range.

Feature requirement set (from F05; additions of 2026-10-30 and 2026-11-01 at the end): FR-DAY-001…009, FR-SAB-001…004, FR-SBQ-001…004, FR-MNZ-001…004, FR-ATT-001…007, FR-QTY-007, FR-DAY-011, FR-SAB-008…010, FR-QTY-010

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../user-stories.md).

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

### Detailed acceptance criteria

From the F05 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision reviews of 2026-10-30 and 2026-11-01 (SRS §17).

- **F05-AC10** — **(US-020) Given** a Sabaq portion for Al-Baqarah Ayat 1–10, **when** the Teacher saves it, **then** it stores the Surah, the starting and ending Ayat, Total Lines, Assigned and Completed Lines in the unit `LINES`, the Para derived from the range, the status, mistakes, quality, and remarks. *(Revised 2026-11-01, DEC-B60, DEC-B63.)*
- **F05-AC20** — **(US-020) Given** the Sabaq section, **when** the Teacher enters a quantity, **then** only lines are offered: Rubu, Half, Salasah, and Complete do not appear, and the API rejects a Sabaq portion in any unit other than `LINES`. The Sabqi and Manzil sections still offer all four Para presets. *(Added 2026-11-01, DEC-B60.)*
- **F05-AC21** — **(US-020) Given** a Teacher who chooses Al-Baqarah Ayat 1–10 for Sabaq, **when** the range is set, **then** Total Lines is pre-filled from the 15-line Mushaf layout, the Teacher can confirm or correct it, Assigned Lines defaults to Total Lines, and the Para is shown as derived, not entered. A range that crosses into the next Surah, or whose starting Ayat is after its ending Ayat, is refused with a field error. *(Added 2026-11-01, DEC-B61…B64.)*
- **F05-AC22** — **(US-020) Given** a Sabaq portion with 10 assigned lines, **when** the Teacher records 7 completed lines, **then** Remaining Lines shows 3. Completed 11, Assigned Lines above Total Lines, or a fractional line count is refused with a field error. Marked Not Remembered with no completed value, it stores 0 completed lines and 10 remaining. *(Added 2026-11-01, FR-SAB-003, FR-SAB-009.)*

## Business rules

From SRS §9 (verbatim):

- **BR-1:** Sabaq, Sabqi, and Manzil are independent sections.
- **BR-18:** Sabaq is measured in whole lines over one Surah's Ayat range. Para fractions apply to Sabqi and Manzil only (added 2026-11-01).

## Validation rules

From SRS FR-SAB-009 (server and app):

- Surah, starting Ayat, and ending Ayat are required; each Ayat is within the Surah's Ayat count (F06-AC6).
- Starting Ayat ≤ ending Ayat, within one Surah.
- Total, Assigned, and Completed Lines are whole numbers; Total and Assigned are positive.
- Assigned Lines ≤ Total Lines; Completed Lines ≤ Assigned Lines (extra work is a separate Extra portion, FR-QTY-006).
- The unit is `LINES` only. Rubu, Half, Salasah, and Complete are rejected for Sabaq (FR-QTY-010).
- `NOT_REMEMBERED` defaults Completed Lines to 0; `ABSENT`, `NOT_ASSIGNED`, and `PENDING` keep their meanings. Missing data is never read as completed lines (FR-QTY-008).

## Edge cases and error handling

From the [feature edge cases](09-f05-daily-hifz-entry.md#edge-cases):

| Situation | What should happen |
|---|---|
| A Sabaq lesson runs from the end of one Surah into the next | It is recorded as two Sabaq portions, one per Surah (DEC-B62, F05-AC21) |
| The Mushaf layout has no line data for the chosen Sabaq range | Total Lines is left empty for the Teacher to enter; nothing is guessed (FR-SAB-008) |
| A Sabaq portion arrives in a Para unit (old app build or old workbook) | Rejected for correction and never converted (FR-SAB-010) |
| The Admin later edits Quran metadata or the layout | The stored Total Lines and range are kept; ranges that become invalid are listed for review (FR-SAB-007) |

**Out of scope for the whole feature** (verbatim from F05):

- Recording Hifz in Bulk Entry (F04 is attendance-only).
- Audio recording or automatic grading of recitation.
- AI filling in or scoring portions.
- Extra work on the same portion. It is recorded as a separate Extra portion instead (FR-QTY-006, F06).
- Homework creation and confirmation (F08).

## Dependencies

- **Feature F05 depends on:** F03, F06, F07, F12 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** F06 (Quran metadata, 15-line layout, line counts), F08 (Sabaq carry-forward, F08-AC22), F14 (Sabaq rows in `DailyRecords`, F14-AC23)
- **Other stories referenced:** [US-021](09-us-021-record-sabqi-portions.md) (the Sabqi default uses the derived Sabaq Para)
- **Other stories in F05:** [US-018](09-us-018-create-individual-daily-report.md), [US-019](09-us-019-choose-daily-report-mode.md), [US-021](09-us-021-record-sabqi-portions.md), [US-022](09-us-022-record-manzil-portions.md), [US-023](09-us-023-record-repeated-attempts.md)

## Related screens and UI

- **Feature flow** (from F05): Daily Entry — individual student ([design.md §4.7](../design.md)); record detail and attempt history

[design.md §13](../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-020, US-021, US-022 | §4.7 Step 3; §5.4 Portion card; §5.5 Status chip | Add portion per section; headers such as "Sabqi · Portion 2"; choose status per portion. Sabaq: choose Surah and Ayat range → confirm the pre-filled Total Lines → Assigned/Completed lines (no Para presets) | — | Per-portion field errors; Sabaq range and line errors (§4.7) | Section and portion number in the header text; status chip with icon and text |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../ARCHITECTURE.md)): `hifz`, `sync`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).
- Sabaq fields on `lesson_portions`: `surah_start`, `ayah_start`, `ayah_end` (required, one Surah), `total_lines`, `line_count_edition`, the assigned quantity in `LINES`, and the derived `para_number` ([ARCHITECTURE.md §6.2, §6.3, §6.6](../ARCHITECTURE.md)).
- `quran-ref` provides `paraFor` and `countLines`. `packages/domain/quantity` provides the section rule (`rulesFor`, `validatePortion`), shared by the app and the server (ADR-014).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-020` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f05-daily-entry.spec.ts](../../e2e/api/f05-daily-entry.spec.ts) — F05-AC10 (US-020) a Sabaq portion stores its range, lines, derived Para, and every other field
- [e2e/api/f05-daily-entry.spec.ts](../../e2e/api/f05-daily-entry.spec.ts) — F05-AC20 (US-020) a Sabaq portion in a Para unit is rejected; Sabqi and Manzil still accept Para presets
- [e2e/api/f05-daily-entry.spec.ts](../../e2e/api/f05-daily-entry.spec.ts) — F05-AC21 (US-020) a Sabaq range crossing two Surahs or ending before it starts is rejected
- [e2e/api/f05-daily-entry.spec.ts](../../e2e/api/f05-daily-entry.spec.ts) — F05-AC22 (US-020) Sabaq remaining lines, line limits, and the Not Remembered default

**Mobile (Maestro):**

- [e2e/mobile/f05-daily-entry/sections-and-portions.yaml](../../e2e/mobile/f05-daily-entry/sections-and-portions.yaml) — F05 daily entry — Sabaq, two Sabqi, three Manzil with separate outcomes
- [e2e/mobile/f05-daily-entry/sabaq-lines.yaml](../../e2e/mobile/f05-daily-entry/sabaq-lines.yaml) — F05 daily entry — Sabaq by Surah/Ayat range and lines

**Unit (Vitest):**

- [packages/domain/quantity/quantity.test.ts](../../packages/domain/quantity/quantity.test.ts) — F05-AC20 (US-020) Sabaq accepts only LINES; Sabqi and Manzil accept the four Para presets
- [packages/domain/quantity/quantity.test.ts](../../packages/domain/quantity/quantity.test.ts) — F05-AC21 (US-020) a Sabaq range must stay in one Surah with start Ayat ≤ end Ayat, and Assigned Lines defaults to Total Lines
- [packages/domain/quantity/quantity.test.ts](../../packages/domain/quantity/quantity.test.ts) — F05-AC22 (US-020) Sabaq remaining lines is assigned − completed, never negative; completed ≤ assigned ≤ total

## Open decisions and blockers

None specific to this story. See the [feature open questions](09-f05-daily-hifz-entry.md#open-questions).

## Traceability

- **Story:** US-020 → SPEC-US-020 (this file)
- **Detailed criteria:** F05-AC10, F05-AC20, F05-AC21, F05-AC22
- **Requirements:** FR-SAB-001, FR-SAB-002, FR-SAB-003, FR-SAB-004, FR-SAB-008, FR-SAB-009, FR-SAB-010, FR-QTY-010
- **Decisions:** DEC-B60, DEC-B61, DEC-B62, DEC-B63, DEC-B64
- **SRS acceptance tests:** AC-QTY-07, AC-QTY-08
- **Business rules:** SRS §9 #1, #18
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 5
- **Previous location:** `docs/specs/F05-daily-hifz-entry.md`
