# F02 plan — Organization and roles

**Branch:** `feature/f02-organization-roles`, from `origin/main` (`bcf3b05`, F01 merged). It does not contain F11.
**Specs:** `docs/specs/03-*` · **Stories:** US-007, US-008, US-009 · **Requirements:** FR-ORG-001…007, FR-SEC-003,
FR-SEC-008/009, FR-AUD-*, SRS §17.1 (DEC-B12), DEC-B01, DEC-B02, DEC-B13 · **Status:** plan agreed, no code yet.

## Decisions taken with the user (2026-11-06)

| Topic | Decision |
|---|---|
| Criteria that need classes, students, or daily records (F03, F05) | Build the access policy and test it at unit level now. Keep those E2E tests pending. The F02 gate stays PENDING until F03/F05 exist |
| How the Owner adds or removes an Admin | By changing an existing member's role: Teacher → Admin, Admin → Teacher. F01's create-account endpoint keeps excluding Admin |
| Ownership transfer | Grants the Owner role to an active Admin. **The former Owner stays Owner**, so a madrasa may have several Owners. At least one Owner always remains (FR-ORG-007) |

## Still open (not built until answered)

- **Removing an Owner.** Several Owners are now possible. Can an Owner demote *another* Owner, or only step down
  themselves? Proposed default: only themselves, and only while another active Owner remains. Needs confirmation.
- **Production onboarding tooling.** FR-ORG-001: the platform operator creates each workspace and its first Owner.
  F02 adds this to the test-control API only (needed by F02-AC1). An operator CLI or console is not specified.

## Already in place from F01

`organizations` (`timezone` default `Asia/Karachi`, `week_start` default `MONDAY`, `daily_report_mode` default
`SINGLE`), `memberships` (`role`, `status`, `all_classes`), `audit_logs`, same-transaction audit writes for account
actions, membership re-checked on every request.

## API contract

Errors use the F01 shape `{ error: { code, message, fields? } }`. Organization and role always come from the
signed-in membership; any `organizationId`, `role`, or scope field in a body is rejected by the strict schema
(F02-AC9).

| Method and path | Who | Body | Success | Refusals |
|---|---|---|---|---|
| `GET /organization` | any member | — | `200 { id, name, kind, timezone, weekStart, dailyReportMode, canEdit }` | — |
| `PATCH /organization` | Owner, Admin | `{ name?, timezone?, weekStart? }` only | `200` settings; one `ORGANIZATION_UPDATED` audit with before/after | `400 fields.name: REQUIRED` (blank), `fields.timezone: INVALID` (not IANA), `fields.weekStart: INVALID`; `403 FORBIDDEN` for Teacher/Student/Parent |
| `POST /accounts/:id/role` | Owner | `{ role: 'ADMIN' \| 'TEACHER' }` | `200` account; `ADMIN_ADDED` or `ADMIN_REMOVED` audit. A new Admin must set up two-factor at next sign-in (FR-AUTH-016); their sessions end | `403` for Admin; `409 LAST_ADMIN` when removing the last Owner/Admin ("A madrasa needs at least one Admin"); `400` if the target is Student/Parent/Owner; `404` outside the madrasa |
| `POST /accounts/:id/owner` | Owner | — | `200` account; target Admin becomes Owner; `OWNER_ADDED` audit | `403` for Admin; `400` unless the target is an active Admin |
| `POST /accounts/:id/all-classes` | Owner, Admin | `{ allClasses: boolean }` | `200` account; `ALL_CLASSES_SET` or `ALL_CLASSES_CLEARED` audit | `403` for Teacher; `400` unless the target is a Teacher |

No route creates an organization, signs up, or edits or deletes an audit record (F02-AC12, AC16).

## Build steps

1. **Contracts** (`packages/contracts/src/organization.ts`): settings response, strict patch schema, `WEEK_DAYS`,
   role-change and all-classes bodies, new error codes `LAST_ADMIN`.
2. **Migration `0003_organization_roles.sql`:** trigger that rejects `UPDATE` and `DELETE` on `audit_logs` for
   every database role the API uses (defense in depth for F02-AC12). No change to existing columns.
3. **Access policy** (`apps/api/src/modules/access/policy.ts`, pure): `can(actor, action, resource)` for the
   SRS §17.1 matrix, and `scopeOf(membership, assignedClassIds)`, where Teacher scope is the assigned classes or
   every class with `all_classes`. Out-of-scope resolves to `NOT_FOUND`, identical to a missing ID. Assigned
   classes are an input; F03 supplies them from its tables.
4. **Organization module** (`apps/api/src/modules/organization/`): settings service and routes, role changes,
   Owner grant, all-classes flag. Each in one transaction with its audit record.
5. **Test control:** `POST /__test/organizations` (operator creates a workspace and its first Owner) and
   `POST /__test/audit/fail-next` (the next audit write throws, for F02-AC13).
6. **Mobile:** Settings → Madrasa (edit for Owner/Admin, read-only text with no controls otherwise); Account detail:
   "Make Admin" / "Remove Admin" / "Make Owner" for the Owner, "All classes" switch for Owner/Admin on Teachers.
   Strings in all three locales.
7. **Tests:** turn the policy `it.todo`s and the buildable `test.fixme`s into real tests; update the Maestro flows
   for the screens built here.

## Acceptance criteria: what F02 can and cannot finish

| Criterion | Can pass in F02? | Waits for |
|---|---|---|
| AC1, AC3, AC4, AC11, AC12, AC13, AC15, AC16 | Yes | — |
| AC2 | Save + audit: yes. "Used by reports generated afterwards": no | Weekly report (F09) |
| AC9 | Body `organizationId`/role rejected: yes. "A class the user is not assigned to": no | Classes (F03), daily records (F05) |
| AC10 | Account create/deactivate, role and membership change, password reset: yes | Guardian links (F10), note visibility (F05/F07) |
| AC14 | Setting/clearing audited, Teacher cannot set: yes. Wider scope over classes: unit only | Classes and students (F03) |
| AC5 | No | Daily records with `report_date` (F05) |
| AC6, AC7, AC8 | Unit only | Classes, students, enrollments, assignments (F03) |

Mobile: `workspace-settings.yaml` step 3 (weekly report header) waits for F09; `teacher-scope.yaml` waits for F03.
`no-self-signup.yaml` can be completed. All mobile gates stay BLOCKED until DEC-B55.

**Expected F02 gate result: PENDING.** Not complete until F03, F05, F09, and F10 supply the missing parts.
