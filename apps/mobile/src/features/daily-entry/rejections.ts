// F05 · Server rejections of a daily record's operations, mapped back to the right portion (UI spec §2.3, §3.7;
// F05-AC3, AC6; FR-SAB-009). Pure TypeScript.
//
// A REJECTED sync result carries a code and, for VALIDATION, `fields` (field → issue code, plus `<field>.max` limits).
// Field issues of a lesson_portion or portion_attempt operation are shown on that portion's field with the same
// "Sabqi · Portion 2: …" prefix as the device's own checks. Record-level codes (duplicate, session label, attendance,
// future date, metadata) are shown once for the record. Nothing is retried or changed automatically.
import type { OutboxItem } from '../../sync/outbox.ts';
import { uiIssue, type UiField, type UnitChoice } from './form.ts';
import { recordItems, type LocalRecord, type Section } from './local.ts';

/** Codes that concern the whole record (or its context), not one field of a portion. */
const RECORD_CODES: Record<string, string> = {
  DUPLICATE_RECORD: 'errors.DUPLICATE_RECORD',
  DUPLICATE_SESSION: 'errors.DUPLICATE_SESSION',
  SESSION_LABEL_REQUIRED: 'errors.SESSION_LABEL_REQUIRED',
  SESSION_LABEL_NOT_ALLOWED: 'errors.SESSION_LABEL_NOT_ALLOWED',
  SESSION_LABEL_TOO_LONG: 'errors.SESSION_LABEL_TOO_LONG',
  ATTENDANCE_CHANGE_TO_LATE: 'errors.ATTENDANCE_CHANGE_TO_LATE',
  ATTENDANCE_REQUIRED: 'errors.ATTENDANCE_REQUIRED',
  FUTURE: 'errors.FUTURE_DATE',
  NOT_ENROLLED: 'fields.NOT_ENROLLED',
  METADATA_UNAVAILABLE: 'errors.METADATA_UNAVAILABLE',
  PORTION_REMOVED: 'errors.PORTION_REMOVED',
  ATTEMPT_NO_TAKEN: 'errors.ATTEMPT_NO_TAKEN',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PortionRejection {
  portionId: string;
  section: Section;
  /** Displayed number among the record's non-removed portions of its section. */
  portionNumber: number;
  field: UiField;
  messageKey: string;
  params?: Record<string, number>;
}

export interface RecordRejections {
  portions: PortionRejection[];
  /** i18n keys of record-level messages, without duplicates. */
  record: string[];
  /** SINGLE mode: the server named the record that already exists for the student and date (F05-AC6). */
  existingRecordId: string | null;
}

const unitOf = (u: { unit: string; numerator: number; denominator: number } | null): UnitChoice | null => {
  if (!u) return null;
  if (u.unit !== 'PARA') return u.unit as UnitChoice;
  const quarters = (u.numerator * 4) / u.denominator;
  return quarters === 1 ? 'RUBU' : quarters === 2 ? 'HALF' : quarters === 3 ? 'SALASAH' : 'COMPLETE';
};

export function recordRejections(items: readonly OutboxItem[], record: LocalRecord): RecordRejections {
  const out: RecordRejections = { portions: [], record: [], existingRecordId: null };
  const numbers = new Map<string, number>();
  for (const section of ['SABAQ', 'SABQI', 'MANZIL'] as const) {
    record.portions.filter((p) => p.section === section && !p.removed).forEach((p, i) => numbers.set(p.id, i + 1));
  }
  const portionOfAttempt = new Map(record.portions.flatMap((p) => p.attempts.map((a) => [a.id, p] as const)));
  const addRecord = (key: string) => {
    if (!out.record.includes(key)) out.record.push(key);
  };
  for (const item of recordItems(items, record)) {
    const failure = item.status.failure;
    if (!failure || (item.status.state !== 'FAILED' && item.status.state !== 'ACTION_REQUIRED')) continue;
    const fields = failure.fields ?? {};
    for (const [key, value] of Object.entries(fields)) {
      if (UUID.test(value) && /existing/i.test(key)) out.existingRecordId = value;
    }
    const entries = Object.entries(fields).filter(([k]) => !k.endsWith('.max') && !/existing/i.test(k));
    if (entries.length === 0) {
      addRecord(RECORD_CODES[failure.code] ?? `errors.${failure.code}`);
      continue;
    }
    const portion = item.entity === 'lesson_portion' ? record.portions.find((p) => p.id === item.entityId) : item.entity === 'portion_attempt' ? portionOfAttempt.get(item.entityId) : undefined;
    for (const [key, code] of entries) {
      if (RECORD_CODES[code]) {
        addRecord(RECORD_CODES[code]);
        continue;
      }
      if (!portion) {
        addRecord(key === 'sessionLabel' ? 'errors.SESSION_LABEL_REQUIRED' : 'errors.VALIDATION');
        continue;
      }
      const field = key.split('.')[0] ?? key;
      const maxText = fields[`${key}.max`];
      const ui = uiIssue(portion.section, unitOf(portion.assigned), { field, code, ...(maxText && /^\d+$/.test(maxText) ? { max: Number(maxText) } : {}) });
      out.portions.push({ portionId: portion.id, section: portion.section, portionNumber: numbers.get(portion.id) ?? portion.position, ...ui });
    }
  }
  return out;
}
