// F12 · Retry backoff (NFR-OFF-007, F12-AC6). Full-jitter exponential: base 2 s, factor 2, cap 5 min.
// There is no retry limit: a temporarily failing operation stays PENDING and is never discarded automatically.

export const BACKOFF = { baseMs: 2_000, factor: 2, capMs: 300_000 } as const;

/**
 * The upper bound of the delay after `attempts` failed attempts (1 = the first failure):
 * min(cap, base × factor^(attempts − 1)). It never decreases as attempts grow.
 */
export function backoffCeiling(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('backoffCeiling: attempts must be an integer ≥ 1');
  }
  // Past this exponent the cap always applies; stopping early avoids Infinity for very large counts.
  const maxExponent = Math.ceil(Math.log(BACKOFF.capMs / BACKOFF.baseMs) / Math.log(BACKOFF.factor));
  const exponent = Math.min(attempts - 1, maxExponent);
  return Math.min(BACKOFF.capMs, BACKOFF.baseMs * BACKOFF.factor ** exponent);
}

/**
 * Full jitter: a delay drawn uniformly from [0, ceiling). `random` returns a number in [0, 1)
 * (e.g. `Math.random`); it is injected so the function stays pure.
 */
export function nextAttemptDelay(attempts: number, random: () => number): number {
  const r = random();
  if (!(r >= 0 && r < 1)) throw new RangeError('nextAttemptDelay: random() must return a number in [0, 1)');
  return Math.floor(r * backoffCeiling(attempts));
}

/** The time (ms since epoch) at which the operation may be sent again. */
export function nextAttemptAt(nowMs: number, attempts: number, random: () => number): number {
  return nowMs + nextAttemptDelay(attempts, random);
}
