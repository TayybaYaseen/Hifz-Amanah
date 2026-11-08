// F12 · Offline and synchronization — unit: conflicts and merges (docs/specs/04-f12-offline-sync.md)
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { detect } from './conflict.ts';
import { closeConflict, fieldDiff, resolve, type ConflictRecord } from './resolve.ts';
import { classOf, defineFieldSpec, FieldSpecError, groupOf, missingGroupMembers, SYNC_PROBE_FIELDS, valuesEqual } from './fields.ts';

// Illustrative specs: the real field names arrive with F04/F05/F08. Coupled groups follow plan Q5.
const attemptSpec = defineFieldSpec({
  entity: 'portion_attempt',
  groups: [['status', 'completed', 'quality', 'mistakes']],
});
const portionSpec = defineFieldSpec({ entity: 'lesson_portion', safe: { position: 'SERVER_WINS' } });
const attendanceSpec = defineFieldSpec({
  entity: 'attendance_record',
  groups: [['status', 'leaveReason', 'leaveStatus', 'absentNote']],
});

const half = { unit: 'PARA', numerator: 1, denominator: 2 };
const full = { unit: 'PARA', numerator: 1, denominator: 1 };

describe('F12 · conflict detection', () => {
  it('F12-AC11 (US-054) two edits to a portion status from the same base version create a conflict holding both versions', () => {
    const base = { status: 'PENDING', completed: null, quality: null, mistakes: null };
    const device = { status: 'PARTIAL', completed: half };
    const server = { status: 'COMPLETED', completed: full, quality: null, mistakes: null };
    const result = detect({ base, local: device, server }, attemptSpec);
    expect(result.kind).toBe('CONFLICT');
    if (result.kind !== 'CONFLICT') return;
    // Both versions are held unchanged, and nothing is applied over either one.
    expect(result.device).toEqual(device);
    expect(result.server).toEqual(server);
    expect(result).not.toHaveProperty('apply');
    // The coupled attempt outcome conflicts as a unit (Q5).
    expect(result.conflictFields.sort()).toEqual(['completed', 'mistakes', 'quality', 'status']);
    expect(result.groups).toHaveLength(1);
  });

  it('F12-AC11 (US-054) the server-side form (changed fields from the change log) gives the same conflict', () => {
    const result = detect(
      { local: { status: 'NOT_REMEMBERED' }, server: { status: 'COMPLETED', completed: full }, serverChanged: ['status', 'completed'] },
      attemptSpec,
    );
    expect(result.kind).toBe('CONFLICT');
  });

  it('F12 unit: attempts, attendance, quantities, quality, mistakes, and homework never use last-write-wins', () => {
    const homeworkSpec = defineFieldSpec({ entity: 'homework_portion' });
    const cases = [
      { spec: attemptSpec, field: 'status', device: 'PARTIAL', server: 'NOT_REMEMBERED' },
      { spec: attemptSpec, field: 'completed', device: half, server: full },
      { spec: attemptSpec, field: 'quality', device: 2, server: 4 },
      { spec: attemptSpec, field: 'mistakes', device: [{ category: 'TAJWEED', severity: 'MINOR' }], server: [] },
      { spec: attendanceSpec, field: 'status', device: 'PRESENT', server: 'ABSENT' },
      { spec: homeworkSpec, field: 'status', device: 'DRAFT', server: 'CONFIRMED' },
      { spec: homeworkSpec, field: 'assigned', device: half, server: full },
    ];
    for (const c of cases) {
      const result = detect({ local: { [c.field]: c.device }, server: { [c.field]: c.server }, serverChanged: [c.field] }, c.spec);
      expect(result.kind, `${c.spec.entity}.${c.field}`).toBe('CONFLICT');
    }
  });

  it('F12 unit: fields the documents do not classify (note body, remarks) are meaningful by default (Q4)', () => {
    expect(classOf(portionSpec, 'remarks')).toEqual({ kind: 'MEANINGFUL' });
    const result = detect({ local: { remarks: 'device' }, server: { remarks: 'server' }, serverChanged: ['remarks'] }, portionSpec);
    expect(result.kind).toBe('CONFLICT');
  });

  it('F12 unit: equal values on both sides are not a conflict', () => {
    const result = detect({ local: { status: 'COMPLETED' }, server: { status: 'COMPLETED' }, serverChanged: ['status'] }, SYNC_PROBE_FIELDS);
    expect(result).toEqual({ kind: 'APPLY', apply: {}, serverWins: [] });
  });

  it('F12 unit: changes to different ungrouped meaningful fields apply on top of the server row (Q5)', () => {
    const result = detect(
      { local: { label: 'device label' }, server: { label: 'old', status: 'server status' }, serverChanged: ['status'] },
      SYNC_PROBE_FIELDS,
    );
    expect(result).toEqual({ kind: 'APPLY', apply: { label: 'device label' }, serverWins: [] });
  });

  it('F12 unit: a coupled group conflicts as a unit even when the two sides changed different members (Q5)', () => {
    const result = detect(
      { local: { status: 'NOT_REMEMBERED', completed: { unit: 'PARA', numerator: 0, denominator: 1 } }, server: { status: 'PENDING', quality: 2 }, serverChanged: ['quality'] },
      attemptSpec,
    );
    expect(result.kind).toBe('CONFLICT');
  });

  it('F12 unit: a group change applies when the server changed nothing in that group', () => {
    const result = detect({ local: { status: 'PRESENT' }, server: { status: 'ABSENT', remarks: 'x' }, serverChanged: ['remarks'] }, attendanceSpec);
    expect(result).toEqual({ kind: 'APPLY', apply: { status: 'PRESENT' }, serverWins: [] });
  });

  it('F12 unit: detect needs either the server-changed fields or the base row', () => {
    expect(() => detect({ local: { a: 1 }, server: { a: 2 } }, SYNC_PROBE_FIELDS)).toThrow(TypeError);
  });
});

