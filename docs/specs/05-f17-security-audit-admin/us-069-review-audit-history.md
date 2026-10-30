# SPEC-US-069 · Review audit history

| | |
|---|---|
| **Spec ID** | SPEC-US-069 |
| **User story** | US-069 |
| **Feature** | [F17 · Security, audit, and administration](README.md) |
| **Epic** | EPIC 17 — Security, Audit, and Administration ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F17-security-audit-admin.md` on 2026-10-30 |

## User story

**US-069 — Review audit history**

As an authorized Admin, I want to review sensitive changes and record history; as a Teacher, I want to see the history of my own actions.

Spec wording (from F17):

- **US-069:** As an authorized Admin, I want to review sensitive changes and record history, so that I can answer "who changed this, and when?".

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

- **Functional:** FR-AUD-001, FR-AUD-002, FR-AUD-003, FR-AUD-004
- **Non-functional:** NFR-PORT-006
- **SRS acceptance tests cited:** None

Feature requirement set (verbatim from F17): FR-SEC-001…009, FR-AUD-001…004, NFR-SEC-001…007, NFR-PORT-006, FR-AUTH-007

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Protected operations are authorized server-side against the active organization and role.
2. Sensitive actions retain actor, timestamp, target, and change context without logging unnecessary secrets.

### Detailed acceptance criteria

From the F17 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F17-AC6** — **(US-069) Given** an Admin, **when** they open Audit history, **then** they see a paginated list for their madrasa only, with the actor, action, target, time, and summary, and filters by date, actor, and action.
- **F17-AC7** — **(US-069) Given** a daily record, **when** an authorized user taps "View history", **then** they see that record's audited changes in time order.
- **F17-AC8** — **(US-069) Given** a Student or Parent, **when** they try to open audit history, **then** they are refused. **Given** a Teacher, **when** they request the madrasa audit history or another user's entries, **then** they are refused. *(Revised 2026-10-30, DEC-B16.)*
- **F17-AC9** — **(US-069) Given** an audit entry for a password reset, **when** it is displayed, **then** it shows that a reset happened, with no password, OTP, or token.
- **F17-AC14** — **(US-069) Given** a Teacher, **when** they open audit history, **then** they see only entries for their own actions. *(Added 2026-10-30, DEC-B16.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F17-AC8.

## Edge cases and error handling

Rows from the F17 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| An audit summary refers to a deleted or deactivated user | It still shows their name as it was at the time |
| A very large audit list | Paginated; filters are applied on the server |
| The clock differs between servers | Audit timestamps come from the database clock |

**Out of scope for the whole feature** (verbatim from F17):

- Two-factor sign-in itself, which is built in F01 (US-072).
- Exporting or deleting audit logs from the app.
- Platform-wide (cross-madrasa) super-admin tools.
- Data retention and deletion jobs. The policy is approved (NFR-PRV-005); the jobs are platform work, not part of this feature.

## Dependencies

- **Feature F17 depends on:** F01, F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F17:** [US-068](us-068-enforce-tenant-isolation.md), [US-070](us-070-protect-account-recovery.md)

## Related screens and UI

- **Feature flow** (from F17): More → Audit history; "View history" on a record ([design.md §13](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-009, US-069 | §3.2 More → Audit history; "View history" on a record | Paginated list with filters | No records | — | Shown to authorized roles only |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `access`, `audit`, `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-069` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC6 (US-069) Audit history is paginated, madrasa-scoped, and filterable
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC7 (US-069) a record history lists its audited changes in order
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC8 (US-069) Students and Parents cannot read audit history; Teachers cannot read others
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC9 (US-069) a password reset audit entry has no secrets
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC14 (US-069) a Teacher sees audit entries for their own actions only

**Mobile (Maestro):**

- [e2e/mobile/f17-security/audit-history.yaml](../../../e2e/mobile/f17-security/audit-history.yaml) — F17 audit — Admin history, record history, other roles refused
- [e2e/mobile/f17-security/teacher-own-audit.yaml](../../../e2e/mobile/f17-security/teacher-own-audit.yaml) — F17 Teacher sees own audit actions

**Unit (Vitest):**

- [apps/api/src/modules/audit/audit.test.ts](../../../apps/api/src/modules/audit/audit.test.ts) — F17-AC6 (US-069) results are limited to the madrasa, paginated, and filterable by date, actor, and action
- [apps/api/src/modules/audit/audit.test.ts](../../../apps/api/src/modules/audit/audit.test.ts) — F17-AC7 (US-069) a record history lists its audited changes in time order
- [apps/api/src/modules/audit/audit.test.ts](../../../apps/api/src/modules/audit/audit.test.ts) — F17-AC9 (US-069) a password-reset summary shows the reset happened with no password, OTP, or token

## Open decisions and blockers

Open questions from F17 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] May Teachers see audit history of their own actions? **Resolved:** Yes, their own actions only (DEC-B16, FR-AUD-004).
- [x] Audit retention period (SRS §13 #6). **Resolved:** 5 years (DEC-B44, NFR-PRV-005).

## Traceability

- **Story:** US-069 → SPEC-US-069 (this file)
- **Detailed criteria:** F17-AC6, F17-AC7, F17-AC8, F17-AC9, F17-AC14
- **Requirements:** FR-AUD-001, FR-AUD-002, FR-AUD-003, FR-AUD-004, NFR-PORT-006
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 17
- **Previous location:** `docs/specs/F17-security-audit-admin.md`
