# SPEC-US-009 · Audit sensitive changes

| | |
|---|---|
| **Spec ID** | SPEC-US-009 |
| **User story** | US-009 |
| **Feature** | [F02 · Organization and roles](README.md) |
| **Epic** | EPIC 2 — Organization and Roles ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F02-organization-roles.md` on 2026-10-30 |

## User story

**US-009 — Audit sensitive changes**

As an Admin, I want sensitive account, role, and access changes recorded in an audit trail.

Spec wording (from F02):

- **US-009:** As an Admin, I want sensitive account, role, and access changes recorded in an audit trail, so that we can see who changed what.

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

- **Functional:** FR-SEC-007, FR-AUD-001, FR-AUD-002, FR-AUD-003
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F02; additions of 2026-10-30 at the end): FR-ORG-001…006, FR-SEC-002/003/007/008/009, FR-AUD-001…003, FR-ORG-007

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Account creation and deactivation, role/membership changes, password resets, guardian link changes, and note-visibility changes each create an audit record.
2. Each audit record stores actor, action, target, timestamp, and a safe change summary, and never stores passwords, OTPs, or tokens.
3. Audit records cannot be edited or deleted through the application.

### Detailed acceptance criteria

From the F02 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F02-AC10** — **(US-009) Given** any of these actions: account create/deactivate, role or membership change, password reset, guardian link change, note-visibility change, **when** it succeeds, **then** exactly one audit record is written with the actor, action, target, timestamp, and a safe summary.
- **F02-AC11** — **(US-009) Given** a password reset or account creation, **when** its audit record is read, **then** it contains no password, OTP, or token.
- **F02-AC12** — **(US-009) Given** any role, including Owner, **when** they try to edit or delete an audit record through the app or API, **then** no such operation exists or it is rejected.
- **F02-AC13** — **(US-009) Given** a sensitive change whose audit write fails, **when** the transaction ends, **then** the change itself is rolled back too.

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F02-AC12.

## Edge cases and error handling

No F02 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

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
- **Other stories in F02:** [US-007](us-007-create-madrasa-workspace.md), [US-008](us-008-restrict-teacher-scope.md)

## Related screens and UI

- **Feature flow** (from F02): Settings → Workspace, Roles and permissions ([design.md §4.16](../../design.md)); every list screen (teacher scope)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-009, US-069 | §3.2 More → Audit history; "View history" on a record | Paginated list with filters | No records | — | Shown to authorized roles only |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `organization`, `access`, `audit`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-009` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC10 (US-009) each sensitive action writes exactly one audit record
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC11 (US-009) reset and creation audits contain no password, OTP, or token
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC12 (US-009) audit records cannot be edited or deleted by any role
- [e2e/api/f02-organization.spec.ts](../../../e2e/api/f02-organization.spec.ts) — F02-AC13 (US-009) a failed audit write rolls back the change

**Mobile (Maestro):**

- None

**Unit (Vitest):**

- [apps/api/src/modules/access/policy.test.ts](../../../apps/api/src/modules/access/policy.test.ts) — F02-AC12 (US-009) no role, including Owner, may edit or delete an audit record

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-009 → SPEC-US-009 (this file)
- **Detailed criteria:** F02-AC10, F02-AC11, F02-AC12, F02-AC13
- **Requirements:** FR-SEC-007, FR-AUD-001, FR-AUD-002, FR-AUD-003
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 2
- **Previous location:** `docs/specs/F02-organization-roles.md`