describe('F12 · safe merge', () => {
  it('F12-AC13 (US-054) a non-meaningful field such as display order merges without a conflict', () => {
    const result = detect(
      { base: { position: 1, label: 'A' }, local: { position: 3, label: 'A' }, server: { position: 2, label: 'A' } },
      portionSpec,
    );
    // The documented rule: the server's display order wins, and the device re-reads it on pull.
    expect(result).toEqual({ kind: 'APPLY', apply: {}, serverWins: ['position'] });
  });

  it('F12-AC13 (US-054) a safe-field merge does not hide a meaningful change made alongside it', () => {
    const result = detect(
      { local: { position: 3, remarks: 'device' }, server: { position: 2, remarks: 'old' }, serverChanged: ['position'] },
      portionSpec,
    );
    expect(result).toEqual({ kind: 'APPLY', apply: { remarks: 'device' }, serverWins: ['position'] });
  });

  it('F12 unit: a safe field changed only on the device applies', () => {
    const result = detect({ local: { position: 5 }, server: { position: 1 }, serverChanged: [] }, portionSpec);
    expect(result).toEqual({ kind: 'APPLY', apply: { position: 5 }, serverWins: [] });
  });
});

describe('F12 · resolution', () => {
  const conflict: ConflictRecord = {
    status: 'OPEN',
    serverVersion: 4,
    // Coupled groups travel whole (Q5): the device version holds every member of the attempt-outcome group.
    device: { status: 'PARTIAL', completed: half, quality: 3, mistakes: [], remarks: 'device remark' },
    server: { status: 'COMPLETED', completed: full, quality: 1, mistakes: [], remarks: 'server remark' },
    conflictFields: ['status', 'completed', 'quality', 'mistakes'],
  };
  const spec = defineFieldSpec({ entity: 'portion_attempt', groups: [['status', 'completed', 'quality', 'mistakes']] });
  const opts = { spec, currentServerVersion: 4 };

  it('F12-AC12 (US-054) picking a version or merging fields produces a new change and closes the conflict', () => {
    const device = resolve(conflict, { choice: 'KEEP_DEVICE' }, opts);
    expect(device).toEqual({
      ok: true,
      changes: { status: 'PARTIAL', completed: half, quality: 3, mistakes: [], remarks: 'device remark' },
      picks: { status: 'DEVICE', completed: 'DEVICE', quality: 'DEVICE', mistakes: 'DEVICE', remarks: 'DEVICE' },
    });

    const server = resolve(conflict, { choice: 'KEEP_SERVER' }, opts);
    expect(server).toEqual({ ok: true, changes: {}, picks: { status: 'SERVER', completed: 'SERVER', quality: 'SERVER', mistakes: 'SERVER', remarks: 'SERVER' } });

    const groupServer = { status: 'SERVER', completed: 'SERVER', quality: 'SERVER', mistakes: 'SERVER' } as const;
    const merged = resolve(conflict, { choice: 'MERGE', picks: { ...groupServer, remarks: 'DEVICE' } }, opts);
    expect(merged).toEqual({ ok: true, changes: { remarks: 'device remark' }, picks: { ...groupServer, remarks: 'DEVICE' } });

    const closed = closeConflict(conflict);
    expect(closed.status).toBe('RESOLVED');
    expect(resolve(closed, { choice: 'KEEP_DEVICE' }, opts)).toEqual({ ok: false, code: 'CONFLICT_CLOSED', fields: [] });
    expect(() => closeConflict(closed)).toThrow();
  });

  it('F12-AC12 (US-054) a coupled group must be picked as a unit', () => {
    const split = resolve(conflict, { choice: 'MERGE', picks: { status: 'DEVICE', completed: 'SERVER', quality: 'DEVICE', mistakes: 'DEVICE', remarks: 'DEVICE' } }, opts);
    expect(split).toEqual({ ok: false, code: 'PICK_SPLITS_GROUP', fields: ['status', 'completed', 'quality', 'mistakes'] });
  });

  it('F12 unit: a merge needs a pick for every differing field and no others', () => {
    const group = { status: 'DEVICE', completed: 'DEVICE', quality: 'DEVICE', mistakes: 'DEVICE' } as const;
    expect(resolve(conflict, { choice: 'MERGE', picks: group }, opts)).toEqual({
      ok: false,
      code: 'PICK_MISSING',
      fields: ['remarks'],
    });
    expect(
      resolve(conflict, { choice: 'MERGE', picks: { ...group, remarks: 'DEVICE', label: 'DEVICE' } }, opts),
    ).toEqual({ ok: false, code: 'PICK_UNKNOWN_FIELD', fields: ['label'] });
  });

  it('F12 unit: picks are refused with KEEP_DEVICE or KEEP_SERVER', () => {
    const choice = { choice: 'KEEP_DEVICE', picks: {} } as unknown as { choice: 'KEEP_DEVICE' };
    expect(resolve(conflict, choice, opts)).toEqual({ ok: false, code: 'PICKS_NOT_ALLOWED', fields: [] });
  });

  it('F12 unit: a resolution against a server row that changed since the conflict opened is stale', () => {
    expect(resolve(conflict, { choice: 'KEEP_DEVICE' }, { spec, currentServerVersion: 5 })).toEqual({
      ok: false,
      code: 'CONFLICT_STALE',
      fields: [],
    });
  });

  it('F12 unit: the field comparison lists differing and conflicting fields with their groups', () => {
    const diff = fieldDiff(conflict, spec);
    expect(diff.map((d) => d.field).sort()).toEqual(['completed', 'mistakes', 'quality', 'remarks', 'status']);
    const quality = diff.find((d) => d.field === 'quality')!;
    expect(quality).toMatchObject({ device: 3, server: 1, conflicting: true });
    expect(quality.group).toEqual(['status', 'completed', 'quality', 'mistakes']);
    expect(diff.find((d) => d.field === 'remarks')).toMatchObject({ conflicting: false, group: null });
  });

  it('F12-AC12 (US-054) the comparison and the picks cover whole coupled groups, so KEEP_DEVICE never writes a partial group (Q5)', () => {
    // Only status differs inside the group; the device still carries the whole group.
    const oneMember: ConflictRecord = {
      status: 'OPEN',
      serverVersion: 4,
      device: { status: 'NOT_REMEMBERED', completed: full, quality: 1, mistakes: [] },
      server: { status: 'COMPLETED', completed: full, quality: 1, mistakes: [] },
      conflictFields: ['status', 'completed', 'quality', 'mistakes'],
    };
    const diff = fieldDiff(oneMember, spec);
    expect(diff.map((d) => d.field)).toEqual(['status', 'completed', 'quality', 'mistakes']);
    const allDevice = { status: 'DEVICE', completed: 'DEVICE', quality: 'DEVICE', mistakes: 'DEVICE' } as const;
    // Every field shown is pickable, and a MERGE pick for the whole group is accepted.
    expect(resolve(oneMember, { choice: 'MERGE', picks: allDevice }, opts)).toMatchObject({ ok: true, picks: allDevice });
    expect(resolve(oneMember, { choice: 'MERGE', picks: { status: 'DEVICE' } }, opts)).toEqual({
      ok: false,
      code: 'PICK_MISSING',
      fields: ['completed', 'quality', 'mistakes'],
    });
    const kept = resolve(oneMember, { choice: 'KEEP_DEVICE' }, opts);
    expect(kept).toEqual({ ok: true, changes: oneMember.device, picks: allDevice });
  });

  it('F12 unit: a device version holding part of a coupled group cannot be resolved (GROUP_INCOMPLETE)', () => {
    const partial: ConflictRecord = { ...conflict, device: { status: 'PARTIAL', completed: half, remarks: 'device remark' } };
    for (const choice of [{ choice: 'KEEP_DEVICE' }, { choice: 'KEEP_SERVER' }, { choice: 'MERGE', picks: {} }] as const) {
      expect(resolve(partial, choice, opts)).toEqual({ ok: false, code: 'GROUP_INCOMPLETE', fields: ['quality', 'mistakes'] });
    }
  });

  it('F12 unit: missingGroupMembers names the members a partially set group lacks', () => {
    expect(missingGroupMembers(spec, ['status', 'remarks'])).toEqual(['completed', 'quality', 'mistakes']);
    expect(missingGroupMembers(spec, ['status', 'completed', 'quality', 'mistakes'])).toEqual([]);
    expect(missingGroupMembers(spec, ['remarks'])).toEqual([]);
    expect(missingGroupMembers(spec, [])).toEqual([]);
  });
});

