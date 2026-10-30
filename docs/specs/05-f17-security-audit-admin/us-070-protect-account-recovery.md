# SPEC-US-070 · Protect account recovery

| | |
|---|---|
| **Spec ID** | SPEC-US-070 |
| **User story** | US-070 |
| **Feature** | [F17 · Security, audit, and administration](README.md) |
| **Epic** | EPIC 17 — Security, Audit, and Administration ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F17-security-audit-admin.md` on 2026-10-30 |

## User story

**US-070 — Protect account recovery**

As an account owner, I want sensitive recovery actions protected by stronger verification and audit controls.

Spec wording (from F17):

- **US-070:** As an account owner, I want recovery actions protected by stronger checks and audit, so that nobody can take over my account through password reset.

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

- **Functional:** FR-AUTH-007, FR-AUTH-014
- **Non-functional:** NFR-SEC-003
- **SRS acceptance tests cited:** None

Feature requirement set (verbatim from F17): FR-SEC-001…009, FR-AUD-001…004, NFR-SEC-001…007, NFR-PORT-006, FR-AUTH-007

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. A recovery OTP is sent only to the registered email address and is time-limited and rate-limited.
2. A password reset is allowed only after valid OTP verification; expired/invalid OTPs are rejected.

### Detailed acceptance criteria

From the F17 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F17-AC10** — **(US-070) Given** a recovery OTP, **when** it is generated, **then** it is stored only as a hash, expires after the configured time, and becomes invalid after the configured number of wrong tries.
- **F17-AC11** — **(US-070) Given** more reset requests for one account than the rate limit allows, **when** another is made, **then** no OTP is sent, and the event is audited as rate-limited.
- **F17-AC12** — **(US-070) Given** a successful password reset, **when** it completes, **then** every session of that account is revoked, and the reset is audited with the time and the requesting device.
- **F17-AC13** — **(US-070) Given** repeated failed OTP tries across many accounts from one IP, **when** the threshold is passed, **then** further tries from that IP are throttled.

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F17-AC10.

## Edge cases and error handling

Rows from the F17 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A suspicious pattern of reset requests | Throttled and audited; showing it to an Admin is part of the open recovery-policy decision |

**Out of scope for the whole feature** (verbatim from F17):

- Two-factor sign-in itself, which is built in F01 (US-072).
- Exporting or deleting audit logs from the app.
- Platform-wide (cross-madrasa) super-admin tools.
- Data retention and deletion jobs. The policy is approved (NFR-PRV-005); the jobs are platform work, not part of this feature.

## Dependencies

- **Feature F17 depends on:** F01, F02 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F17:** [US-068](us-068-enforce-tenant-isolation.md), [US-069](us-069-review-audit-history.md)

## Related screens and UI

- **Feature flow** (from F17): More → Audit history; "View history" on a record ([design.md §13](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-002, US-070 | §4.2 Forgot password | User ID → OTP → new password | Offline; OTP expired; too many attempts | Neutral confirmation that never reveals whether the User ID exists | OTP field announces expiry time |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `access`, `audit`, `identity`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F17-AC12.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-070` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC10 (US-070) an OTP is hashed, expires, and dies after wrong tries
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC11 (US-070) over-limit reset requests send nothing and are audited as rate-limited
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC12 (US-070) a reset revokes every session and audits time and device
- [e2e/api/f17-security.spec.ts](../../../e2e/api/f17-security.spec.ts) — F17-AC13 (US-070) many failed OTP tries from one IP throttle that IP

**Mobile (Maestro):**

- [e2e/mobile/f17-security/reset-revokes-sessions.yaml](../../../e2e/mobile/f17-security/reset-revokes-sessions.yaml) — F17 reset — other sessions signed out; removed member refused

**Unit (Vitest):**

- [apps/api/src/modules/identity/recovery.test.ts](../../../apps/api/src/modules/identity/recovery.test.ts) — F17-AC10 (US-070) an OTP is stored only as a hash
- [apps/api/src/modules/identity/recovery.test.ts](../../../apps/api/src/modules/identity/recovery.test.ts) — F17-AC10 (US-070) an OTP expires after the configured time
- [apps/api/src/modules/identity/recovery.test.ts](../../../apps/api/src/modules/identity/recovery.test.ts) — F17-AC10 (US-070) an OTP is invalid after the configured number of wrong tries
- [apps/api/src/modules/identity/recovery.test.ts](../../../apps/api/src/modules/identity/recovery.test.ts) — F17-AC11 (US-070) over the per-account limit, no OTP is sent and a rate-limited event is audited
- [apps/api/src/modules/identity/recovery.test.ts](../../../apps/api/src/modules/identity/recovery.test.ts) — F17-AC13 (US-070) failed OTP tries across many accounts from one IP throttle that IP past the threshold

## Open decisions and blockers

Open questions from F17 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Recovery policy details: lockout thresholds, and whether the Admin is alerted (SRS §13 #1). **Resolved:** See FR-AUTH-014; locks are visible to the Admin with no active alert (DEC-B10).

## Traceability

- **Story:** US-070 → SPEC-US-070 (this file)
- **Detailed criteria:** F17-AC10, F17-AC11, F17-AC12, F17-AC13
- **Requirements:** FR-AUTH-007, NFR-SEC-003, FR-AUTH-014
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 17
- **Previous location:** `docs/specs/F17-security-audit-admin.md`
