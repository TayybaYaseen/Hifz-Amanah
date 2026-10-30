# SPEC-US-007 · Create madrasa workspace

| | |
|---|---|
| **Spec ID** | SPEC-US-007 |
| **User story** | US-007 |
| **Feature** | [F02 · Organization and roles](README.md) |
| **Epic** | EPIC 2 — Organization and Roles ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F02-organization-roles.md` on 2026-10-30 |

## User story

**US-007 — Create madrasa workspace**

As an authorized owner/admin, I want to configure a madrasa workspace.

Spec wording (from F02):

- **US-007:** As an authorized owner/admin, I want to configure a madrasa workspace, so that the app uses our name, timezone, and week.

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

- **Functional:** FR-ORG-001, FR-ORG-002, FR-SEC-002, FR-CAL-006, FR-ORG-007
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

- **F02-AC1** — **(US-007) Given** a newly created madrasa, **when** its settings are first opened, **then** the timezone is `Asia/Karachi`, the week starts on Monday, and the daily-report mode is "one report per student/date".
- **F02-AC2** — **(US-007) Given** an Owner or Admin, **when** they save a changed name, timezone, or week start, **then** the change is saved, audited, and used by reports generated afterwards.
- **F02-AC3** — **(US-007) Given** an empty workspace name, **when** the Admin saves, **then** the name field shows an error and nothing is saved.
- **F02-AC4** — **(US-007) Given** a Teacher, Student, or Parent, **when** they open workspace settings or call the update endpoint, **then** they see no edit controls and the API returns forbidden.
- **F02-AC5** — **(US-007) Given** existing daily records, **when** the Admin changes the timezone, **then** the stored `report_date` of every existing record is unchanged.
- **F02-AC15** — **(US-007) Given** an Admin, **when** they try to add or remove an Admin or transfer ownership, **then** it is refused. **Given** the Owner, **when** they do the same, **then** it succeeds and is audited. *(Added 2026-10-30, DEC-B02.)*
- **F02-AC16** — **(US-007) Given** the app and the public API, **when** a person who has no account looks for a way to create a workspace, **then** there is no sign-up or create-workspace action or endpoint. A workspace and its first Owner exist only after the platform operator creates them. *(Added 2026-10-30, DEC-B01.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F02-AC3, F02-AC4, F02-AC15.

## Edge cases and error handling

Rows from the F02 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Admin tries to remove the last Owner/Admin | Blocked, with the message "A madrasa needs at least one Admin" |
| The week start is changed in the middle of a week | Reports recalculate with the new boundaries; the source records are unchanged |

**Out of scope for the whole feature** (verbatim from F02):

- Viewing or searching audit history (F17, US-069).
- Per-user custom permissions beyond the approved role matrix.
- One account belonging to several madaris (FR-AUTH-011).
- Billing, subscriptions, or deleting a madrasa.
- Choosing the daily-report mode (F05, US-019).

## Dependencies

- **Feature F02 depends on:** F01 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F02:** [US-008](us-008-restrict-teacher-scope.md), [US-009](us-009-audit-sensitive-changes.md)

## Related screens and UI

- **Feature flow** (from F02): Settings → Workspace, Roles and permissions ([design.md §4.16](../../design.md)); every list screen (teacher scope)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-007 | Workspace settings (design gap; built from FormField). The platform operator creates the workspace and its first Owner; there is no in-app creation (FR-ORG-001) | Owner completes name and settings | Offline (changes need network) | Name required; timezone defaults to Asia/Karachi and week start to Monday, both editable | — |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `organization`, `access`, `audit`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-007` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC1 (US-007) a new madrasa has Asia/Karachi, Monday, and SINGLE mode
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC2 (US-007) Owner and Admin settings changes are saved, audited, and used by later reports
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC3 (US-007) an empty workspace name is rejected and nothing is saved
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC4 (US-007) Teacher, Student, and Parent cannot update settings
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC5 (US-007) changing the timezone never changes stored report_date values
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC15 (US-007) only the Owner adds or removes Admins and transfers ownership
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC16 (US-007) there is no self sign-up or public workspace creation

**Mobile (Maestro):**

- [e2e/mobile/f02-organization/no-self-signup.yaml](../../../e2e/mobile/f02-organization/no-self-signup.yaml) — F02 no self sign-up or in-app workspace creation
- [e2e/mobile/f02-organization/workspace-settings.yaml](../../../e2e/mobile/f02-organization/workspace-settings.yaml) — F02 settings — defaults, Admin edits, empty name, no controls for others

**Unit (Vitest):**

- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC1 (US-007) a new madrasa defaults to Asia/Karachi, Monday week start, and SINGLE daily-report mode
- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC2 (US-007) Owner and Admin may update name, timezone, and week start
- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC4 (US-007) Teacher, Student, and Parent may not update workspace settings

## Open decisions and blockers

Open questions from F02 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Are Owner and Admin different in MVP, and how? **Resolved:** Same permissions; only the Owner adds or removes Admins and transfers ownership (DEC-B02, FR-ORG-007).
- [x] Who creates the madrasa workspace itself, and how is an individual-teacher workspace onboarded (design.md §11 D1)? **Resolved:** The platform operator creates each workspace and its first Owner; an individual teacher holds Owner/Admin and Teacher roles (DEC-B01, FR-ORG-001).

## Traceability

- **Story:** US-007 → SPEC-US-007 (this file)
- **Detailed criteria:** F02-AC1, F02-AC2, F02-AC3, F02-AC4, F02-AC5, F02-AC15, F02-AC16
- **Requirements:** FR-ORG-001, FR-ORG-002, FR-SEC-002, FR-CAL-006, FR-ORG-007
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 2
- **Previous location:** `docs/specs/F02-organization-roles.md`
