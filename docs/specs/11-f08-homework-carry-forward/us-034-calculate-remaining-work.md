# SPEC-US-034 · Calculate remaining work

| | |
|---|---|
| **Spec ID** | SPEC-US-034 |
| **User story** | US-034 |
| **Feature** | [F08 · Homework and carry forward](README.md) |
| **Epic** | EPIC 8 — Homework and Carry Forward ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F08-homework-carry-forward.md` on 2026-10-30 |

## User story

**US-034 — Calculate remaining work**

As a Teacher, I want incomplete assigned quantities to have remaining amounts calculated automatically.

Spec wording (from F08):

- **US-034:** As a Teacher, I want remaining amounts calculated automatically for incomplete work, so that I don't work them out by hand.

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

- **Functional:** FR-HW-005, FR-QTY-005
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F08; additions of 2026-10-30 at the end): FR-HW-001…015, FR-QTY-005, FR-RPT-007, NFR-PERF-003, NFR-REL-003, FR-HW-016/017

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Remaining quantity is calculated only for matching portions and compatible units.
2. Suggestions exclude absence, not-assigned, and pending work from automatic failed-work carry-forward.
3. A Teacher can edit/reject and must explicitly confirm; confirmation records actor/time and preserves history.

### Detailed acceptance criteria

From the F08 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F08-AC3** — **(US-034) Given** 3/4 Para assigned and 1/2 Para completed for the same portion, **when** the remaining quantity is calculated, **then** it is 1/4 Para.
- **F08-AC4** — **(US-034) Given** the assigned and completed quantities are in different units, **when** remaining is calculated, **then** no remaining quantity is shown, and the portion is flagged for the Teacher to review.

## Business rules

From SRS §9 (verbatim):

- **BR-5:** Remaining quantity is calculated only for compatible units and the same portion.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

No F08 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

**Out of scope for the whole feature** (verbatim from F08):

- AI creating, editing, or confirming homework.
- Converting between units to compute remaining work.
- Confirming homework on the Student's or Parent's behalf.
- Sending homework to students by push or messages (not in the approved event catalogue, FR-NOT-004).

## Dependencies

- **Feature F08 depends on:** F05, F06 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F08:** [US-033](us-033-create-structured-homework.md), [US-035](us-035-suggest-carry-forward.md), [US-036](us-036-review-homework-suggestion.md), [US-037](us-037-confirm-next-assignment.md), [US-038](us-038-preserve-homework-history.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-034` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC3 (US-034) 3/4 assigned and 1/2 completed suggest 1/4 Para
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC4 (US-034) mismatched units give no remaining and a review flag

**Mobile (Maestro):**

- [e2e/mobile/f08-homework/suggestions-and-review.yaml](../../../e2e/mobile/f08-homework/suggestions-and-review.yaml) — F08 suggestions — eligible portions, draft label, review edits, reject

**Unit (Vitest):**

- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC3 (US-034) 3/4 Para assigned, 1/2 completed → 1/4 Para
- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC4 (US-034) different units → no remaining, portion flagged for review

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-034 → SPEC-US-034 (this file)
- **Detailed criteria:** F08-AC3, F08-AC4
- **Requirements:** FR-HW-005, FR-QTY-005
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #5
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 8
- **Previous location:** `docs/specs/F08-homework-carry-forward.md`
