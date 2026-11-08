// F12 · Client-generated IDs (NFR-OFF-005, F12-AC3). Offline-creatable entities and every operation use UUIDv7.
// Pure: generation takes the clock and the random bytes as inputs, so it has no I/O and is deterministic in tests.

/** Canonical (lowercase) UUIDv7: version nibble 7, RFC 9562 variant (8, 9, a, b). */
export const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** True for a canonical lowercase UUIDv7. Uppercase spellings are refused so one ID has one spelling. */
export function isUuidV7(value: unknown): value is string {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value);
}

/** Random bytes a UUIDv7 needs: 74 random bits, taken from 10 bytes. */
export const UUID_V7_RANDOM_BYTES = 10;

const MAX_UNIX_MS = 2 ** 48 - 1;

/**
 * Builds a UUIDv7 from a Unix time in milliseconds and 10 random bytes (RFC 9562 §5.7).
 * The caller supplies a cryptographically secure source (e.g. `crypto.getRandomValues`).
 */
export function uuidV7(unixMs: number, random: Uint8Array): string {
  if (!Number.isInteger(unixMs) || unixMs < 0 || unixMs > MAX_UNIX_MS) {
    throw new RangeError('uuidV7: unixMs must be an integer between 0 and 2^48 - 1');
  }
  if (random.length < UUID_V7_RANDOM_BYTES) {
    throw new RangeError(`uuidV7: needs at least ${UUID_V7_RANDOM_BYTES} random bytes`);
  }
  const bytes = new Uint8Array(16);
  let ms = unixMs;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | (random[0]! & 0x0f);
  bytes[7] = random[1]!;
  bytes[8] = 0x80 | (random[2]! & 0x3f);
  for (let i = 3; i < UUID_V7_RANDOM_BYTES; i++) bytes[i + 6] = random[i]!;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
