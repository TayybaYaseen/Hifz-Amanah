// F02 · Organization and roles — unit: workspace settings rules (docs/specs/03-f02-organization-roles.md)
import { describe, expect, it } from 'vitest';
import { isIanaTimeZone, normalizeWorkspaceName, settingsDiff } from './rules.ts';

describe('F02 · workspace settings rules', () => {
  it('F02 unit: accepts IANA time zone names and refuses offsets, blanks, and unknown zones', () => {
    for (const zone of ['Asia/Karachi', 'Asia/Dubai', 'Europe/London', 'America/Argentina/Buenos_Aires', 'UTC']) {
      expect(isIanaTimeZone(zone), zone).toBe(true);
    }
    for (const zone of ['', ' ', '+05:00', 'GMT+5', 'Asia/Nowhere', 'Asia/Karachi; DROP', '../etc']) {
      expect(isIanaTimeZone(zone), zone).toBe(false);
    }
  });

  it('F02-AC3 (US-007) a blank workspace name normalizes to empty, which the service reports as REQUIRED', () => {
    expect(normalizeWorkspaceName('   ')).toBe('');
    expect(normalizeWorkspaceName('  Madrasa Alif  ')).toBe('Madrasa Alif');
    // Urdu names are kept exactly, apart from surrounding whitespace.
    expect(normalizeWorkspaceName(' مدرسہ الف ')).toBe('مدرسہ الف');
  });

  it('F02-AC2 (US-007) the audit summary lists only the fields that change, with old and new values', () => {
    const current = { name: 'A', timezone: 'Asia/Karachi', weekStart: 'MONDAY' };
    expect(settingsDiff(current, { name: 'B', timezone: 'Asia/Karachi' })).toEqual({ name: { from: 'A', to: 'B' } });
    expect(settingsDiff(current, {})).toEqual({});
    expect(settingsDiff(current, { weekStart: 'SATURDAY' })).toEqual({ weekStart: { from: 'MONDAY', to: 'SATURDAY' } });
  });
});
