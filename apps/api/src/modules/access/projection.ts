// Audience projection: the single choke point between domain data and any outbound payload (ARCHITECTURE.md
// §7.4, ADR-007). F12 adds the minimal hook the sync pull and conflict routes need (STAFF audience). The
// Student/Parent rules (internal notes, unpublished periods, FR-PORT-006 field set) arrive with F10; until
// then those audiences fail closed and receive no fields at all.
export const AUDIENCES = ['STAFF', 'STUDENT', 'PARENT'] as const;
export type Audience = (typeof AUDIENCES)[number];

export type Fields = Readonly<Record<string, unknown>>;

/**
 * Returns the fields of one `entity` row that `audience` may receive. STAFF (Owner, Admin, assigned Teacher;
 * the caller has already authorized the row) receives the row as stored, internal notes included.
 */
export function projectFor(audience: Audience, entity: string, fields: Fields): Record<string, unknown> {
  switch (audience) {
    case 'STAFF':
      return { ...fields };
    case 'STUDENT':
    case 'PARENT':
      // F10 adds the per-entity allowlist for Student/Parent audiences. Fail closed until it exists.
      void entity;
      return {};
    default:
      throw new Error('projectFor: unknown audience');
  }
}
