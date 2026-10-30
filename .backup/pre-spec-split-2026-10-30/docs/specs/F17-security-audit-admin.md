# F17 · Security, audit, and administration

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** More → Audit history; "View history" on a record ([design.md §13](../../design.md))
**Stories:** US-068 – US-070 · **Requirements:** FR-SEC-001…009, FR-AUD-001…004, NFR-SEC-001…007, NFR-PORT-006, FR-AUTH-007

## Context

Student records are private, and every madrasa's data must stay inside that madrasa. This feature enforces tenant isolation as a cross-cutting rule. It also gives Admins a way to review the audit trail that F02 writes, and hardens password recovery.

There is no code yet. This feature builds on:
- the F02 `access` policy and audit writer
- the F01 recovery flow

It adds:
- Postgres row-level security (RLS) as a second line of defense
- the audit query API and screen
- recovery hardening ([ARCHITECTURE.md §7, §15](../../ARCHITECTURE.md))

## User story

- **US-068:** As a madrasa, I want all records scoped to our organization, so that no other madrasa can ever see our students.
- **US-069:** As an authorized Admin, I want to review sensitive changes and record history, so that I can answer "who changed this, and when?".
- **US-070:** As an account owner, I want recovery actions protected by stronger checks and audit, so that nobody can take over my account through password reset.

## Acceptance criteria

1. **(US-068) Given** a user in Madrasa A, **when** they request any Madrasa B record by ID through any endpoint, **then** the response is "not found", identical to a missing ID (AC-SEC-01).
2. **(US-068) Given** a repository query missing its organization filter (a deliberately broken test query), **when** it runs under the app's database role, **then** RLS returns no rows from other madaris.
3. **(US-068) Given** a request that sends a different `organization_id` in the body, query, or header, **when** it is processed, **then** the madrasa comes from the signed-in membership only.
4. **(US-068) Given** a removed member, **when** they make any request, **then** it is refused, and the audit records they created remain (AC-SEC-05).
5. **(US-068) Given** production, **when** any API call is made over plain HTTP, **then** it is refused or redirected to HTTPS.
6. **(US-069) Given** an Admin, **when** they open Audit history, **then** they see a paginated list for their madrasa only, with the actor, action, target, time, and summary, and filters by date, actor, and action.
7. **(US-069) Given** a daily record, **when** an authorized user taps "View history", **then** they see that record's audited changes in time order.
8. **(US-069) Given** a Teacher, Student, or Parent, **when** they try to open the madrasa audit history, **then** they are refused (whether Teachers may see their own actions is open).
9. **(US-069) Given** an audit entry for a password reset, **when** it is displayed, **then** it shows that a reset happened, with no password, OTP, or token.
10. **(US-070) Given** a recovery OTP, **when** it is generated, **then** it is stored only as a hash, expires after the configured time, and becomes invalid after the configured number of wrong tries.
11. **(US-070) Given** more reset requests for one account than the rate limit allows, **when** another is made, **then** no OTP is sent, and the event is audited as rate-limited.
12. **(US-070) Given** a successful password reset, **when** it completes, **then** every session of that account is revoked, and the reset is audited with the time and the requesting device.
13. **(US-070) Given** repeated failed OTP tries across many accounts from one IP, **when** the threshold is passed, **then** further tries from that IP are throttled.

## Out of scope

- 2FA and recovery codes (open, SRS §13 #1).
- Exporting or deleting audit logs from the app.
- Platform-wide (cross-madrasa) super-admin tools.
- Data retention and deletion jobs (policy still open, SRS §13 #6).

## Edge cases

| Situation | What should happen |
|---|---|
| An audit summary refers to a deleted or deactivated user | It still shows their name as it was at the time |
| A very large audit list | Paginated; filters are applied on the server |
| The clock differs between servers | Audit timestamps come from the database clock |
| A suspicious pattern of reset requests | Throttled and audited; showing it to an Admin is part of the open recovery-policy decision |
| The audit write fails during a sensitive change | The change rolls back (F02 AC 13) |

## Open questions

- [ ] May Teachers see audit history of their own actions?
- [ ] Recovery policy details: lockout thresholds, and whether the Admin is alerted (SRS §13 #1).
- [ ] Audit retention period (SRS §13 #6).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F17` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] A cross-tenant probing suite runs every by-ID endpoint with another madrasa's IDs.
- [ ] RLS policies exist on every tenant-owned table, and a CI check fails if a new table has none.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Audit query filters, summary redaction, OTP hashing/expiry/attempt counter, IP throttle | `apps/api/src/modules/audit/**/*.test.ts`, `apps/api/src/modules/identity/recovery*.test.ts` |
| **Integration** | Cross-tenant probing on every endpoint, RLS with a broken query, ignored client org IDs, removed-member refusal, audit list by role, reset session revocation | `apps/api/test/security/*.test.ts`, `apps/api/test/audit/*.test.ts` |
| **Component** | Audit history list and filters, record "View history", refused state for non-admins | `apps/mobile/src/features/audit/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin changes a role → opens Audit history → sees the entry; password reset → old session is signed out | `e2e/api/f17-security.spec.ts`, `e2e/mobile/f17-security/` |

**Traceability:** Each test name starts with its criterion, e.g. `F17-AC02 (US-068) …`. Every AC 1–13 has at least one test.

**Coverage:** ≥80% on new code.
