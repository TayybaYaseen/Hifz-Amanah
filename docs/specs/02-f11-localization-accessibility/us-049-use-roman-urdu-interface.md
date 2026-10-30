# SPEC-US-049 · Use Roman Urdu interface

| | |
|---|---|
| **Spec ID** | SPEC-US-049 |
| **User story** | US-049 |
| **Feature** | [F11 · Localization and accessibility](README.md) |
| **Epic** | EPIC 11 — Localization and Accessibility ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F11-localization-accessibility.md` on 2026-10-30 |

## User story

**US-049 — Use Roman Urdu interface**

As a user, I want to use the app in Roman Urdu with LTR layout.

Spec wording (from F11):

- **US-049:** As a user, I want to use the app in Roman Urdu with a left-to-right layout, so that I can read Urdu without Urdu script.

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

- **Functional:** FR-I18N-001, FR-I18N-002, FR-I18N-008
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** AC-I18N-03

Feature requirement set (from F11; additions of 2026-10-30 at the end): FR-I18N-001…008, FR-AUTH-004/005, NFR-MNT-003, NFR-UX-002/005, NFR-COMP-002, FR-I18N-009

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The selected language persists across sessions and localizes interface labels and validation.
2. Urdu uses RTL; English and Roman Urdu use LTR, including mixed Arabic/Latin content.

### Detailed acceptance criteria

From the F11 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F11-AC3** — **(US-049) Given** Roman Urdu selected, **when** any screen is shown, **then** all key strings are in Roman Urdu, and the layout is left to right (AC-I18N-03).
- **F11-AC7** — **(US-049) Given** the Roman Urdu glossary, **when** a domain term (Sabaq, Sabqi, Manzil, Para, Rubu, Salasah) appears on screen, **then** it uses the glossary spelling everywhere.

## Business rules

From SRS §9 (verbatim):

- **BR-14:** English and Roman Urdu use LTR; Urdu script uses RTL.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F11 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A long Roman Urdu label | Wraps rather than truncating important words |

**Out of scope for the whole feature** (verbatim from F11):

- Languages other than these three.
- Auto-translating user-entered notes.
- Showing Quran text beyond Surah names and references.
- Converting between Urdu script and Roman Urdu automatically.

## Dependencies

- **Feature F11 depends on:** — (cross-cutting) (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F11:** [US-047](us-047-use-english-interface.md), [US-048](us-048-use-urdu-interface.md), [US-050](us-050-preserve-quran-arabic-text.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-049` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- None

**Mobile (Maestro):**

- [e2e/mobile/f11-i18n/locales-and-direction.yaml](../../../e2e/mobile/f11-i18n/locales-and-direction.yaml) — F11 locales — English LTR, Urdu RTL, Roman Urdu LTR, glossary terms

**Unit (Vitest):**

- [apps/mobile/src/i18n/direction.test.ts](../../../apps/mobile/src/i18n/direction.test.ts) — F11-AC3 (US-049) ur-Latn is left to right (AC-I18N-03)
- [packages/i18n-keys/catalogue.test.ts](../../../packages/i18n-keys/catalogue.test.ts) — F11-AC7 (US-049) Sabaq, Sabqi, Manzil, Para, Rubu, and Salasah use the glossary spelling in ur-Latn

## Open decisions and blockers

Open questions from F11 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Who owns and reviews the Roman Urdu glossary? **Resolved:** Dev team drafts; the product owner or their nominee approves (DEC-B39, FR-I18N-008).

## Traceability

- **Story:** US-049 → SPEC-US-049 (this file)
- **Detailed criteria:** F11-AC3, F11-AC7
- **Requirements:** FR-I18N-001, FR-I18N-002, FR-I18N-008
- **SRS acceptance tests:** AC-I18N-03
- **Business rules:** SRS §9 #14
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 11
- **Previous location:** `docs/specs/F11-localization-accessibility.md`
