// F08 · Online homework requests (contract packages/contracts/src/homework.ts). Every answer is the server's: the app
// never trusts its own copy of a permission. Offline, these throw ApiFailure NETWORK and the screens use the device.
import type { ClassScheduleResponse, ExceptionListResponse, HomeworkListResponse, HomeworkSuggestionResponse, ReviseHomeworkRequest, ReviseHomeworkResponse } from '@hifz/contracts';
import { addDays } from '@hifz/domain/roster';
import type { SqlDriver } from '../../local-db/driver.ts';
import { cacheWriteFailed, readCacheToken } from '../../sync/cacheEpoch.ts';
import { cacheCalendar, storeViews } from './local.ts';

interface Authorized {
  authorized<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T>;
}

/**
 * Caches the class's schedule and calendar exceptions around `today` (due-date default and carry-over on the device).
 * The class's cache token is read BEFORE the requests, so an answer that arrives after the class was dropped (class
 * list, refusal, lock, sign-out, scope reset) is not cached (sync/cacheEpoch.ts). Returns whether the calendar was cached.
 * A write to a workspace closed meanwhile (sign-out) is ignored; any other write fault is reported without data
 * (cacheWriteFailed) and returns false; request failures still throw.
 */
export async function refreshCalendar(session: Authorized, db: SqlDriver, classId: string, today: string): Promise<boolean> {
  const token = await readCacheToken(db, classId);
  const [schedule, exceptions] = await Promise.all([
    session.authorized<ClassScheduleResponse>(`/classes/${classId}/schedule`),
    session.authorized<ExceptionListResponse>(`/calendar/exceptions?from=${addDays(today, -60)}&to=${addDays(today, 150)}`),
  ]);
  return cacheCalendar(db, token, classId, schedule.versions, exceptions.items, new Date().toISOString()).catch(cacheWriteFailed);
}

/** A student's homework from the server (staff view: state, carry-over, names), stored on the device. */
export async function fetchHomework(session: Authorized, db: SqlDriver, studentId: string): Promise<HomeworkListResponse> {
  const res = await session.authorized<HomeworkListResponse>(`/homework/assignments?studentId=${studentId}&limit=100`);
  await storeViews(db, res.items);
  return res;
}

/** The server's own suggestion for a synced daily record (plan §2.1). */
export const fetchSuggestion = (session: Authorized, dailyRecordId: string) =>
  session.authorized<HomeworkSuggestionResponse>(`/homework/suggestion?dailyRecordId=${dailyRecordId}`);

/** Owner/Admin revision (FR-HW-012, DEC-B17): online only; a Teacher gets 403 from the server. */
export async function reviseHomework(session: Authorized, db: SqlDriver, id: string, body: ReviseHomeworkRequest): Promise<ReviseHomeworkResponse> {
  const res = await session.authorized<ReviseHomeworkResponse>(`/homework/assignments/${id}/revise`, { method: 'POST', body });
  await storeViews(db, [res.created, res.superseded]);
  return res;
}
