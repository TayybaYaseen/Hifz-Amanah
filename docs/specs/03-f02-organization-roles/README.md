# F02 · Organization and roles

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Settings → Workspace, Roles and permissions ([design.md §4.16](../../design.md)); every list screen (teacher scope)
**Requirements:** FR-ORG-001…006, FR-SEC-002/003/007/008/009, FR-AUD-001…003, FR-ORG-007
**Stories:** US-007 – US-009 · **Depends on:** F01
**Build order:** 3 of 17 (dependency level 1)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-007](us-007-create-madrasa-workspace.md) | US-007 — Create madrasa workspace | F02-AC1, F02-AC2, F02-AC3, F02-AC4, F02-AC5, F02-AC15, F02-AC16 |
| [SPEC-US-008](us-008-restrict-teacher-scope.md) | US-008 — Restrict teacher scope | F02-AC6, F02-AC7, F02-AC8, F02-AC9, F02-AC14 |
| [SPEC-US-009](us-009-audit-sensitive-changes.md) | US-009 — Audit sensitive changes | F02-AC10, F02-AC11, F02-AC12, F02-AC13 |

## Context

A madrasa is a workspace that owns all of its records. Inside it:
- Owners and Admins configure the madrasa.
- Teachers see only the classes and students assigned to them.
- Sensitive changes are recorded in an audit trail.

There is no code yet. This feature builds the following, on top of F01:
- the `organization` module: the `organizations` and `memberships` tables, and timezone and week-start settings
- the `access` policy layer ([ARCHITECTURE.md §7.2–7.3](../../ARCHITECTURE.md))
- the append-only `audit` writer ([ARCHITECTURE.md §15](../../ARCHITECTURE.md))

The daily-report mode setting belongs to F05 (US-019). Viewing the audit history belongs to F17 (US-069).

## Out of scope

- Viewing or searching audit history (F17, US-069).
- Per-user custom permissions beyond the approved role matrix.
- One account belonging to several madaris (FR-AUTH-011).
- Billing, subscriptions, or deleting a madrasa.
- Choosing the daily-report mode (F05, US-019).

## Edge cases

| Situation | What should happen |
|---|---|
| A Teacher has no class assignments | Empty state "No classes assigned to you yet"; no data is shown |
| A student is in two classes taught by the same Teacher | The student appears once in that Teacher's lists |
| The Admin tries to remove the last Owner/Admin | Blocked, with the message "A madrasa needs at least one Admin" |
| A Teacher is offline when their assignment is removed | Local edits remain visible but cannot sync. On reconnect, the sync is refused as access revoked (F12) |
| The week start is changed in the middle of a week | Reports recalculate with the new boundaries; the source records are unchanged |

## Open questions (resolved 2026-10-30)

- [x] Approve the role/permission matrix ([ARCHITECTURE.md §7.3](../../ARCHITECTURE.md), SRS §13 #2). **Resolved:** Approved; SRS §17.1 (DEC-B12).
- [x] Are Owner and Admin different in MVP, and how? **Resolved:** Same permissions; only the Owner adds or removes Admins and transfers ownership (DEC-B02, FR-ORG-007).
- [x] Who creates the madrasa workspace itself, and how is an individual-teacher workspace onboarded (design.md §11 D1)? **Resolved:** The platform operator creates each workspace and its first Owner; an individual teacher holds Owner/Admin and Teacher roles (DEC-B01, FR-ORG-001).
- [x] May an Admin grant a Teacher wider access, as FR-SEC-003's "unless a specific permission" allows? **Resolved:** Yes, the "all classes" flag (DEC-B13, FR-SEC-003).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F02` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] A role × endpoint authorization test matrix exists and covers cross-tenant and unassigned-class ID probing.
- [ ] The database role used by the app cannot UPDATE or DELETE `audit_logs`.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | The `can(actor, action, resource)` policy for every role and scope; default organization settings | `apps/api/src/modules/access/**/*.test.ts` |
| **Integration** | Settings update by role, teacher scope on lists and by-ID requests, ignored client-sent org/role, audit write in the same transaction, audit immutability | `apps/api/test/organization/*.test.ts`, `apps/api/test/audit/*.test.ts` |
| **Component** | Settings screen hides edit controls for non-admins; empty state for a Teacher with no classes | `apps/mobile/src/features/settings/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin changes the timezone; a Teacher sees only their own class | `e2e/api/f02-organization.spec.ts`, `e2e/mobile/f02-organization/` |

**Traceability:** Each test name starts with its criterion, e.g. `F02-AC07 (US-008) …`. Every AC 1–16 has at least one test.

**Coverage:** ≥80% on new code.
