// Re-review M2 / L2 · unit: only the latest load sets a screen's state; a closed workspace is the only silent cache fault.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheRoster } from '../features/attendance/local.ts';
import { cacheWriteFailed, readCacheToken } from '../sync/cacheEpoch.ts';
import { probeDb } from '../sync/testing/probe.ts';
import { latestRequests } from './latest.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('re-review M2 · latest request only (Daily Entry loadSheet, Bulk Entry load)', () => {
  it('F04/F05 unit (FR-SEC-003): class A’s late answer is not current once class B was opened; B’s is', async () => {
    const requests = latestRequests();
    let releaseA!: () => void;
    const answerA = new Promise<void>((r) => (releaseA = r));
    const screen: string[] = [];
    const load = async (classId: string, answered: Promise<void>) => {
      const current = requests.next();
      await answered;
      if (current()) screen.push(classId);
    };
    const a = load('A', answerA);
    const b = load('B', Promise.resolve());
    await b;
    releaseA();
    await a;
    expect(screen).toEqual(['B']);
  });

  it('F04/F05 unit: a reload of the same selection supersedes the earlier one; a single load stays current', () => {
    const requests = latestRequests();
    const first = requests.next();
    expect(first()).toBe(true);
    const second = requests.next();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});

describe('re-review L2 · cache write faults', () => {
  const CLASS = '0190f5c0-0000-7000-8000-00000000c1b1';

  it('F04/F08 unit: a workspace closed meanwhile (sign-out) is ignored silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = await probeDb();
    const token = await readCacheToken(db, CLASS);
    await db.close();
    expect(await cacheRoster(db, token, CLASS, 'Hifz B1', [], '2026-11-17T00:00:00.000Z').catch(cacheWriteFailed)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('F04/F08 unit: any other SQL fault is reported with the error class only, never its message or data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fault = new Error('constraint failed: Test Student Secret');
    fault.name = 'SQLiteError';
    expect(cacheWriteFailed(fault)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('SQLiteError');
    expect(logged).not.toContain('Test Student Secret');
  });
});
