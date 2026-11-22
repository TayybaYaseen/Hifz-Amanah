// F08 · Every homework string the screens use exists in all three locales (AGENTS.md §8; FR-I18N-001). The dynamic
// keys (states, carry-over reasons, origins, statuses) are checked for every canonical value.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARRY_OVER_REASONS, HOMEWORK_STATES, HOMEWORK_STATUSES, PORTION_ORIGINS } from '@hifz/domain/homework';
import { en } from '../../i18n/locales/en.ts';
import { ur } from '../../i18n/locales/ur.ts';
import { urLatn } from '../../i18n/locales/ur-Latn.ts';

const get = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

const SOURCES = [
  ...readdirSync(__dirname).filter((f) => f.endsWith('.tsx')).map((f) => join(__dirname, f)),
  join(__dirname, '../daily-entry/DailyEntryScreen.tsx'),
  join(__dirname, '../daily-entry/DailyRecordScreen.tsx'),
  join(__dirname, '../daily-entry/PortionCard.tsx'),
  join(__dirname, '../home/HomeScreen.tsx'),
];

describe('F08 · homework strings', () => {
  const used = new Set<string>();
  for (const file of SOURCES) for (const m of readFileSync(file, 'utf8').matchAll(/t\('((?:homework|home)\.[A-Za-z.]+)'/g)) used.add(m[1]!);
  for (const s of HOMEWORK_STATES) used.add(`homework.states.${s}`);
  for (const r of CARRY_OVER_REASONS) used.add(`homework.carried.${r}`);
  for (const o of PORTION_ORIGINS) used.add(`homework.origin.${o}`);
  for (const s of HOMEWORK_STATUSES) used.add(`homework.statuses.${s}`);

  it.each([
    ['en', en],
    ['ur', ur],
    ['ur-Latn', urLatn],
  ])('F08 (FR-I18N-001) every key used by the homework screens exists in %s', (_name, catalogue) => {
    const missing = [...used].filter((k) => typeof get(catalogue, k) !== 'string');
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(60);
  });
});
