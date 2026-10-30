# SPEC-US-033 · Create structured homework

| | |
|---|---|
| **Spec ID** | SPEC-US-033 |
| **User story** | US-033 |
| **Feature** | [F08 · Homework and carry forward](README.md) |
| **Epic** | EPIC 8 — Homework and Carry Forward ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F08-homework-carry-forward.md` on 2026-10-30 |

## User story

**US-033 — Create structured homework**

As a Teacher, I want to assign Sabaq, Sabqi, and Manzil homework.

Spec wording (from F08):

- **US-033:** As a Teacher, I want to assign Sabaq, Sabqi, and Manzil homework, so that the student knows exactly what to prepare.

**Feature context** (shared by every story in F08, copied from the feature spec):

> After a lesson, the teacher decides what the student should prepare next. Any unfinished work can be suggested automatically, but **only the teacher's explicit confirmation makes homework real**. A confirmed assignment is never changed behind the teacher's back.
>
> There is no code yet. This feature builds:
> - the `homework` module: the `homework_assignments` and `homework_portions` tables
> - the pure `suggest()` function in `packages/domain/homework` ([ARCHITECTURE.md §9.2](../../ARCHITECTURE.md))
>
> It reads attempts from F05 and quantities from F06.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-HW-001, FR-HW-002, FR-HW-003, FR-HW-004
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F08; additions of 2026-10-30 at the end): FR-HW-001…015, FR-QTY-005, FR-RPT-007, NFR-PERF-003, NFR-REL-003, FR-HW-016/017

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. A homework assignment can contain Sabaq, Sabqi, and Manzil portions, with multiple independent Para portions for Sabqi and Manzil.
2. Each homework portion stores section, Para, optional Surah/Ayat range, quantity with unit, status, and optional instructions.
3. The assignment stores assigned date, due/next-class date, status, creator, and optional general instructions.

### Detailed acceptance criteria

From the F08 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F08-AC1** — **(US-033) Given** a Teacher creating homework, **when** they add one Sabaq portion and two Sabqi Paras with different quantities, **then** each portion is stored with its section, Para, optional range, quantity and unit, and optional instructions.
- **F08-AC2** — **(US-033) Given** a homework assignment, **when** it is saved, **then** it stores the assigned date, the due date, the status, the creator, and any general instructions.

## Business rules

From SRS §9 (verbatim):

- **BR-2:** Sabqi and Manzil can contain multiple independently tracked Para portions.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F08 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The due date is before the assigned date | The field shows an error |

**Out of scope for the whole feature** (verbatim from F08):

- AI creating, editing, or confirming homework.
- Converting between units to compute remaining work.
- Confirming homework on the Student's or Parent's behalf.
- Sending homework to students by push or messages (not in the approved event catalogue, FR-NOT-004).

## Dependencies

- **Feature F08 depends on:** F05, F06 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F08:** [US-034](us-034-calculate-remaining-work.md), [US-035](us-035-suggest-carry-forward.md), [US-036](us-036-review-homework-suggestion.md), [US-037](us-037-confirm-next-assignment.md), [US-038](us-038-preserve-homework-history.md)

## Related screens and UI

- **Feature flow** (from F08): Homework — suggestions and confirmed assignments ([design.md §4.9, §5.7](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-033 to US-037 | §4.9 Homework; §5.7 draft panel | Suggested / Confirmed tabs; Review, edit, add, remove, Dismiss; Confirm homework (also offline); Revise (Owner/Admin only) | Offline; Saved locally; "Confirmed on device — waiting to sync"; Conflict | Draft label "Suggestion — not confirmed"; confirmation summary before saving | Draft never styled as confirmed; confirmed state uses the success chip with text |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `homework`, `packages/domain/homework`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-033` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC1 (US-033) each homework portion stores its own section, Para, range, quantity, and instructions
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC2 (US-033) an assignment stores dates, status, creator, and instructions

**Mobile (Maestro):**

- [e2e/mobile/f08-homework/confirm-and-revise.yaml](../../../e2e/mobile/f08-homework/confirm-and-revise.yaml) — F08 confirm — explicit confirm, next class, correction, revise

**Unit (Vitest):**

- None

## Open decisions and blockers

Open questions from F08 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Should the due date default to the next scheduled class day (F04)? **Resolved:** Yes, skipping Sundays and holidays; missed homework carries over (DEC-B30, FR-HW-004, FR-HW-016).

## Traceability

- **Story:** US-033 → SPEC-US-033 (this file)
- **Detailed criteria:** F08-AC1, F08-AC2
- **Requirements:** FR-HW-001, FR-HW-002, FR-HW-003, FR-HW-004
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #2
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 8
- **Previous location:** `docs/specs/F08-homework-carry-forward.md`
