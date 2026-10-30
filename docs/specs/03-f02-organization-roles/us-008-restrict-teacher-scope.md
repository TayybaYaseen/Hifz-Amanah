# SPEC-US-008 · Restrict teacher scope

| | |
|---|---|
| **Spec ID** | SPEC-US-008 |
| **User story** | US-008 |
| **Feature** | [F02 · Organization and roles](README.md) |
| **Epic** | EPIC 2 — Organization and Roles ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F02-organization-roles.md` on 2026-10-30 |

## User story

**US-008 — Restrict teacher scope**

As a madrasa, I want teachers limited to assigned classes and students.

Spec wording (from F02):

- **US-008:** As a madrasa, I want teachers limited to their assigned classes and students, so that student records are seen only by the people who teach them.

**Feature context** (shared by every story in F02, copied from the feature spec):

> A madrasa is a workspace that owns all of its records. Inside it:
> - Owners and Admins configure the madrasa.
> - Teachers see only the classes and students assigned to them.
> - Sensitive changes are recorded in an audit trail.
>
> There is no code yet. This feature builds the following, on top of F01:
> - the `organization` module: the `organizations` and `memberships` tables, and timezone and week-start settings
> - the `access` policy layer ([ARCHITECTURE.md §7.2–7.3](../../ARCHITECTURE.md))
> - the append-only `audit` writer ([ARCHITECTURE.md §15](../../ARCHITECTURE.md))
>
> The daily-report mode setting belongs to F05 (US-019). Viewing the audit history belongs to F17 (US-069).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-ORG-003, FR-ORG-004, FR-ORG-005, FR-SEC-003, FR-SEC-008, FR-SEC-009
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F02; additions of 2026-10-30 at the end): FR-ORG-001…006, FR-SEC-002/003/007/008/009, FR-AUD-001…003, FR-ORG-007

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The action is available only to an authorized role in the active madrasa/workspace.
2. The system validates inputs and displays clear success, empty, and error states.
3. Changes are persisted and reflected in dependent views without losing historical records.

### Detailed acceptance criteria

From the F02 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F02-AC6** — **(US-008) Given** a Teacher assigned only to Class A, **when** they open the student list, **then** only students enrolled in Class A are listed.
- **F02-AC7** — **(US-008) Given** the same Teacher, **when** they request a Class B student, record, or report by ID, **then** the response is "not found", exactly as for an ID that does not exist.
- **F02-AC8** — **(US-008) Given** a Teacher removed from Class A, **when** they next sync or make a request, **then** no Class A data is returned. Records they created earlier remain, with them still shown as the recorder.
- **F02-AC9** — **(US-008) Given** a request whose body contains an `organization_id`, a role, or a class the user is not assigned to, **when** the server processes it, **then** those values are ignored or rejected. Scope always comes from the signed-in membership.
- **F02-AC14** — **(US-008) Given** a Teacher whose Owner or Admin set the "all classes" flag, **when** they list students or request any class's records, **then** every class in the madrasa is available with Teacher permissions only. Setting or clearing the flag is audited, and a Teacher cannot set it. *(Added 2026-10-30, DEC-B13.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F02-AC9, F02-AC14.

## Edge cases and error handling

Rows from the F02 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A Teacher has no class assignments | Empty state "No classes assigned to you yet"; no data is shown |
| A student is in two classes taught by the same Teacher | The student appears once in that Teacher's lists |
| A Teacher is offline when their assignment is removed | Local edits remain visible but cannot sync. On reconnect, the sync is refused as access revoked (F12) |

**Out of scope for the whole feature** (verbatim from F02):

- Viewing or searching audit history (F17, US-069).
- Per-user custom permissions beyond the approved role matrix.
- One account belonging to several madaris (FR-AUTH-011).
- Billing, subscriptions, or deleting a madrasa.
- Choosing the daily-report mode (F05, US-019).

## Dependencies

- **Feature F02 depends on:** F01 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** F12
- **Other stories referenced:** None
- **Other stories in F02:** [US-007](us-007-create-madrasa-workspace.md), [US-009](us-009-audit-sensitive-changes.md)

## Related screens and UI

- **Feature flow** (from F02): Settings → Workspace, Roles and permissions ([design.md §4.16](../../design.md)); every list screen (teacher scope)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-008 | All lists (§4.5, §4.7) | Only assigned classes and students listed | Permission denied for direct links | — | Denied message never reveals whether the record exists |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `organization`, `access`, `audit`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F02-AC8.

And in these edge cases (see above):

- A Teacher is offline when their assignment is removed

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-008` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC6 (US-008) a Teacher lists only students of assigned classes
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC7 (US-008) out-of-scope student, record, and report IDs return not found
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC8 (US-008) a Teacher removed from a class loses its data but stays recorder of old records
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC9 (US-008) client-sent organization_id, role, or class is ignored or rejected
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC14 (US-008) the all-classes flag widens a Teacher’s scope and only Owner/Admin can set it

**Mobile (Maestro):**

- [e2e/mobile/f02-organization/teacher-scope.yaml](../../../e2e/mobile/f02-organization/teacher-scope.yaml) — F02 scope — Teacher sees only assigned classes; removal hides class data

**Unit (Vitest):**

- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC6 (US-008) Teacher sees only students enrolled in their assigned classes
- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC7 (US-008) an out-of-scope resource resolves to NOT_FOUND, identical to a missing ID
- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC8 (US-008) a Teacher removed from a class loses access to that class
- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC9 (US-008) scope comes from the membership; client-sent organization_id, role, or class is ignored

## Open decisions and blockers

Open questions from F02 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Approve the role/permission matrix ([ARCHITECTURE.md §7.3](../../ARCHITECTURE.md), SRS §13 #2). **Resolved:** Approved; SRS §17.1 (DEC-B12).
- [x] May an Admin grant a Teacher wider access, as FR-SEC-003's "unless a specific permission" allows? **Resolved:** Yes, the "all classes" flag (DEC-B13, FR-SEC-003).

## Traceability

- **Story:** US-008 → SPEC-US-008 (this file)
- **Detailed criteria:** F02-AC6, F02-AC7, F02-AC8, F02-AC9, F02-AC14
- **Requirements:** FR-ORG-003, FR-ORG-004, FR-ORG-005, FR-SEC-003, FR-SEC-008, FR-SEC-009
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 2
- **Previous location:** `docs/specs/F02-organization-roles.md`
