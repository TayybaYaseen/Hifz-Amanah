// F10 · Portal display rules for Students and Parents (design.md §4.11, §4.12, §8). Pure, tested with Vitest; the
// screens only render their results.
// - Online only: a failed request never falls back to stored data (there is none, NFR-PORT-005). No connection shows
//   "Network unavailable" (F10-AC4); "not found" means the report or the link is gone (unpublished, revoked, or never
//   theirs) and reads the same in every case, so nothing can be probed (F10-AC2, AC7).
// - The Parent's switcher lists the linked students the server returns, and keeps the chosen one only while it is still
//   in that list: a revoked child disappears from it on the next load (F10-AC5, AC7).
// - The visible remark of a portion line is the server's: the server sends a remark only when the Teacher shared it.
import { ApiFailure } from '../../api/client.ts';

export type PortalFailure = 'OFFLINE' | 'NOT_AVAILABLE' | 'ERROR';

/** How a failed portal request is shown. Session problems are handled by the session layer before this. */
export function portalFailure(err: unknown): PortalFailure {
  if (err instanceof ApiFailure) {
    if (err.code === 'NETWORK') return 'OFFLINE';
    if (err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN') return 'NOT_AVAILABLE';
  }
  return 'ERROR';
}

/** The student to show: the current choice while the server still lists it, else the first one, else none. */
export function pickStudent(items: readonly { id: string }[], current: string | null): string | null {
  if (current !== null && items.some((s) => s.id === current)) return current;
  return items[0]?.id ?? null;
}

/** A Parent with more than one verified link gets the switcher; one link shows the child without a choice. */
export const showSwitcher = (items: readonly unknown[]): boolean => items.length > 1;

/** Merges a further page of the report list, keeping each report once (newest first as the server sends them). */
export function appendPage<T extends { id: string }>(current: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(current.map((i) => i.id));
  return [...current, ...next.filter((i) => !seen.has(i.id))];
}

/** Mistake categories with a count, in the server's order, as `[category, count]` pairs. */
export function categoryCounts(byCategory: Readonly<Record<string, number>>): [string, number][] {
  return Object.entries(byCategory).filter(([, n]) => n > 0);
}
