// Cache-write tokens for the class roster cache (F04) and the class calendar cache (F08)
// (security review: stale in-flight responses; FR-SEC-003, NFR-OFF-010, F12-AC20; offline use F04-AC12, AGENTS.md §7).
//
// The per-class caches are filled from online answers (GET /attendance/sheet, the class schedule) that can arrive
// late. Meanwhile the device may have dropped that class. A late answer must never write a dropped class back, and an
// answer for a class that is still allowed must still be cached (a Teacher who goes offline next needs it).
//
// A fetch reads a token BEFORE it sends its request (readCacheToken). The cache write is ONE conditional statement
// (`INSERT … SELECT … WHERE <guard>`), so the check and the write are atomic. The guard has three parts:
// 1. Global epoch (`sync_meta.cache_epoch`): bumped by purgeSynced when it clears every per-class cache (revocation
//    lock, sign-out hold, server scope reset). Any write captured before a global bump is refused.
// 2. Class epoch (`cache_class_epoch`): bumped for one class by forgetRoster (the server refused that class). Only
//    writes for that class are refused; other classes' writes still succeed.
// 3. Server allow-list (`cache_allowed_classes` + `sync_meta.allowed_seq`): every keepRostersOf stores the complete
//    class list the server returned and bumps allowed_seq. A write captured at an older allowed_seq is refused only when
//    its class is not in the current list, so a class in flight that was never cached is still refused once the list
//    drops it, and a list that still includes the class never blocks it.
//    A list also bumps the class epoch of every known class it drops (re-review M1), so an OLDER list answer that
//    arrives later and re-adds the class cannot revive a token captured before the drop.
// A class dropped by a list and listed again later is allowed again for tokens read after that (the server authorizes it again).
//
// All of this lives in the workspace database (one per account + organization), so switching account or madrasa is
// isolated already; sign-out either deletes that file or holds it after purgeSynced (which bumps the global epoch).
import { DatabaseClosedError, type SqlExecutor, type SqlValue } from '../local-db/driver.ts';
import type { Migration } from '../local-db/migrations.ts';

/** Local schema: the cache-write token state. Additive only: the outbox is untouched (F12-AC16). */
export const cacheEpochMigration = (version: number): Migration => ({
  version,
  name: 'per-class cache tokens (stale responses never re-cache a dropped class)',
  up: async (tx) => {
    await tx.exec(`
      ALTER TABLE sync_meta ADD COLUMN cache_epoch INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sync_meta ADD COLUMN allowed_seq INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE cache_class_epoch (
        class_id  TEXT PRIMARY KEY,
        epoch     INTEGER NOT NULL
      );
      CREATE TABLE cache_allowed_classes (
        class_id  TEXT PRIMARY KEY
      );
    `);
  },
});

/** What a fetch captured before its request; pass it to the cache write. */
export interface CacheToken {
  readonly epoch: number;
  readonly classEpoch: number;
  readonly allowedSeq: number;
}

/**
 * Read it BEFORE sending the request whose answer will be cached for `classId`. It also registers the class in
 * cache_class_epoch (epoch 0 when new), so a later class list without the class bumps its epoch even when the class
 * was never listed or cached before (re-review M1: an older class list arriving late cannot revive this token).
 */
export async function readCacheToken(db: SqlExecutor, classId: string): Promise<CacheToken> {
  await db.run('INSERT INTO cache_class_epoch (class_id, epoch) VALUES (?, 0) ON CONFLICT (class_id) DO NOTHING', [classId]);
  const row = await db.get<{ cache_epoch: number; allowed_seq: number; class_epoch: number }>(
    `SELECT cache_epoch, allowed_seq, COALESCE((SELECT epoch FROM cache_class_epoch WHERE class_id = ?), 0) AS class_epoch
     FROM sync_meta WHERE id = 1`,
    [classId],
  );
  return { epoch: Number(row?.cache_epoch ?? 0), classEpoch: Number(row?.class_epoch ?? 0), allowedSeq: Number(row?.allowed_seq ?? 0) };
}

/** Refuses every write still in flight (purge of every per-class cache). Same transaction as the delete. */
export async function bumpCacheEpoch(tx: SqlExecutor): Promise<void> {
  await tx.run('UPDATE sync_meta SET cache_epoch = cache_epoch + 1 WHERE id = 1');
}

/** Refuses the writes in flight for one class only (the server refused it). Same transaction as the delete. */
export async function bumpClassEpoch(tx: SqlExecutor, classId: string): Promise<void> {
  await tx.run('INSERT INTO cache_class_epoch (class_id, epoch) VALUES (?, 1) ON CONFLICT (class_id) DO UPDATE SET epoch = epoch + 1', [classId]);
}

/**
 * Stores the server's complete class list and moves allowed_seq on: writes in flight for a class not in it are refused.
 * Same transaction as the delete of the caches of the classes not listed.
 */
export async function replaceAllowedClasses(tx: SqlExecutor, classIds: readonly string[]): Promise<void> {
  const ids = [...new Set(classIds)];
  // Re-review M1: every class leaving the list gets its class epoch bumped, so a token captured before stays refused
  // even if an OLDER class-list answer, arriving later, lists the class again (the allow-list part alone would let it
  // through). "Leaving" = known on the device (a token registered by readCacheToken, the old allow-list, or a cached
  // roster/calendar) and not in the new list. Tokens read after a later list re-adds the class are not affected.
  const notListed = ids.length === 0 ? 'WHERE 1' : `WHERE class_id NOT IN (${ids.map(() => '?').join(', ')})`;
  await tx.run(
    `INSERT INTO cache_class_epoch (class_id, epoch)
     SELECT class_id, 1 FROM (
       SELECT class_id FROM cache_class_epoch UNION SELECT class_id FROM cache_allowed_classes
       UNION SELECT class_id FROM class_roster_cache UNION SELECT class_id FROM class_calendar_cache
     ) ${notListed}
     ON CONFLICT (class_id) DO UPDATE SET epoch = epoch + 1`,
    ids,
  );
  await tx.run('UPDATE sync_meta SET allowed_seq = allowed_seq + 1 WHERE id = 1');
  await tx.run('DELETE FROM cache_allowed_classes');
  for (const id of ids) await tx.run('INSERT INTO cache_allowed_classes (class_id) VALUES (?)', [id]);
}

/** Thrown-error filter for a guarded cache write (re-review L2). */
export function cacheWriteFailed(err: unknown): false {
  // Sign-out or revocation closed this workspace while the request was in flight: nothing to cache, nothing to report.
  if (err instanceof DatabaseClosedError) return false;
  // Anything else is a real local-database fault: surface it, but never log record contents (only the error class).
  console.warn(`Class cache write failed (${err instanceof Error ? err.name : 'unknown error'})`);
  return false;
}

/**
 * The condition a guarded cache write appends to its `INSERT … SELECT …` (append `params` after the row's values):
 * true only while the token still holds for `classId`.
 */
export function cacheWriteGuard(token: CacheToken, classId: string): { sql: string; params: SqlValue[] } {
  return {
    sql: `(SELECT cache_epoch FROM sync_meta WHERE id = 1) = ?
      AND COALESCE((SELECT epoch FROM cache_class_epoch WHERE class_id = ?), 0) = ?
      AND ((SELECT allowed_seq FROM sync_meta WHERE id = 1) = ? OR EXISTS (SELECT 1 FROM cache_allowed_classes WHERE class_id = ?))`,
    params: [token.epoch, classId, token.classEpoch, token.allowedSeq, classId],
  };
}
