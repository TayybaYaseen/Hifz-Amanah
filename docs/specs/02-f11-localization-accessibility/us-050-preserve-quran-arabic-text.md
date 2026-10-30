# SPEC-US-050 · Preserve Quran Arabic text

| | |
|---|---|
| **Spec ID** | SPEC-US-050 |
| **User story** | US-050 |
| **Feature** | [F11 · Localization and accessibility](README.md) |
| **Epic** | EPIC 11 — Localization and Accessibility ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F11-localization-accessibility.md` on 2026-10-30 |

## User story

**US-050 — Preserve Quran Arabic text**

As a user, I want Quranic Arabic text and ranges preserved accurately across languages.

Spec wording (from F11):

- **US-050:** As a user, I want Quranic Arabic text and ranges preserved exactly in every language, so that the Quran is never altered.

**Feature context** (shared by every story in F11, copied from the feature spec):

> The app is used in three languages:
> - English, left to right
> - Urdu script, right to left
> - Roman Urdu, left to right
>
> Quranic Arabic must appear exactly as stored, in every language. Switching language changes labels only: never stored values, and never unsaved work.
>
> There is no code yet. This feature builds:
> - the mobile `i18n` layer and its locale files (`en`, `ur`, `ur-Latn`)
> - a `DirectionProvider` for in-place direction switching
> - a `QuranText` component
> - the shared `packages/i18n-keys` used by PDF, Excel, and push ([ARCHITECTURE.md §14](../../ARCHITECTURE.md))

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-I18N-006, FR-I18N-007
- **Non-functional:** NFR-COMP-002
- **SRS acceptance tests cited:** AC-I18N-06

Feature requirement set (from F11; additions of 2026-10-30 at the end): FR-I18N-001…008, FR-AUTH-004/005, NFR-MNT-003, NFR-UX-002/005, NFR-COMP-002, FR-I18N-009

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Quranic Arabic text and approved Surah/Ayat labels are never automatically translated, transliterated, or altered in any interface language.
2. Arabic text and numeric Surah/Ayat ranges stay readable in English, Urdu, and Roman Urdu layouts, including in reports, PDFs, and Excel exports.

### Detailed acceptance criteria

From the F11 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F11-AC8** — **(US-050) Given** a Surah name stored in Arabic, **when** it is shown in English, Urdu, or Roman Urdu, **then** the Arabic characters are identical to the stored value and are not translated or transliterated.
- **F11-AC9** — **(US-050) Given** the range "البقرة 2:255–260" inside an English sentence and inside an Urdu sentence, **when** it is rendered, **then** the numbers and the Arabic both read correctly in both directions (AC-I18N-06).
- **F11-AC10** — **(US-050) Given** Arabic text exported to PDF or Excel, **when** the file is opened, **then** the Arabic text is unchanged.

## Business rules

From SRS §9 (verbatim):

- **BR-15:** Quranic Arabic must remain intact.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

No F11 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

**Out of scope for the whole feature** (verbatim from F11):

- Languages other than these three.
- Auto-translating user-entered notes.
- Showing Quran text beyond Surah names and references.
- Converting between Urdu script and Roman Urdu automatically.

## Dependencies

- **Feature F11 depends on:** — (cross-cutting) (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F11:** [US-047](us-047-use-english-interface.md), [US-048](us-048-use-urdu-interface.md), [US-049](us-049-use-roman-urdu-interface.md)

## Related screens and UI

- **Feature flow** (from F11): Settings → Language ([design.md §4.16](../../design.md)); direction system ([§6](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-047 to US-050 | §4.16 Language; §6 | Switch language at any time | — | — | Switching keeps unsaved input; Arabic shaping intact |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): mobile `i18n`, `packages/i18n-keys`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-050` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f11-i18n.spec.ts](../../../e2e/api/f11-i18n.spec.ts) — F11-AC10 (US-050) Arabic text in PDF and Excel exports is unchanged

**Mobile (Maestro):**

- [e2e/mobile/f11-i18n/arabic-and-bidi.yaml](../../../e2e/mobile/f11-i18n/arabic-and-bidi.yaml) — F11 Arabic — Surah names unchanged; mixed ranges readable both directions

**Unit (Vitest):**

- [apps/mobile/src/i18n/direction.test.ts](../../../apps/mobile/src/i18n/direction.test.ts) — F11-AC9 (US-050) "البقرة 2:255–260" is isolated so it reads correctly in English and Urdu sentences (AC-I18N-06)
- [apps/mobile/src/i18n/direction.test.ts](../../../apps/mobile/src/i18n/direction.test.ts) — F11-AC8 (US-050) Arabic text passes through unchanged in every locale

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-050 → SPEC-US-050 (this file)
- **Detailed criteria:** F11-AC8, F11-AC9, F11-AC10
- **Requirements:** FR-I18N-006, FR-I18N-007, NFR-COMP-002
- **SRS acceptance tests:** AC-I18N-06
- **Business rules:** SRS §9 #15
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 11
- **Previous location:** `docs/specs/F11-localization-accessibility.md`
