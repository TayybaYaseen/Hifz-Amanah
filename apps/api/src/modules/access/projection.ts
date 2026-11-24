// Audience projection: the single choke point between domain data and any outbound payload (ARCHITECTURE.md
// §7.4, ADR-007). Every API response, export, and (from F16) push payload for a Student or Parent is built here.
//
// - STAFF (Owner, Admin, assigned Teacher; the caller has already authorized the row) receives the row as stored,
//   internal notes included.
// - STUDENT and PARENT receive only allowlisted entities, each rebuilt from an allowlist of fields. An entity that is
//   not listed yields no fields at all (fail closed): a new staff field can never leak by default.
//
// The Student/Parent rules (F10; FR-PORT-003, FR-PORT-004, FR-PORT-006, FR-SEC-006, FR-RPT-010; DEC-B36):
// - Staff text (attempt remarks, mistake notes) appears only when its visibility is exactly SHARED. An INTERNAL note
//   (the default, "Private to staff") is absent, not blanked (F07-AC15, F09-AC15, F10-AC10, AC11).
// - A report reaches them only as a `published_report` whose period is published; anything else projects to nothing
//   (F10-AC3). Unpublished periods are also never loaded (the portal queries published rows only); this is the second
//   lock.
// - The FR-PORT-006 field set: attendance, portions with quantities and statuses, quality numbers (the label is the
//   app's, from the one approved scale), mistake counts by category, the overall label, confirmed homework, remarks
//   and mistake notes marked visible, and the teacher's name. Never internal notes, Leave reasons (reports carry none),
//   draft homework (the draft count and a draft "carried into" link are dropped), AI output, audit, or sync details
//   (the provisional state and the excluded-records list are dropped) (F10-AC17).
import { textForFamily } from '@hifz/domain/mistakes';

export const AUDIENCES = ['STAFF', 'STUDENT', 'PARENT'] as const;
export type Audience = (typeof AUDIENCES)[number];

export type Fields = Readonly<Record<string, unknown>>;

const list = (value: unknown): Fields[] => (Array.isArray(value) ? (value as Fields[]) : []);
const obj = (value: unknown): Fields => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : {});

function familyMistake(f: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = { category: f.category, severity: f.severity, repeated: f.repeated };
  const note = textForFamily(f.note, f.noteVisibility);
  if (note !== null) out.note = note;
  return out;
}

/** One portion line of a report: remarks only when SHARED, mistakes through familyMistake. */
function familyLine(p: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = {
    portionId: p.portionId,
    recordId: p.recordId,
    date: p.date,
    section: p.section,
    position: p.position,
    isExtra: p.isExtra,
    paraNumber: p.paraNumber,
    range: p.range,
    totalLines: p.totalLines,
    assigned: p.assigned,
    status: p.status,
    completed: p.completed,
    remaining: p.remaining,
    quality: p.quality,
    mistakeCount: p.mistakeCount,
    mistakes: list(p.mistakes).map(familyMistake),
    attempts: list(p.attempts).map((a) => ({ attemptNo: a.attemptNo, attemptedAt: a.attemptedAt, status: a.status, completed: a.completed, quality: a.quality, mistakeCount: a.mistakeCount })),
  };
  const remarks = textForFamily(p.remarks, p.remarksVisibility);
  if (remarks !== null) out.remarks = remarks;
  return out;
}

/** A section: pending portions keep a "carried into" link only to confirmed homework (no draft homework). */
function familySection(s: Fields): Record<string, unknown> {
  return {
    section: s.section,
    portionCount: s.portionCount,
    totals: s.totals,
    extraTotals: s.extraTotals,
    statusCounts: s.statusCounts,
    paras: s.paras,
    pending: list(s.pending).map((p) => {
      const into = obj(p.carriedInto);
      return {
        portionId: p.portionId,
        date: p.date,
        paraNumber: p.paraNumber,
        range: p.range,
        assigned: p.assigned,
        completed: p.completed,
        remaining: p.remaining,
        status: p.status,
        carriedInto: into.status === 'CONFIRMED' ? { assignmentId: into.assignmentId, state: into.state } : null,
      };
    }),
    quality: s.quality,
    mistakes: s.mistakes,
  };
}

/** Confirmed homework only: the draft count is dropped (FR-PORT-006). */
function familyHomework(h: Fields): Record<string, unknown> {
  return {
    confirmed: h.confirmed,
    assigned: h.assigned,
    attempted: h.attempted,
    completed: h.completed,
    carriedForward: h.carriedForward,
    carriedOver: h.carriedOver,
    outstanding: h.outstanding,
    outstandingItems: list(h.outstandingItems).map((i) => ({
      id: i.id,
      assignedDate: i.assignedDate,
      dueDate: i.dueDate,
      state: i.state,
      carriedOverReason: i.carriedOverReason,
      portionCount: i.portionCount,
    })),
  };
}

