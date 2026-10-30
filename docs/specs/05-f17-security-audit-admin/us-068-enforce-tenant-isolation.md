# SPEC-US-068 · Enforce tenant isolation

| | |
|---|---|
| **Spec ID** | SPEC-US-068 |
| **User story** | US-068 |
| **Feature** | [F17 · Security, audit, and administration](README.md) |
| **Epic** | EPIC 17 — Security, Audit, and Administration ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F17-security-audit-admin.md` on 2026-10-30 |

## User story

**US-068 — Enforce tenant isolation**

As a madrasa, I want all records scoped to the active organization.

Spec wording (from F17):

- **US-068:** As a madrasa, I want all records scoped to our organization, so that no other madrasa can ever see our students.

**Feature context** (shared by every story in F17, copied from the feature spec):

> Student records are private, and every madrasa's data must stay inside that madrasa. This feature enforces tenant isolation as a cross-cutting rule. It also gives Admins a way to review the audit trail that F02 writes, and hardens password recovery.
>
> There is no code yet. This feature builds on:
> - the F02 `access` policy and audit writer
> - the F01 recovery flow
>
> It adds:
> - Postgres row-level security (RLS) as a second line of defense
> - the audit query API and screen
> - recovery hardening ([ARCHITECTURE.md §7, §15](../../ARCHITECTURE.md))

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-SEC-001, FR-SEC-002, FR-SEC-008, FR-SEC-009, FR-ORG-005
- **Non-functional:** NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007
- **SRS acceptance tests cited:** AC-SEC-01, AC-SEC-05

Feature requirement set (verbatim from F17): FR-SEC-001…009, FR-AUD-001…004, NFR-SEC-001…007, NFR-PORT-006, FR-AUTH-007

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Protected operations are authorized server-side against the active organization and role.
2. Sensitive actions retain actor, timestamp, target, and change context without logging unnecessary secrets.

### Detailed acceptance criteria

From the F17 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F17-AC1** — **(US-068) Given** a user in Madrasa A, **when** they request any Madrasa B record by ID through any endpoint, **then** the response is "not found", identical to a missing ID (AC-SEC-01).
- **F17-AC2** — **(US-068) Given** a repository query missing its organization filter (a deliberately broken test query), **when** it runs under the app's database role, **then** RLS returns no rows from other madaris.
- **F17-AC3** — **(US-068) Given** a request that sends a different `organization_id` in the body, query, or header, **when** it is processed, **then** the madrasa comes from the signed-in membership only.
- **F17-AC4** — **(US-068) Given** a removed member, **when** they make any request, **then** it is refused, and the audit records they created remain (AC-SEC-05).
- **F17-AC5** — **(US-068) Given** production, **when** any API call is made over plain HTTP, **then** it is refused or redirected to HTTPS.

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F17-AC4, F17-AC5.

## Edge cases and error handling

Rows from the F17 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The audit write fails during a sensitive change | The change rolls back (F02 AC 13) |

**Out of scope for the whole feature** (verbatim from F17):

- Two-factor sign-in itself, which is built in F01 (US-072).
- Exporting or deleting audit logs from the app.
- Platform-wide (cross-madrasa) super-admin tools.
- Data retention and deletion jobs. The policy is approved (NFR-PRV-005); the jobs are platform work, not part of this feature.

## Dependencies

- **Feature F17 depends on:** F01, F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** F02
- **Other stories referenced:** None
- **Other stories in F17:** [US-069](us-069-review-audit-history.md), [US-070](us-070-protect-account-recovery.md)

## Related screens and UI

- **Feature flow** (from F17): More → Audit history; "View history" on a record ([design.md §13](../../design.md))
- design.md §13 has no row for US-068 (tenant isolation has no screen beyond the permission-denied state).

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `access`, `audit`, `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-068` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC1 (US-068) Madrasa B IDs return not found from Madrasa A on every endpoint (AC-SEC-01)
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC2 (US-068) RLS returns no other-madrasa rows for an unfiltered query
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC3 (US-068) organization_id in body, query, or header is ignored
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC4 (US-068) a removed member is refused and their audit records remain (AC-SEC-05)
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC5 (US-068) plain HTTP is refused or redirected in production config

**Mobile (Maestro):**

- [e2e/mobile/f17-security/reset-revokes-sessions.yaml](../../../e2e/mobile/f17-security/reset-revokes-sessions.yaml) — F17 reset — other sessions signed out; removed member refused

**Unit (Vitest):**

- None

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-068 → SPEC-US-068 (this file)
- **Detailed criteria:** F17-AC1, F17-AC2, F17-AC3, F17-AC4, F17-AC5
- **Requirements:** FR-SEC-001, FR-SEC-002, FR-SEC-008, FR-SEC-009, FR-ORG-005, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007
- **SRS acceptance tests:** AC-SEC-01, AC-SEC-05
- **Business rules:** None
- **Design:** none; **Architecture:** ARCHITECTURE.md §18 epic 17
- **Previous location:** `docs/specs/F17-security-audit-admin.md`
