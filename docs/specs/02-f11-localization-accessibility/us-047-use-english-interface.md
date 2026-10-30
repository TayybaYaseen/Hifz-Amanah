# SPEC-US-047 · Use English interface

| | |
|---|---|
| **Spec ID** | SPEC-US-047 |
| **User story** | US-047 |
| **Feature** | [F11 · Localization and accessibility](README.md) |
| **Epic** | EPIC 11 — Localization and Accessibility ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F11-localization-accessibility.md` on 2026-10-30 |

## User story

**US-047 — Use English interface**

As a user, I want to use the app in English.

Spec wording (from F11):

- **US-047:** As a user, I want to use the app in English, so that I can work in the language I read best.

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

- **Functional:** FR-I18N-001, FR-I18N-002, FR-I18N-003, FR-I18N-004, FR-AUTH-004, FR-AUTH-005
- **Non-functional:** NFR-UX-002, NFR-UX-005
- **SRS acceptance tests cited:** AC-I18N-01, AC-I18N-04

Feature requirement set (from F11; additions of 2026-10-30 at the end): FR-I18N-001…008, FR-AUTH-004/005, NFR-MNT-003, NFR-UX-002/005, NFR-COMP-002, FR-I18N-009

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The selected language persists across sessions and localizes interface labels and validation.
2. Urdu uses RTL; English and Roman Urdu use LTR, including mixed Arabic/Latin content.
3. Changing language does not alter stored domain values or erase unsaved form data.

### Detailed acceptance criteria

From the F11 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F11-AC1** — **(US-047) Given** English selected, **when** any screen is shown, **then** navigation, labels, buttons, validation messages, and empty states are in English, and the layout is left to right (AC-I18N-01).
- **F11-AC4** — **(US-047) Given** a user who chose Urdu, **when** they sign out and sign in again, on this device or another, **then** the app opens in Urdu (AC-I18N-04).
- **F11-AC11** — **(US-047) Given** every message key in the app and server catalogues, **when** CI runs, **then** each key exists in `en`, `ur`, and `ur-Latn`, or the build fails.
- **F11-AC12** — **(US-047) Given** Android's largest font size, **when** the main screens are shown, **then** text is not clipped, and touch targets stay at least 44 dp.
- **F11-AC13** — **(US-047) Given** a status shown anywhere, **when** it is rendered, **then** it has a text label and an icon, never color alone.

## Business rules

From SRS §9 (verbatim):

- **BR-14:** English and Roman Urdu use LTR; Urdu script uses RTL.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F11 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A student's name is in Urdu script while the UI is in English | The name is shown right to left inside the left-to-right layout, isolated so the punctuation around it stays correct |
| A translation is missing at runtime | Falls back to English, and the gap is logged once; CI should catch this before release |

**Out of scope for the whole feature** (verbatim from F11):

- Languages other than these three.
- Auto-translating user-entered notes.
- Showing Quran text beyond Surah names and references.
- Converting between Urdu script and Roman Urdu automatically.

## Dependencies

- **Feature F11 depends on:** — (cross-cutting) (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F11:** [US-048](us-048-use-urdu-interface.md), [US-049](us-049-use-roman-urdu-interface.md), [US-050](us-050-preserve-quran-arabic-text.md)

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

Stated in these criteria: F11-AC4.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-047` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f11-i18n.spec.ts](../../../e2e/api/f11-i18n.spec.ts) — F11-AC4 (US-047) the language preference is stored on the account
- [e2e/api/f11-i18n.spec.ts](../../../e2e/api/f11-i18n.spec.ts) — F11-AC11 (US-047) every message key exists in en, ur, and ur-Latn

**Mobile (Maestro):**

- [e2e/mobile/f11-i18n/accessibility.yaml](../../../e2e/mobile/f11-i18n/accessibility.yaml) — F11 accessibility — largest font, touch targets, status text and icon
- [e2e/mobile/f11-i18n/locales-and-direction.yaml](../../../e2e/mobile/f11-i18n/locales-and-direction.yaml) — F11 locales — English LTR, Urdu RTL, Roman Urdu LTR, glossary terms
- [e2e/mobile/f11-i18n/switch-mid-entry.yaml](../../../e2e/mobile/f11-i18n/switch-mid-entry.yaml) — F11 language switch — values kept, stored value unchanged, preference persists

**Unit (Vitest):**

- [apps/mobile/src/i18n/direction.test.ts](../../../apps/mobile/src/i18n/direction.test.ts) — F11-AC1 (US-047) en is left to right (AC-I18N-01)
- [packages/i18n-keys/catalogue.test.ts](../../../packages/i18n-keys/catalogue.test.ts) — F11-AC11 (US-047) every app and server key exists in en, ur, and ur-Latn

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-047 → SPEC-US-047 (this file)
- **Detailed criteria:** F11-AC1, F11-AC4, F11-AC11, F11-AC12, F11-AC13
- **Requirements:** FR-I18N-001, FR-I18N-002, FR-I18N-003, FR-I18N-004, FR-AUTH-004, FR-AUTH-005, NFR-UX-002, NFR-UX-005
- **SRS acceptance tests:** AC-I18N-01, AC-I18N-04
- **Business rules:** SRS §9 #14
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 11
- **Previous location:** `docs/specs/F11-localization-accessibility.md`
