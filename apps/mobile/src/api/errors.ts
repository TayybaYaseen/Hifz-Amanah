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
]);

export function errorKeys(err: unknown): ErrorKeys {
  if (!(err instanceof ApiFailure)) return { form: 'errors.INTERNAL', fields: {} };
  if (err.code === 'VALIDATION' && Object.keys(err.fields).length) {
    const fields: Record<string, string> = {};
    for (const [field, issue] of Object.entries(err.fields)) {
      fields[field] = `fields.${KNOWN_FIELD_ISSUES.has(issue) ? issue : 'INVALID'}`;
    }
    return { form: null, fields };
  }
  return { form: `errors.${err.code}`, fields: {} };
}