describe('F12 · field classes', () => {
  it('F12 unit: field specs reject safe fields in groups and fields in two groups', () => {
    expect(() => defineFieldSpec({ entity: 'x', safe: { position: 'SERVER_WINS' }, groups: [['position', 'a']] })).toThrow(FieldSpecError);
    expect(() => defineFieldSpec({ entity: 'x', groups: [['a', 'b'], ['b', 'c']] })).toThrow(FieldSpecError);
    expect(() => defineFieldSpec({ entity: 'x', groups: [['a']] })).toThrow(FieldSpecError);
    expect(groupOf(attemptSpec, 'quality')).toEqual(['status', 'completed', 'quality', 'mistakes']);
    expect(groupOf(attemptSpec, 'remarks')).toEqual(['remarks']);
    expect(classOf(SYNC_PROBE_FIELDS, 'position')).toEqual({ kind: 'SAFE_MERGE', rule: 'SERVER_WINS' });
    expect(classOf(SYNC_PROBE_FIELDS, 'label')).toEqual({ kind: 'MEANINGFUL' });
  });

  it('F12 unit: value equality is structural and key-order independent', () => {
    expect(valuesEqual({ unit: 'PARA', numerator: 1, denominator: 2 }, { denominator: 2, numerator: 1, unit: 'PARA' })).toBe(true);
    expect(valuesEqual([1, 2], [2, 1])).toBe(false);
    expect(valuesEqual(null, undefined)).toBe(false);
    expect(valuesEqual(0, null)).toBe(false);
  });
});

