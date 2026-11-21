// Audience projection: the single choke point between domain data and any outbound payload (ARCHITECTURE.md
// §7.4, ADR-007). F12 adds the minimal hook the sync pull and conflict routes need (STAFF audience). The
// Student/Parent rules (internal notes, unpublished periods, FR-PORT-006 field set) arrive with F10; until
// then those audiences fail closed and receive no fields at all, except for the per-entity allowlist below.
//
// F07 adds the first allowlisted entity, `attempt_mistake` (FR-ATT-012, FR-PORT-006 "mistake counts by category;
// remarks and mistake notes marked visible"): the category, severity, and repeated flag, plus the note only when the
// Teacher made it SHARED. An INTERNAL note (the default) is absent, not blanked (F07-AC15). F10 adds the other
// entities and the published-period rule.
import { noteForFamily, type NoteVisibility } from '@hifz/domain/mistakes';

export const AUDIENCES = ['STAFF', 'STUDENT', 'PARENT'] as const;
export type Audience = (typeof AUDIENCES)[number];

export type Fields = Readonly<Record<string, unknown>>;

function familyMistake(f: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = { category: f.category, severity: f.severity, repeated: f.repeated };
  const visibility: NoteVisibility = f.noteVisibility === 'SHARED' ? 'SHARED' : 'INTERNAL';
  const note = noteForFamily({ note: typeof f.note === 'string' ? f.note : null, noteVisibility: visibility });
  if (note !== null) out.note = note;
  return out;
}

const list = (value: unknown): Fields[] => (Array.isArray(value) ? (value as Fields[]) : []);

/**
 * A weekly/monthly report (F09, @hifz/domain/reports StudentReport) for a Student or Parent. The only free text in a
 * report is on its portion lines: attempt remarks (always internal staff text, FR-WKR-008) and mistake notes. Each
 * portion line is rebuilt from an allowlist, so remarks are absent and a mistake keeps its note only when SHARED
 * (F09-AC15). Counts, totals, and dates carry no text. F10 applies the published-period rule and the FR-PORT-006
 * field set on top of this.
 */
function familyReport(f: Fields): Record<string, unknown> {
  const line = (p: Fields): Record<string, unknown> => ({
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
    attempts: p.attempts,
  });
  return {
    period: f.period,
    today: f.today,
    student: f.student,
    classes: f.classes,
    hasData: f.hasData,
    attendance: f.attendance,
    sections: f.sections,
    days: list(f.days).map((d) => ({
      recordId: d.recordId,
      date: d.date,
      classId: d.classId,
      sessionLabel: d.sessionLabel,
      overallLabel: d.overallLabel,
      attendance: d.attendance,
      portions: list(d.portions).map(line),
      quality: d.quality,
    })),
    quality: f.quality,
    qualityTrend: f.qualityTrend,
    mistakes: f.mistakes,
    overallLabels: f.overallLabels,
    recurringDifficulties: f.recurringDifficulties,
    homework: f.homework,
  };
}

/**
 * Student/Parent field sets per entity. An entity not listed here yields no fields for those audiences: the F09 class
 * summary (`class_summary`) is staff only and is deliberately absent (FR-RPT-011).
 */
const FAMILY_PROJECTIONS: Readonly<Record<string, (fields: Fields) => Record<string, unknown>>> = {
  attempt_mistake: familyMistake,
  report: familyReport,
};

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
