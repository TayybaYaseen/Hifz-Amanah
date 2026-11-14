// F12 · Offline and synchronization — unit: sync banner state (design.md §4.13, §5.9; F12-AC8, AC9)
import { describe, expect, it } from 'vitest';
import { bannerFor, type BannerInput } from './banner.ts';

const zero = { PENDING: 0, SYNCING: 0, SYNCED: 0, FAILED: 0, ACTION_REQUIRED: 0 };
const base: BannerInput = { counts: zero, locked: false, upgradeRequired: false, sessionExpired: false, online: true, running: false, lastSuccessAt: null };

describe('F12 · sync banner', () => {
  it('F12-AC9 (US-053) "All changes synced" only after a server acknowledgement and with nothing unsynced', () => {
    expect(bannerFor(base).state).toBe('NOTHING');
    expect(bannerFor({ ...base, counts: { ...zero, PENDING: 1 }, lastSuccessAt: '2026-11-08T06:00:00Z' }).state).toBe('PENDING');
    expect(bannerFor({ ...base, counts: { ...zero, SYNCED: 3 }, lastSuccessAt: '2026-11-08T06:00:00Z' })).toEqual({
      state: 'SYNCED',
      count: 0,
      lastSuccessAt: '2026-11-08T06:00:00Z',
    });
  });

  it('F12-AC8 (US-053) one primary state, by precedence, with counts in text', () => {
    const counts = { PENDING: 2, SYNCING: 1, SYNCED: 4, FAILED: 3, ACTION_REQUIRED: 1 };
    expect(bannerFor({ ...base, counts, locked: true, upgradeRequired: true }).state).toBe('ACCESS_REVOKED');
    expect(bannerFor({ ...base, counts, upgradeRequired: true, sessionExpired: true })).toMatchObject({ state: 'UPGRADE_REQUIRED', count: 7 });
    expect(bannerFor({ ...base, counts, sessionExpired: true }).state).toBe('SESSION_EXPIRED');
    expect(bannerFor({ ...base, counts })).toMatchObject({ state: 'ACTION_REQUIRED', count: 1 });
    expect(bannerFor({ ...base, counts: { ...counts, ACTION_REQUIRED: 0 } })).toMatchObject({ state: 'FAILED', count: 3 });
    expect(bannerFor({ ...base, counts: { ...zero, PENDING: 2 }, online: false })).toMatchObject({ state: 'OFFLINE', count: 2 });
    expect(bannerFor({ ...base, counts: { ...zero, PENDING: 2 }, running: true })).toMatchObject({ state: 'SYNCING', count: 2 });
  });
});
