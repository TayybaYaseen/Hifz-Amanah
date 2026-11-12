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

/** Student/Parent field sets per entity. An entity not listed here yields no fields for those audiences. */
const FAMILY_PROJECTIONS: Readonly<Record<string, (fields: Fields) => Record<string, unknown>>> = {
  attempt_mistake: (f) => {
    const out: Record<string, unknown> = { category: f.category, severity: f.severity, repeated: f.repeated };
    const visibility: NoteVisibility = f.noteVisibility === 'SHARED' ? 'SHARED' : 'INTERNAL';
    const note = noteForFamily({ note: typeof f.note === 'string' ? f.note : null, noteVisibility: visibility });
    if (note !== null) out.note = note;
    return out;
  },
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
