# SPEC-US-038 · Preserve homework history

| | |
|---|---|
| **Spec ID** | SPEC-US-038 |
| **User story** | US-038 |
| **Feature** | [F08 · Homework and carry forward](README.md) |
| **Epic** | EPIC 8 — Homework and Carry Forward ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F08-homework-carry-forward.md` on 2026-10-30 |

## User story

**US-038 — Preserve homework history**

As a Teacher/Admin, I want prior assignments and their source attempts retained.

Spec wording (from F08):

- **US-038:** As a Teacher/Admin, I want earlier assignments and their source attempts kept, so that we can trace how work was carried forward.

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

- **Functional:** FR-HW-010, FR-HW-011, FR-HW-012, FR-HW-015, FR-HW-016
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** AC-HW-05, AC-HW-06, AC-HW-07

Feature requirement set (from F08; additions of 2026-10-30 at the end): FR-HW-001…015, FR-QTY-005, FR-RPT-007, NFR-PERF-003, NFR-REL-003, FR-HW-016/017

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

### Detailed acceptance criteria

From the F08 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F08-AC13** — **(US-038) Given** a confirmed assignment, **when** the Teacher creates a new assignment for the next class, **then** the earlier assignment is kept unchanged (AC-HW-05).
- **F08-AC14** — **(US-038) Given** a source attempt is corrected, **when** recalculation runs, **then** draft suggestions are rebuilt, and confirmed assignments are unchanged (AC-HW-06, AC-HW-07). The Teacher sees "Confirmed homework was not changed — Revise?".
- **F08-AC15** — **(US-038) Given** an Owner or Admin who chooses Revise on confirmed homework, **when** they confirm the revision, **then** a new assignment is created with a link to the old one, the old one becomes Superseded, and both are audited. *(Revised 2026-10-30, DEC-B17.)*
- **F08-AC16** — **(US-038) Given** the next class, **when** the Teacher records an attempt on a homework portion, **then** the attempt links to that homework portion (FR-HW-015).
- **F08-AC17** — **(US-038) Given** a Teacher, **when** they try to revise confirmed homework, **then** there is no Revise control, and the API returns forbidden. *(Added 2026-10-30, DEC-B17.)*
- **F08-AC19** — **(US-038) Given** confirmed homework due on a day the student is Absent or on Leave, or that becomes a holiday, **when** the next class day comes, **then** the same homework is shown as outstanding and labelled "carried over — absent/holiday". It is not counted as failed, and the confirmed assignment is unchanged. *(Added 2026-10-30, DEC-B30.)*

## Business rules

From SRS §9 (verbatim):

- **BR-10:** Past homework and attempts remain in history.
- **BR-11:** Corrections recalculate unconfirmed suggestions and derived reports, but never silently rewrite confirmed homework.

## Validation rules

Stated in these criteria: F08-AC17.

## Edge cases and error handling

Rows from the F08 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The source student is deactivated | Confirmed homework keeps its links for history; drafts are rebuilt |

**Out of scope for the whole feature** (verbatim from F08):

- AI creating, editing, or confirming homework.
- Converting between units to compute remaining work.
- Confirming homework on the Student's or Parent's behalf.
- Sending homework to students by push or messages (not in the approved event catalogue, FR-NOT-004).

## Dependencies

- **Feature F08 depends on:** F05, F06 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F08:** [US-033](us-033-create-structured-homework.md), [US-034](us-034-calculate-remaining-work.md), [US-035](us-035-suggest-carry-forward.md), [US-036](us-036-review-homework-suggestion.md), [US-037](us-037-confirm-next-assignment.md)

## Related screens and UI

- **Feature flow** (from F08): Homework — suggestions and confirmed assignments ([design.md §4.9, §5.7](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-038 | §4.6 Student profile → Homework tab; §4.7 (due homework shown) | View past assignments; record an attempt against a due portion | No records; "Carried over — absent/holiday" | — | Superseded and carried-over assignments labeled in text |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `homework`, `packages/domain/homework`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-038` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC13 (US-038) a new assignment keeps the earlier one unchanged (AC-HW-05)
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC14 (US-038) correcting a source attempt rebuilds drafts only (AC-HW-06, AC-HW-07)
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC15 (US-038) an Admin
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC16 (US-038) a next-class attempt links to its homework portion (FR-HW-015)
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC17 (US-038) a Teacher cannot revise confirmed homework
- [e2e/api/f08-homework.spec.ts](../../../e2e/api/f08-homework.spec.ts) — F08-AC19 (US-038) homework missed through absence or a holiday carries over unchanged

**Mobile (Maestro):**

- [e2e/mobile/f08-homework/confirm-and-revise.yaml](../../../e2e/mobile/f08-homework/confirm-and-revise.yaml) — F08 confirm — explicit confirm, next class, correction, revise
- [e2e/mobile/f08-homework/offline-confirm-and-carry-over.yaml](../../../e2e/mobile/f08-homework/offline-confirm-and-carry-over.yaml) — F08 offline confirmation and carried-over homework

**Unit (Vitest):**

- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC14 (US-038) correcting a source attempt rebuilds drafts and leaves confirmed homework unchanged (AC-HW-06, AC-HW-07)
- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC15 (US-038) an Admin revision creates a linked new assignment and marks the old one SUPERSEDED
- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC13 (US-038) a new assignment never modifies an earlier confirmed one (AC-HW-05)
- [packages/domain/homework/suggest.test.ts](../../../packages/domain/homework/suggest.test.ts) — F08-AC19 (US-038) homework missed through absence or a holiday carries over unchanged

## Open decisions and blockers

Open questions from F08 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Are both a Teacher and an Admin allowed to revise confirmed homework? **Resolved:** Owner/Admin only (DEC-B17, FR-HW-012).

## Traceability

- **Story:** US-038 → SPEC-US-038 (this file)
- **Detailed criteria:** F08-AC13, F08-AC14, F08-AC15, F08-AC16, F08-AC17, F08-AC19
- **Requirements:** FR-HW-010, FR-HW-011, FR-HW-012, FR-HW-015, FR-HW-016
- **SRS acceptance tests:** AC-HW-05, AC-HW-06, AC-HW-07
- **Business rules:** SRS §9 #10, SRS §9 #11
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 8
- **Previous location:** `docs/specs/F08-homework-carry-forward.md`
