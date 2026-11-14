// Turns an API failure into i18n keys. Plain TypeScript, tested with Vitest.
import { ApiFailure } from './client.ts';

export interface ErrorKeys {
  /** Message key for the form, or null when every problem belongs to a field. */
  form: string | null;
  /** Field name → message key. */
  fields: Record<string, string>;
}

const KNOWN_FIELD_ISSUES = new Set([
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_TOO_COMMON',
  'PASSWORD_EQUALS_USER_ID',
  'LOGIN_ID_FORMAT',
  'REQUIRED',
  'INVALID',
  'NOT_ALLOWED',
  // F03 roster (packages/contracts/src/roster.ts ROSTER_FIELD_ISSUES)
  'TAKEN',
  'SAME_CLASS',
  'BEFORE_CURRENT_START',
  'OVERLAPS_HISTORY',
  'CLASS_INACTIVE',
  // F04 calendar (packages/contracts/src/calendar.ts CALENDAR_FIELD_ISSUES)
  'TOO_LONG',
  'FUTURE',
  'HOLIDAY',
  'CLOSURE',
  'NO_CLASS',
  'UNSCHEDULED',
  'NOT_ENROLLED',
  // F06 Quran reference (packages/domain/quran-ref). OUT_OF_RANGE with a limit comes with `<field>.max`.
  'OUT_OF_RANGE',
  'END_BEFORE_START',
  'UNKNOWN_SURAH',
  'UNKNOWN',
]);

/** Limit suffixes the API adds beside a field issue (F06-AC6: the error names the maximum Ayat). */
const LIMIT_SUFFIX = '.max';

export function errorKeys(err: unknown): ErrorKeys {
  if (!(err instanceof ApiFailure)) return { form: 'errors.INTERNAL', fields: {} };
  if (err.code === 'VALIDATION' && Object.keys(err.fields).length) {
    const fields: Record<string, string> = {};
    for (const [field, issue] of Object.entries(err.fields)) {
      if (field.endsWith(LIMIT_SUFFIX)) continue;
      if (issue === 'OUT_OF_RANGE' && err.fields[`${field}${LIMIT_SUFFIX}`] !== undefined) {
        fields[field] = 'fields.OUT_OF_RANGE_MAX';
        continue;
      }
      fields[field] = `fields.${KNOWN_FIELD_ISSUES.has(issue) ? issue : 'INVALID'}`;
    }
    return { form: null, fields };
  }
  return { form: `errors.${err.code}`, fields: {} };
}

/** The limit an API field issue names (`fields.<field>.max`), for messages such as "Use a number up to {max}." */
export function fieldLimits(err: unknown): Record<string, { max: number }> {
  if (!(err instanceof ApiFailure)) return {};
  const out: Record<string, { max: number }> = {};
  for (const [key, value] of Object.entries(err.fields)) {
    if (key.endsWith(LIMIT_SUFFIX) && /^\d+$/.test(value)) out[key.slice(0, -LIMIT_SUFFIX.length)] = { max: Number(value) };
  }
  return out;
}
