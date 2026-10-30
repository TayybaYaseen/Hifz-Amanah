# SPEC-US-048 · Use Urdu interface

| | |
|---|---|
| **Spec ID** | SPEC-US-048 |
| **User story** | US-048 |
| **Feature** | [F11 · Localization and accessibility](README.md) |
| **Epic** | EPIC 11 — Localization and Accessibility ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F11-localization-accessibility.md` on 2026-10-30 |

## User story

**US-048 — Use Urdu interface**

As a user, I want to use the app in Urdu script with RTL layout.

Spec wording (from F11):

- **US-048:** As a user, I want to use the app in Urdu script with a right-to-left layout, so that it reads naturally.

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

- **Functional:** FR-I18N-001, FR-I18N-002, FR-I18N-003, FR-I18N-005, FR-I18N-009
- **Non-functional:** NFR-MNT-003, NFR-UX-005
- **SRS acceptance tests cited:** AC-I18N-02, AC-I18N-05

Feature requirement set (from F11; additions of 2026-10-30 at the end): FR-I18N-001…008, FR-AUTH-004/005, NFR-MNT-003, NFR-UX-002/005, NFR-COMP-002, FR-I18N-009

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The selected language persists across sessions and localizes interface labels and validation.
2. Urdu uses RTL; English and Roman Urdu use LTR, including mixed Arabic/Latin content.

### Detailed acceptance criteria

From the F11 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F11-AC2** — **(US-048) Given** Urdu selected, **when** any screen is shown, **then** all of the same text is in Urdu script, and the layout is right to left (AC-I18N-02).
- **F11-AC5** — **(US-048) Given** a half-filled Daily Entry form, **when** the user switches from English to Urdu, **then** every entered value is still there, and no app restart is needed (AC-I18N-05).
- **F11-AC6** — **(US-048) Given** a portion saved as Not Remembered in Urdu, **when** it is read from the database, **then** the stored status is `NOT_REMEMBERED`, the same value as when it is saved in English.
- **F11-AC14** — **(US-048) Given** the Urdu interface, **when** quantities, dates, and quality scores are shown, **then** they use Western digits (0–9). *(Added 2026-10-30, DEC-B38.)*

## Business rules

From SRS §9 (verbatim):

- **BR-14:** English and Roman Urdu use LTR; Urdu script uses RTL.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F11 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| Numbers in the Urdu interface | One digit style is used consistently; quantities and dates stay readable (see open question) |
| An icon with a direction (back chevron) | Mirrored in RTL; icons without a direction are not mirrored |

**Out of scope for the whole feature** (verbatim from F11):

- Languages other than these three.
- Auto-translating user-entered notes.
- Showing Quran text beyond Surah names and references.
- Converting between Urdu script and Roman Urdu automatically.

## Dependencies

- **Feature F11 depends on:** — (cross-cutting) (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F11:** [US-047](us-047-use-english-interface.md), [US-049](us-049-use-roman-urdu-interface.md), [US-050](us-050-preserve-quran-arabic-text.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-048` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f11-i18n.spec.ts](../../../e2e/api/f11-i18n.spec.ts) — F11-AC6 (US-048) a status saved in Urdu is stored as the canonical value

**Mobile (Maestro):**

- [e2e/mobile/f11-i18n/locales-and-direction.yaml](../../../e2e/mobile/f11-i18n/locales-and-direction.yaml) — F11 locales — English LTR, Urdu RTL, Roman Urdu LTR, glossary terms
- [e2e/mobile/f11-i18n/switch-mid-entry.yaml](../../../e2e/mobile/f11-i18n/switch-mid-entry.yaml) — F11 language switch — values kept, stored value unchanged, preference persists
- [e2e/mobile/f11-i18n/western-digits.yaml](../../../e2e/mobile/f11-i18n/western-digits.yaml) — F11 Western digits in the Urdu interface

**Unit (Vitest):**

- [apps/mobile/src/i18n/direction.test.ts](../../../apps/mobile/src/i18n/direction.test.ts) — F11-AC2 (US-048) ur is right to left (AC-I18N-02)
- [packages/i18n-keys/catalogue.test.ts](../../../packages/i18n-keys/catalogue.test.ts) — F11-AC6 (US-048) status labels map to canonical values (e.g. NOT_REMEMBERED) identically in every locale

## Open decisions and blockers

Open questions from F11 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] In the Urdu interface, are numbers shown as Western digits (123) or Urdu digits (۱۲۳)? **Resolved:** Western digits (DEC-B38, FR-I18N-009).
- [x] Final Urdu UI font (design.md §2.3 suggests Noto Sans Arabic or a verified Urdu font). **Resolved:** Noto Nastaliq Urdu (DEC-B40, FR-PDF-004).

## Traceability

- **Story:** US-048 → SPEC-US-048 (this file)
- **Detailed criteria:** F11-AC2, F11-AC5, F11-AC6, F11-AC14
- **Requirements:** FR-I18N-001, FR-I18N-002, FR-I18N-003, FR-I18N-005, NFR-MNT-003, NFR-UX-005, FR-I18N-009
- **SRS acceptance tests:** AC-I18N-02, AC-I18N-05
- **Business rules:** SRS §9 #14
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 11
- **Previous location:** `docs/specs/F11-localization-accessibility.md`