/**
 * A weekly/monthly report (F09, @hifz/domain/reports StudentReport) in the FR-PORT-006 field set. `today`, the
 * provisional (sync) state, and the excluded-records list are not part of it.
 */
function familyReport(f: Fields): Record<string, unknown> {
  const attendance = obj(f.attendance);
  return {
    period: f.period,
    student: { id: obj(f.student).id, name: obj(f.student).name },
    classes: f.classes,
    hasData: f.hasData,
    attendance: {
      counts: attendance.counts,
      days: list(attendance.days).map((d) => ({ date: d.date, classId: d.classId, kind: d.kind, category: d.category, exceptionLabel: d.exceptionLabel })),
    },
    sections: list(f.sections).map(familySection),
    days: list(f.days).map((d) => ({
      recordId: d.recordId,
      date: d.date,
      classId: d.classId,
      sessionLabel: d.sessionLabel,
      overallLabel: d.overallLabel,
      attendance: d.attendance,
      portions: list(d.portions).map(familyLine),
      quality: d.quality,
    })),
    quality: f.quality,
    qualityTrend: f.qualityTrend,
    mistakes: f.mistakes,
    overallLabels: f.overallLabels,
    recurringDifficulties: f.recurringDifficulties,
    homework: familyHomework(obj(f.homework)),
  };
}

/**
 * A published report as the portal sends it (GET /portal/reports/:id). Only a published period projects to anything
 * (F10-AC3): `published` must be exactly true and `publishedAt` set, or the result is empty.
 */
function familyPublishedReport(f: Fields): Record<string, unknown> {
  if (f.published !== true || typeof f.publishedAt !== 'string') return {};
  return {
    id: f.id,
    publishedAt: f.publishedAt,
    updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : null,
    teachers: list(f.teachers).map((t) => ({ name: t.name })),
    report: familyReport(obj(f.report)),
    generatedAt: f.generatedAt,
  };
}

/** One row of the published-report list; an unpublished row projects to nothing (F10-AC3). */
function familyPublishedPeriod(f: Fields): Record<string, unknown> {
  if (f.published !== true || typeof f.publishedAt !== 'string') return {};
  return { id: f.id, kind: f.kind, from: f.from, to: f.to, publishedAt: f.publishedAt, updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : null };
}

/**
 * Student/Parent field sets per entity. An entity not listed here yields no fields for those audiences: the F09 class
 * summary (`class_summary`) is staff only and is deliberately absent (FR-RPT-011), as are attempts and daily records
 * read on their own (staff routes).
 */
const FAMILY_PROJECTIONS: Readonly<Record<string, (fields: Fields) => Record<string, unknown>>> = {
  attempt_mistake: familyMistake,
  report: familyReport,
  published_report: familyPublishedReport,
  published_period: familyPublishedPeriod,
  portal_student: (f) => ({ id: f.id, name: f.name }),
  export_daily_record_row: familyExportRow,
};

/**
 * One DailyRecords export row for a student/guardian file (F14-AC17, FR-XLS-007, BR-13): the portion, its result, and
 * the mistake count; the remark only when the Teacher shared it. Never an internal note.
 */
function familyExportRow(f: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = {
    externalRecordId: f.externalRecordId,
    externalStudentId: f.externalStudentId,
    recordDate: f.recordDate,
    sessionLabel: f.sessionLabel,
    section: f.section,
    position: f.position,
    paraNumber: f.paraNumber,
    surahStart: f.surahStart,
    ayahStart: f.ayahStart,
    surahEnd: f.surahEnd,
    ayahEnd: f.ayahEnd,
    totalLines: f.totalLines,
    assigned: f.assigned,
    completed: f.completed,
    unit: f.unit,
    mistakeCount: f.mistakeCount,
    status: f.status,
    quality: f.quality,
  };
  const remarks = textForFamily(f.remarks, f.remarksVisibility);
  if (remarks !== null) out.remarks = remarks;
  return out;
}

/**
 * Returns the fields of one `entity` row that `audience` may receive. STAFF (Owner, Admin, assigned Teacher;
 * the caller has already authorized the row) receives the row as stored, internal notes included.
 */
export function projectFor(audience: Audience, entity: string, fields: Fields): Record<string, unknown> {
  switch (audience) {
    case 'STAFF':
      return { ...fields };
    case 'STUDENT':
    case 'PARENT': {
      // Fail closed: only allowlisted entities, and only their allowlisted fields.
      const project = Object.hasOwn(FAMILY_PROJECTIONS, entity) ? FAMILY_PROJECTIONS[entity] : undefined;
      return project ? project(fields) : {};
    }
    default:
      throw new Error('projectFor: unknown audience');
  }
}

/** The audience of a signed-in role (Owner, Admin, Teacher → STAFF). */
export function audienceOf(role: 'OWNER' | 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT'): Audience {
  return role === 'STUDENT' ? 'STUDENT' : role === 'PARENT' ? 'PARENT' : 'STAFF';
}
