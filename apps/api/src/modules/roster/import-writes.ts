// Roster writes for the Excel import (F14; US-058; FR-XLS-001, FR-XLS-005, FR-XLS-012; DEC-B14, DEC-B15). The roster
// module owns the students tables; the import module calls these inside its batch transaction (a tenant transaction)
// after classifying the row against fresh data, so a batch is all-or-nothing (FR-XLS-014).
//
// - A new student gets a profile and an enrollment in the named class from the admission date (or today), exactly as
//   StudentService.create does. No login account is created (FR-XLS-001, F14-AC21).
// - An update changes only the fields the preview showed (name, admission date, notes, status); the class is never
//   changed by an import. Deactivating or reactivating is Owner/Admin only (DEC-B14); the caller checks it.
// - Audited like the in-app change, with `source: IMPORT` and the job id. Field names only, never names or notes.
import { v7 as uuidv7 } from 'uuid';
import type { Tx } from '../../platform/db.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';

export interface ImportedStudent {
  name: string;
  externalStudentId: string | null;
  admissionDate: string | null;
  status: 'ACTIVE' | 'INACTIVE' | null;
  notes: string | null;
  classId: string;
}

/** Inserts the student and their enrollment; returns the new id. */
export async function insertImportedStudent(tx: Tx, actor: Actor, s: ImportedStudent, ctx: { jobId: string; today: string; at: Date }): Promise<string> {
  const id = uuidv7();
  const status = s.status ?? 'ACTIVE';
  const startDate = s.admissionDate ?? ctx.today;
  await tx
    .insertInto('students')
    .values({
      id,
      organization_id: actor.organizationId,
      name: s.name,
      external_student_id: s.externalStudentId,
      admission_date: s.admissionDate,
      private_notes: s.notes,
      status,
      created_at: ctx.at,
      updated_at: ctx.at,
      deactivated_at: status === 'INACTIVE' ? ctx.at : null,
    })
    .execute();
  await tx
    .insertInto('student_enrollments')
    .values({
      id: uuidv7(),
      organization_id: actor.organizationId,
      student_id: id,
      class_id: s.classId,
      start_date: startDate,
      end_date: null,
      created_at: ctx.at,
      created_by: actor.userId,
      ended_at: null,
      ended_by: null,
    })
    .execute();
  await recordAudit(tx, {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: 'STUDENT_CREATED',
    targetType: 'STUDENT',
    targetId: id,
    summary: {
      source: 'IMPORT',
      importJobId: ctx.jobId,
      classId: s.classId,
      startDate,
      status,
      fields: Object.entries({ name: s.name, externalStudentId: s.externalStudentId, admissionDate: s.admissionDate, privateNotes: s.notes })
        .filter(([, v]) => v !== null)
        .map(([k]) => k),
    },
    at: ctx.at,
  });
  return id;
}

export interface ImportedStudentChanges {
  name?: string;
  admissionDate?: string;
  notes?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

/** Applies the previewed field changes to an existing student (update mode, F14-AC14). */
export async function updateImportedStudent(tx: Tx, actor: Actor, studentId: string, set: ImportedStudentChanges, ctx: { jobId: string; at: Date }): Promise<void> {
  const row = await tx
    .selectFrom('students')
    .select(['row_version', 'status'])
    .where('organization_id', '=', actor.organizationId)
    .where('id', '=', studentId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const values: Record<string, unknown> = { updated_at: ctx.at, row_version: Number(row.row_version) + 1 };
  const fields: string[] = [];
  if (set.name !== undefined) {
    values.name = set.name;
    fields.push('name');
  }
  if (set.admissionDate !== undefined) {
    values.admission_date = set.admissionDate;
    fields.push('admissionDate');
  }
  if (set.notes !== undefined) {
    values.private_notes = set.notes;
    fields.push('privateNotes');
  }
  const statusChanged = set.status !== undefined && set.status !== row.status;
  if (statusChanged) {
    values.status = set.status;
    values.deactivated_at = set.status === 'INACTIVE' ? ctx.at : null;
  }
  await tx.updateTable('students').set(values).where('organization_id', '=', actor.organizationId).where('id', '=', studentId).execute();
  if (fields.length) {
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'STUDENT_UPDATED',
      targetType: 'STUDENT',
      targetId: studentId,
      summary: { source: 'IMPORT', importJobId: ctx.jobId, fields },
      at: ctx.at,
    });
  }
  if (statusChanged) {
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: set.status === 'INACTIVE' ? 'STUDENT_DEACTIVATED' : 'STUDENT_REACTIVATED',
      targetType: 'STUDENT',
      targetId: studentId,
      summary: { source: 'IMPORT', importJobId: ctx.jobId, from: row.status, to: set.status },
      at: ctx.at,
    });
  }
}
