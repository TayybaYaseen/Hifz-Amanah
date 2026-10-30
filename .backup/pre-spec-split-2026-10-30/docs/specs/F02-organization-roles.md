# F02 · Organization and roles

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Settings → Workspace, Roles and permissions ([design.md §4.16](../../design.md)); every list screen (teacher scope)
**Stories:** US-007 – US-009 · **Requirements:** FR-ORG-001…006, FR-SEC-002/003/007/008/009, FR-AUD-001…003

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

## User story

- **US-007:** As an authorized owner/admin, I want to configure a madrasa workspace, so that the app uses our name, timezone, and week.
- **US-008:** As a madrasa, I want teachers limited to their assigned classes and students, so that student records are seen only by the people who teach them.
- **US-009:** As an Admin, I want sensitive account, role, and access changes recorded in an audit trail, so that we can see who changed what.

## Acceptance criteria

1. **(US-007) Given** a newly created madrasa, **when** its settings are first opened, **then** the timezone is `Asia/Karachi`, the week starts on Monday, and the daily-report mode is "one report per student/date".
2. **(US-007) Given** an Owner or Admin, **when** they save a changed name, timezone, or week start, **then** the change is saved, audited, and used by reports generated afterwards.
3. **(US-007) Given** an empty workspace name, **when** the Admin saves, **then** the name field shows an error and nothing is saved.
4. **(US-007) Given** a Teacher, Student, or Parent, **when** they open workspace settings or call the update endpoint, **then** they see no edit controls and the API returns forbidden.
5. **(US-007) Given** existing daily records, **when** the Admin changes the timezone, **then** the stored `report_date` of every existing record is unchanged.
6. **(US-008) Given** a Teacher assigned only to Class A, **when** they open the student list, **then** only students enrolled in Class A are listed.
7. **(US-008) Given** the same Teacher, **when** they request a Class B student, record, or report by ID, **then** the response is "not found", exactly as for an ID that does not exist.
8. **(US-008) Given** a Teacher removed from Class A, **when** they next sync or make a request, **then** no Class A data is returned. Records they created earlier remain, with them still shown as the recorder.
9. **(US-008) Given** a request whose body contains an `organization_id`, a role, or a class the user is not assigned to, **when** the server processes it, **then** those values are ignored or rejected. Scope always comes from the signed-in membership.
10. **(US-009) Given** any of these actions: account create/deactivate, role or membership change, password reset, guardian link change, note-visibility change, **when** it succeeds, **then** exactly one audit record is written with the actor, action, target, timestamp, and a safe summary.
11. **(US-009) Given** a password reset or account creation, **when** its audit record is read, **then** it contains no password, OTP, or token.
12. **(US-009) Given** any role, including Owner, **when** they try to edit or delete an audit record through the app or API, **then** no such operation exists or it is rejected.
13. **(US-009) Given** a sensitive change whose audit write fails, **when** the transaction ends, **then** the change itself is rolled back too.

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

## Open questions

- [ ] Approve the role/permission matrix ([ARCHITECTURE.md §7.3](../../ARCHITECTURE.md), SRS §13 #2).
- [ ] Are Owner and Admin different in MVP, and how?
- [ ] Who creates the madrasa workspace itself, and how is an individual-teacher workspace onboarded (design.md §11 D1)?
- [ ] May an Admin grant a Teacher wider access, as FR-SEC-003's "unless a specific permission" allows?

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

**Traceability:** Each test name starts with its criterion, e.g. `F02-AC07 (US-008) …`. Every AC 1–13 has at least one test.

**Coverage:** ≥80% on new code.
