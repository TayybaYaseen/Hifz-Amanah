// F12 · Offline and synchronization — unit: conflicts and merges (docs/specs/04-f12-offline-sync/)
import { describe, it } from 'vitest';

describe('F12 · conflict detection', () => {
  it.todo('F12-AC11 (US-054) two edits to a portion status from the same base version create a conflict holding both versions');
  it.todo('F12 unit: attempts, attendance, quantities, quality, mistakes, and homework never use last-write-wins');
});

describe('F12 · safe merge', () => {
  it.todo('F12-AC13 (US-054) a non-meaningful field such as display order merges without a conflict');
});

describe('F12 · resolution', () => {
  it.todo('F12-AC12 (US-054) picking a version or merging fields produces a new change and closes the conflict');
});
