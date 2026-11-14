// Shared roster helpers (F03): the caller's access actor with their class assignments, the madrasa's "today",
// input normalization, list cursors, and unique-violation mapping. Plan: docs/handover/F03-plan.md.
import { sql } from 'kysely';
import { calendarDateIn } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Executor, Tx } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { accessActor, authorize, type AccessActor, type Action, type Resource } from '../access/policy.ts';
import type { Actor } from '../identity/auth-service.ts';

const membershipOf = (actor: Actor) => ({ userId: actor.userId, organizationId: actor.organizationId, role: actor.role, allClasses: actor.allClasses });

/** The classes a user is assigned to right now (FR-CLS-002). Removing an assignment removes the access (F02-AC8). */
export async function assignedClassIds(db: Executor, organizationId: string, userId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('class_teachers')
    .select('class_id')
    .where('organization_id', '=', organizationId)
    .where('teacher_user_id', '=', userId)
    .where('unassigned_at', 'is', null)
    .execute();
  return rows.map((r) => r.class_id);
}

/** The caller as the access policy sees them, with their current class assignments when they are a Teacher. */
export async function rosterActor(tx: Tx, actor: Actor): Promise<AccessActor> {
  const membership = membershipOf(actor);
  if (actor.role !== 'TEACHER') return accessActor(membership);
  return accessActor(membership, { assignedClassIds: await assignedClassIds(tx, actor.organizationId, actor.userId) });
}

/** The role check alone: FORBIDDEN before anything is loaded, so IDs cannot be probed by a role without the capability. */
export function requireRole(actor: Actor, action: Action): void {
  if (authorize(accessActor(membershipOf(actor)), action) === 'FORBIDDEN') throw new AppError('FORBIDDEN');
}

/** Scope check on a loaded resource: out of scope is the same 404 as a missing ID (FR-SEC-008). */
export function requireAccess(actor: AccessActor, action: Action, resource: Resource): void {
  const decision = authorize(actor, action, resource);
  if (decision === 'FORBIDDEN') throw new AppError('FORBIDDEN');
  if (decision === 'NOT_FOUND') throw new AppError('NOT_FOUND');
}

/** Today's calendar date in the madrasa's timezone (default Asia/Karachi). */
export async function todayFor(db: Executor, organizationId: string, clock: Clock): Promise<string> {
  const org = await db.selectFrom('organizations').select('timezone').where('id', '=', organizationId).executeTakeFirstOrThrow();
  return calendarDateIn(clock.now(), org.timezone);
}

/** Trimmed text, or a REQUIRED field error when blank (F03-AC2). */
export function requiredText(field: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw fieldError(field, 'REQUIRED');
  return trimmed;
}

/** Trimmed optional text; blank becomes null (clearing the value). */
export const optionalText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Escapes LIKE wildcards so a search for "50%" matches the text literally. */
export const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The name of the unique constraint a Postgres error violated, or null. */
export function uniqueViolation(error: unknown): string | null {
  const e = error as { code?: unknown; constraint?: unknown } | null;
  return e && e.code === '23505' && typeof e.constraint === 'string' ? e.constraint : null;
}

// ---------- Student list cursors (keyset pages, F03-AC8, AC19) ----------

export interface ListCursor {
  /** lower(name) of the last student on the page. */
  n: string;
  /** id of the last student on the page. */
  i: string;
}

export const encodeCursor = (cursor: ListCursor): string => Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

export function decodeCursor(value: string): ListCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as ListCursor).n === 'string' &&
      typeof (parsed as ListCursor).i === 'string' &&
      /^[0-9a-f-]{36}$/i.test((parsed as ListCursor).i)
    ) {
      return { n: (parsed as ListCursor).n, i: (parsed as ListCursor).i };
    }
  } catch {
    // fall through
  }
  throw fieldError('cursor', 'INVALID');
}

/** `lower(name)` exactly as Postgres computes it, for the keyset comparison. */
export const lowerName = sql<string>`lower(students.name)`;
