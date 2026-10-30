// F12 · Offline and synchronization — unit: outbox (docs/specs/04-f12-offline-sync/)
import { describe, it } from 'vitest';

describe('F12 · identifiers', () => {
  it.todo('F12-AC3 (US-051) an offline-created record gets a client UUIDv7 that never changes, including after sync');
  it.todo('F12 unit: every operation has a unique op_id');
});

describe('F12 · ordering', () => {
  it.todo('F12-AC4 (US-052) operations are sent in order, a record before its portions and attempts');
});

describe('F12 · retries', () => {
  it.todo('F12-AC6 (US-052) temporary errors retry with increasing delays and the operation stays pending');
});

describe('F12 · sync states', () => {
  it.todo('F12-AC8 (US-053) each item is pending, syncing, synced, failed (with reason), or action required');
  it.todo('F12-AC9 (US-053) an item is never synced until the server acknowledges it');
  it.todo('F12-AC14 (US-052) "access revoked" stops syncing that workspace and keeps pending changes visible');
  it.todo('F12-AC15 (US-052) "upgrade required" keeps pending changes');
});
