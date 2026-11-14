// Client IDs (NFR-OFF-005, F12-AC3): UUIDv7 from @hifz/domain/sync, with the clock and a cryptographically secure
// random source injected (expo-crypto in the app, node:crypto in tests).
import { UUID_V7_RANDOM_BYTES, uuidV7 } from '@hifz/domain/sync';

export type RandomBytes = (count: number) => Uint8Array;

export function createIdSource(clock: () => number, randomBytes: RandomBytes): () => string {
  return () => uuidV7(clock(), randomBytes(UUID_V7_RANDOM_BYTES));
}

/** A UUIDv4-shaped random ID (the per-installation device ID the push request carries). */
export function randomUuid(randomBytes: RandomBytes): string {
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