// ---------- Properties ----------

const FIELDS = ['status', 'completed', 'quality', 'mistakes', 'label', 'remarks', 'position'] as const;
const propSpec = defineFieldSpec({
  entity: 'prop',
  safe: { position: 'SERVER_WINS' },
  groups: [['status', 'completed', 'quality', 'mistakes']],
});
const value = fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 3 }), fc.constantFrom('A', 'B'));
const row: fc.Arbitrary<Record<string, unknown>> = fc.record(
  Object.fromEntries(FIELDS.map((f) => [f, value])) as Record<(typeof FIELDS)[number], typeof value>,
);
const subset: fc.Arbitrary<string[]> = fc.subarray<string>([...FIELDS]);

describe('F12 · conflict properties', () => {
  it('F12 unit (property): equal device and server values never conflict', () => {
    fc.assert(
      fc.property(row, subset, subset, (server, localKeys, serverChanged) => {
        const local = Object.fromEntries(localKeys.map((k) => [k, server[k]]));
        const result = detect({ local, server, serverChanged }, propSpec);
        expect(result).toEqual({ kind: 'APPLY', apply: {}, serverWins: [] });
      }),
    );
  });

  it('F12 unit (property): changes to disjoint fields never conflict', () => {
    fc.assert(
      fc.property(row, row, subset, (server, device, localKeys) => {
        // The server changed only fields outside every group the device touched.
        const touched = new Set(localKeys.flatMap((k) => [...groupOf(propSpec, k)]));
        const serverChanged = FIELDS.filter((f) => !touched.has(f));
        const local = Object.fromEntries(localKeys.map((k) => [k, device[k]]));
        const result = detect({ local, server, serverChanged }, propSpec);
        expect(result.kind).toBe('APPLY');
        if (result.kind === 'APPLY') {
          for (const k of localKeys) if (!valuesEqual(device[k], server[k])) expect(result.apply[k]).toEqual(device[k]);
        }
      }),
    );
  });

  it('F12 unit (property): no meaningful field the server changed is ever silently overwritten', () => {
    fc.assert(
      fc.property(row, row, subset, subset, (server, device, localKeys, serverChanged) => {
        const local = Object.fromEntries(localKeys.map((k) => [k, device[k]]));
        const result = detect({ local, server, serverChanged }, propSpec);
        if (result.kind === 'CONFLICT') {
          expect(result.device).toEqual(local);
          expect(result.server).toEqual(server);
          return;
        }
        for (const [field, newValue] of Object.entries(result.apply)) {
          expect(classOf(propSpec, field).kind === 'MEANINGFUL' && serverChanged.includes(field) && !valuesEqual(newValue, server[field])).toBe(false);
          // A write into a coupled group never meets a server change in that group.
          if (classOf(propSpec, field).kind === 'MEANINGFUL') {
            for (const member of groupOf(propSpec, field)) {
              if (serverChanged.includes(member)) expect(localKeys.includes(member) && valuesEqual(local[member], server[member])).toBe(true);
            }
          }
        }
        // Safe fields: the server value wins whenever both changed it.
        for (const field of result.serverWins) expect(field in result.apply).toBe(false);
      }),
    );
  });

  it('F12 unit (property): KEEP_SERVER changes nothing and KEEP_DEVICE restores every device value', () => {
    fc.assert(
      fc.property(row, row, subset, (server, device, keys) => {
        // Operations carry whole coupled groups (Q5; partial groups are refused at push).
        const localKeys = [...new Set(keys.flatMap((k) => [...groupOf(propSpec, k)]))];
        const local = Object.fromEntries(localKeys.map((k) => [k, device[k]]));
        const conflict: ConflictRecord = { status: 'OPEN', serverVersion: 1, device: local, server, conflictFields: [] };
        const opts = { spec: propSpec, currentServerVersion: 1 };
        expect(resolve(conflict, { choice: 'KEEP_SERVER' }, opts)).toMatchObject({ ok: true, changes: {} });
        const kept = resolve(conflict, { choice: 'KEEP_DEVICE' }, opts);
        expect(kept.ok).toBe(true);
        if (kept.ok) expect({ ...server, ...kept.changes }).toEqual({ ...server, ...local });
      }),
    );
  });
});
