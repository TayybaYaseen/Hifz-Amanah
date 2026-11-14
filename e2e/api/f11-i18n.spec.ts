// F11 · Localization and accessibility — API E2E (docs/specs/02-f11-localization-accessibility.md)
// Screen journeys: e2e/mobile/f11-i18n/.
import { checkCatalogues, domainMessages, flatten, serverCatalogues } from '../../packages/i18n-keys/src/index.ts';
// The app's screen catalogues. Playwright loads apps/mobile as CommonJS, so these files (no runtime imports) are read
// directly and combined with the shared labels the same way apps/mobile/src/i18n/resources.ts does.
import { en } from '../../apps/mobile/src/i18n/locales/en.ts';
import { ur } from '../../apps/mobile/src/i18n/locales/ur.ts';
import { urLatn } from '../../apps/mobile/src/i18n/locales/ur-Latn.ts';
import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './support/fixtures';

const appCatalogues = {
  en: { ...en, domain: domainMessages('en') },
  ur: { ...ur, domain: domainMessages('ur') },
  'ur-Latn': { ...urLatn, domain: domainMessages('ur-Latn') },
};

// Daily-entry writes for F11-AC6 go through POST /sync/push, as in e2e/api/f05-daily-entry.spec.ts. Seeded fixtures:
// A1 (teacher.a1; S1, S2); every class meets Monday–Saturday. A Para-only Sabqi portion needs no Quran metadata.
type Ids = { classes: Record<string, string>; students: Record<string, string> };
type OpResult = { opId: string; status: string; code?: string; entityId?: string };
const DEVICE = '0190f5c0-0000-4000-8000-000000000f11';

function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The most recent Monday–Saturday at least `back` days ago in Asia/Karachi: a scheduled day for every seeded class. */
function classDay(back: number): string {
  const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
const op = (entity: string, fields: Record<string, unknown>) => ({
  opId: uuidv7(), seq: ++seq, entity, entityId: uuidv7(), opType: 'CREATE', baseVersion: null, fields, dependsOn: [] as string[],
  clientSavedAt: new Date().toISOString(),
});
const attendance = (ids: Ids, student: string, date: string) =>
  op('attendance_record', { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, status: 'PRESENT', leaveReason: null, absentNote: null });
const record = (ids: Ids, student: string, date: string) =>
  op('daily_record', { studentId: ids.students[student], classId: ids.classes.A1, reportDate: date, sessionLabel: null });
const portion = (recordId: string) =>
  op('lesson_portion', { dailyRecordId: recordId, section: 'SABQI', position: 1, isExtra: false, paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: { unit: 'PARA', numerator: 1, denominator: 1 } });
const attempt = (portionId: string, status: string, attemptNo = 1) =>
  op('portion_attempt', { lessonPortionId: portionId, attemptNo, attemptedAt: new Date().toISOString(), status, completed: null, quality: null, noMistakes: false, mistakes: [], remarks: null });

async function push(api: APIRequestContext, ops: object[], headers: Record<string, string>): Promise<OpResult[]> {
  const res = await api.post('/sync/push', { data: { protocolVersion: 1, deviceId: DEVICE, ops }, headers });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).results as OpResult[];
}

test.describe('F11 · Localization and accessibility', { tag: '@F11' }, () => {
  test('F11-AC4 (US-047) the language preference is stored on the account', async ({ signIn }) => {
    // As teacher.a1 set language ur; sign out; sign in from a new context → profile language ur.
    const first = await signIn('teacher.a1');
    const patched = await first.api.patch('/me', { data: { preferredLocale: 'ur' } });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).preferredLocale).toBe('ur');
    expect((await first.api.post('/auth/sign-out')).status()).toBe(204);

    // signIn opens a new request context: no cookies, nothing shared with the first session.
    const second = await signIn('teacher.a1');
    const me = await second.api.get('/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).preferredLocale).toBe('ur');
  });

  test('F11-AC6 (US-048) a status saved in Urdu is stored as the canonical value', async ({ as, control }) => {
    // Save NOT_REMEMBERED with Accept-Language ur and again with en; both stored values are NOT_REMEMBERED.
    // The Urdu label itself is display text, never a stored value, so the server refuses it.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const day = classDay(1);
    for (const [student, locale] of [['S1', 'ur'], ['S2', 'en']] as const) {
      const headers = { 'Accept-Language': locale };
      const [a, r] = await push(teacher, [attendance(ids, student, day), record(ids, student, day)], headers);
      expect([a!.status, r!.status], JSON.stringify([a, r])).toEqual(['APPLIED', 'APPLIED']);
      const [p] = await push(teacher, [portion(r!.entityId!)], headers);
      expect(p, JSON.stringify(p)).toMatchObject({ status: 'APPLIED' });
      const [t] = await push(teacher, [attempt(p!.entityId!, 'NOT_REMEMBERED')], headers);
      expect(t, JSON.stringify(t)).toMatchObject({ status: 'APPLIED' });

      const detail = await teacher.get(`/hifz/daily-records/${r!.entityId}`, { headers });
      expect(detail.status(), await detail.text()).toBe(200);
      const [stored] = (await detail.json()).portions as Array<{ attempts: Array<{ status: string }>; progress: { currentStatus: string } }>;
      expect(stored!.attempts.map((x) => x.status), locale).toEqual(['NOT_REMEMBERED']);
      expect(stored!.progress.currentStatus, locale).toBe('NOT_REMEMBERED');

      const label = flatten(appCatalogues[locale])['domain.recitationStatus.NOT_REMEMBERED'];
      expect(label, locale).toBeTruthy();
      const [refused] = await push(teacher, [attempt(p!.entityId!, label!, 2)], headers);
      expect(refused!.status, JSON.stringify(refused)).not.toBe('APPLIED');
    }
  });

  test.fixme('F11-AC10 (US-050) Arabic text in PDF and Excel exports is unchanged', async () => {
    // Needs PDF export (F13, spec 16) and Excel export (F14, spec 14).
    // Export a report containing an Arabic Surah name to PDF and Excel;
    // extract text from both files; the Arabic string equals the stored value.
  });

  test('F11-AC11 (US-047) every message key exists in en, ur, and ur-Latn', async () => {
    // Load the app and server catalogues (packages/i18n-keys); every key has a non-empty value in all three locales.
    // Includes validation, empty-state, PDF, Excel, and push keys.
    for (const [name, catalogues] of Object.entries({ app: appCatalogues, server: serverCatalogues })) {
      expect(checkCatalogues(catalogues), name).toEqual([]);
    }
    // Validation and empty-state messages are among the checked keys. PDF, Excel, and push keys join the server
    // catalogue with F13, F14, and F16 and are checked by the same call.
    const app = flatten(appCatalogues.en);
    expect(app['fields.REQUIRED']).toBeTruthy();
    expect(app['accounts.empty']).toBeTruthy();
  });

  test('F11-AC11 (US-047) every error code the API returns has a message in every app locale', async ({ anon }) => {
    // The app localizes server errors by code; a refusal from the running API must have a message in each locale.
    const refusal = await anon.post('/auth/sign-in', { data: { loginId: 'no-such-user', password: 'Not-The-Password-1' } });
    const { error } = await refusal.json();
    for (const locale of ['en', 'ur', 'ur-Latn'] as const) {
      expect(flatten(appCatalogues[locale])[`errors.${error.code}`], locale).toBeTruthy();
    }
  });
});
