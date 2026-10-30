# F17 · Security, audit, and administration

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** More → Audit history; "View history" on a record ([design.md §13](../../design.md))
**Requirements:** FR-SEC-001…009, FR-AUD-001…004, NFR-SEC-001…007, NFR-PORT-006, FR-AUTH-007
**Stories:** US-068 – US-070 · **Depends on:** F01, F02
**Build order:** 5 of 17 (dependency level 2)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-068](us-068-enforce-tenant-isolation.md) | US-068 — Enforce tenant isolation | F17-AC1, F17-AC2, F17-AC3, F17-AC4, F17-AC5 |
| [SPEC-US-069](us-069-review-audit-history.md) | US-069 — Review audit history | F17-AC6, F17-AC7, F17-AC8, F17-AC9, F17-AC14 |
| [SPEC-US-070](us-070-protect-account-recovery.md) | US-070 — Protect account recovery | F17-AC10, F17-AC11, F17-AC12, F17-AC13 |

## Context

Student records are private, and every madrasa's data must stay inside that madrasa. This feature enforces tenant isolation as a cross-cutting rule. It also gives Admins a way to review the audit trail that F02 writes, and hardens password recovery.

There is no code yet. This feature builds on:
- the F02 `access` policy and audit writer
- the F01 recovery flow

It adds:
- Postgres row-level security (RLS) as a second line of defense
- the audit query API and screen
- recovery hardening ([ARCHITECTURE.md §7, §15](../../ARCHITECTURE.md))

## Out of scope

- Two-factor sign-in itself, which is built in F01 (US-072).
- Exporting or deleting audit logs from the app.
- Platform-wide (cross-madrasa) super-admin tools.
- Data retention and deletion jobs. The policy is approved (NFR-PRV-005); the jobs are platform work, not part of this feature.

## Edge cases

| Situation | What should happen |
|---|---|
| An audit summary refers to a deleted or deactivated user | It still shows their name as it was at the time |
| A very large audit list | Paginated; filters are applied on the server |
| The clock differs between servers | Audit timestamps come from the database clock |
| A suspicious pattern of reset requests | Throttled and audited; showing it to an Admin is part of the open recovery-policy decision |
| The audit write fails during a sensitive change | The change rolls back (F02 AC 13) |

## Open questions (resolved 2026-10-30)

- [x] May Teachers see audit history of their own actions? **Resolved:** Yes, their own actions only (DEC-B16, FR-AUD-004).
- [x] Recovery policy details: lockout thresholds, and whether the Admin is alerted (SRS §13 #1). **Resolved:** See FR-AUTH-014; locks are visible to the Admin with no active alert (DEC-B10).
- [x] Audit retention period (SRS §13 #6). **Resolved:** 5 years (DEC-B44, NFR-PRV-005).

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

**Traceability:** Each test name starts with its criterion, e.g. `F17-AC02 (US-068) …`. Every AC 1–14 has at least one test.

**Coverage:** ≥80% on new code.
