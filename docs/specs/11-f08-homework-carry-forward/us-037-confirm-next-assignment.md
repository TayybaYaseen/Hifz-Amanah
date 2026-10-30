# SPEC-US-037 · Confirm next assignment

| | |
|---|---|
| **Spec ID** | SPEC-US-037 |
| **User story** | US-037 |
| **Feature** | [F08 · Homework and carry forward](README.md) |
| **Epic** | EPIC 8 — Homework and Carry Forward ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F08-homework-carry-forward.md` on 2026-10-30 |

## User story

**US-037 — Confirm next assignment**

As a Teacher, I want to confirm the next homework assignment explicitly.

Spec wording (from F08):

- **US-037:** As a Teacher, I want to confirm the next assignment explicitly, so that it is clear when homework becomes final.

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

- **Functional:** FR-HW-008, FR-HW-009, FR-HW-017
- **Non-functional:** NFR-PERF-003, NFR-REL-003
- **SRS acceptance tests cited:** AC-HW-04, AC-HW-03

Feature requirement set (from F08; additions of 2026-10-30 at the end): FR-HW-001…015, FR-QTY-005, FR-RPT-007, NFR-PERF-003, NFR-REL-003, FR-HW-016/017

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Remaining quantity is calculated only for matching portions and compatible units.
2. Suggestions exclude absence, not-assigned, and pending work from automatic failed-work carry-forward.
3. A Teacher can edit/reject and must explicitly confirm; confirmation records actor/time and preserves history.

### Detailed acceptance criteria

From the F08 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F08-AC10** — **(US-037) Given** a draft, **when** the Teacher presses Confirm and accepts the summary, **then** the status becomes Confirmed with the confirming Teacher and the time, and the confirmation is audited (AC-HW-04).
- **F08-AC11** — **(US-037) Given** no Teacher action, **when** time passes or the next class arrives, **then** the draft is never confirmed automatically (AC-HW-03).
- **F08-AC12** — **(US-037) Given** a confirmation where one portion fails to save, **when** the transaction ends, **then** nothing is confirmed, and no partial assignment is left behind.
- **F08-AC20** — **(US-037) Given** no internet connection, **when** the Teacher confirms a draft, **then** it shows "Confirmed on device — waiting to sync", and after sync it becomes Confirmed with the Teacher and the original confirmation time. *(Added 2026-10-30, DEC-B29.)*
- **F08-AC21** — **(US-037) Given** an offline confirmation whose source records changed on the server after the draft was built, **when** it syncs, **then** the homework is not confirmed, and a sync conflict is created for review. *(Added 2026-10-30, DEC-B29.)*

## Business rules

From SRS §9 (verbatim):

- **BR-9:** A suggested homework assignment is not final until teacher confirmation.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F08 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Teacher confirms homework while offline | Allowed: shows "Confirmed on device — waiting to sync"; the server re-checks the source on sync, and a changed source becomes a conflict (DEC-B29, F08-AC20, F08-AC21) |

**Out of scope for the whole feature** (verbatim from F08):

- AI creating, editing, or confirming homework.
- Converting between units to compute remaining work.
- Confirming homework on the Student's or Parent's behalf.
- Sending homework to students by push or messages (not in the approved event catalogue, FR-NOT-004).

## Dependencies

- **Feature F08 depends on:** F05, F06 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F08:** [US-033](us-033-create-structured-homework.md), [US-034](us-034-calculate-remaining-work.md), [US-035](us-035-suggest-carry-forward.md), [US-036](us-036-review-homework-suggestion.md), [US-038](us-038-preserve-homework-history.md)

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


And in these edge cases (see above):

- The Teacher confirms homework while offline

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-037` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC10 (US-037) confirming stores the confirmer and time and is audited (AC-HW-04)
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC11 (US-037) a draft is never confirmed automatically (AC-HW-03)
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC12 (US-037) a confirmation that fails partway confirms nothing
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC21 (US-037) an offline confirmation against changed source data becomes a conflict

**Mobile (Maestro):**

- [e2e/mobile/f08-homework/confirm-and-revise.yaml](../../../e2e/mobile/f08-homework/confirm-and-revise.yaml) — F08 confirm — explicit confirm, next class, correction, revise
- [e2e/mobile/f08-homework/offline-confirm-and-carry-over.yaml](../../../e2e/mobile/f08-homework/offline-confirm-and-carry-over.yaml) — F08 offline confirmation and carried-over homework

**Unit (Vitest):**

- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC10 (US-037) confirming records the confirming Teacher and time (AC-HW-04)
- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC11 (US-037) a draft is never confirmed automatically (AC-HW-03)

## Open decisions and blockers

Open questions from F08 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] D2: can homework be confirmed offline? If yes, how are server-side changes to the source detected? **Resolved:** Yes; the server re-checks the source on sync and raises a conflict if it changed (DEC-B29, FR-HW-017).

## Traceability

- **Story:** US-037 → SPEC-US-037 (this file)
- **Detailed criteria:** F08-AC10, F08-AC11, F08-AC12, F08-AC20, F08-AC21
- **Requirements:** FR-HW-008, FR-HW-009, NFR-PERF-003, NFR-REL-003, FR-HW-017
- **SRS acceptance tests:** AC-HW-04, AC-HW-03
- **Business rules:** SRS §9 #9
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 8
- **Previous location:** `docs/specs/F08-homework-carry-forward.md`
