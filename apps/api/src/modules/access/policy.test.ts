// F02 · Organization and roles — unit: can(actor, action, resource) (docs/specs/03-f02-organization-roles/)
import { describe, it } from 'vitest';

describe('F02 · default organization settings', () => {
  it.todo('F02-AC1 (US-007) a new madrasa defaults to Asia/Karachi, Monday week start, and SINGLE daily-report mode');
});

describe('F02 · can() — workspace settings', () => {
  it.todo('F02-AC2 (US-007) Owner and Admin may update name, timezone, and week start');
  it.todo('F02-AC4 (US-007) Teacher, Student, and Parent may not update workspace settings');
});

describe('F02 · can() — scope', () => {
  it.todo('F02-AC6 (US-008) Teacher sees only students enrolled in their assigned classes');
  it.todo('F02-AC7 (US-008) an out-of-scope resource resolves to NOT_FOUND, identical to a missing ID');
  it.todo('F02-AC8 (US-008) a Teacher removed from a class loses access to that class');
  it.todo('F02-AC9 (US-008) scope comes from the membership; client-sent organization_id, role, or class is ignored');
  it.todo('F02 unit: Student may access only their own records');
  it.todo('F02 unit: Parent may access only verified, non-revoked linked students');
});

describe('F02 · can() — audit', () => {
  it.todo('F02-AC12 (US-009) no role, including Owner, may edit or delete an audit record');
});
