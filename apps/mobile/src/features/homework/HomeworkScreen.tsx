// F08 · Homework: Suggested and Confirmed (design.md §4.9, §5.7, §8; US-033…038; F08-AC3…AC11, AC13…AC15, AC17, AC19…AC21).
// Teacher/Admin/Owner, offline-first. Reads the device; online it refreshes from GET /homework/assignments (the server's
// state, carry-over, and names) and caches the class calendar.
// - A suggestion is a DRAFT card labelled "Suggestion — not confirmed", dashed and never styled like confirmed homework
//   (F08-AC7). Nothing here confirms on its own (F08-AC11).
// - Confirmed homework shows who confirmed it and when, its state (upcoming, due, carried over — absent/holiday,
//   outstanding, attempted; never "failed", F08-AC19), and "Confirmed on device — waiting to sync" while the command is
//   queued (F08-AC20). A confirmation that became a conflict opens Conflict Review (F08-AC21).
// - Revise is offered to Owner/Admin only and online only (F08-AC15, AC17); the server enforces it.
// Every rule is the domain's (packages/domain/homework); this screen only shows its results.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { AttendanceSheetResponse, ClassListResponse, ClassResponse, HomeworkAssignmentView, MeResponse } from '@hifz/contracts';
import type { HomeworkState } from '@hifz/domain/homework';
import { calendarDateIn } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { ConfirmSheet, SyncBanner, SyncStateIcon, useFormatDateTime } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Notice, isolate } from '../../components/ui.tsx';
import { cacheWriteFailed, readCacheToken } from '../../sync/cacheEpoch.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, radius, space } from '../../theme/tokens.ts';
import { cacheRoster, cachedClasses, cachedRoster, forgetRoster, keepRostersOf } from '../attendance/local.ts';
import { readRecord, recordsForStudent, type RecordListRow } from '../daily-entry/local.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import { fetchHomework, fetchSuggestion, refreshCalendar } from './api.ts';
import {
  assignmentSync,
  assignmentsForStudent,
  carriedAttemptIds,
  conflictOpIds,
  countsOf,
  defaultDueOnDevice,
  deviceState,
  displayedAssignment,
  draftPortions,
  rejectDraft,
  saveNewAssignment,
  suggestionsFor,
  tabOf,
  type AssignmentSync,
  type DeviceState,
  type LocalAssignment,
  type LocalHomeworkPortion,
} from './local.ts';
import { PortionLine } from './PortionLine.tsx';

export interface HomeworkParams {
  classId?: string;
  studentId?: string;
}

type Tab = 'SUGGESTED' | 'CONFIRMED';

const STATE_ICONS: Record<HomeworkState, string> = {
  DRAFT: '◇',
  REJECTED: '–',
  SUPERSEDED: '⤳',
  UPCOMING: '◷',
  DUE: '●',
  CARRIED_OVER: '↻',
  OUTSTANDING: '○',
  ATTEMPTED: '✓',
};

/**
 * The tone of a confirmed assignment's state (design.md §2 status tokens; text and icon always shown, review L4):
 * attempted is success; past due and not attempted needs attention (warning); carried over for an absence or a holiday
 * is neutral, never a failure (FR-HW-016).
 */
const STATE_COLORS: Record<HomeworkState, string> = {
  DRAFT: colors.warning,
  REJECTED: colors.neutral,
  SUPERSEDED: colors.neutral,
  UPCOMING: colors.success,
  DUE: colors.success,
  CARRIED_OVER: colors.neutral,
  OUTSTANDING: colors.warning,
  ATTEMPTED: colors.success,
};

interface Row {
  a: LocalAssignment;
  sync: AssignmentSync;
  tab: 'SUGGESTED' | 'CONFIRMED' | 'NONE';
  state: HomeworkState;
  carriedReason: string | null;
  effectiveDue: string | null;
  progress: DeviceState['progress'];
}

export function HomeworkScreen({ me, params, onNew, onOpen, onRevise, onReviewConflict, onSyncQueue }: {
  me: MeResponse;
  params: HomeworkParams;
  onNew: (ctx: { studentId: string; classId: string; studentName: string }) => void;
  onOpen: (assignmentId: string) => void;
  onRevise: (assignmentId: string) => void;
  onReviewConflict: (conflictId: string) => void;
  onSyncQueue: () => void;
}) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const formatTime = useFormatDateTime();
  const timeZone = sync.meta?.orgTimeZone ?? 'Asia/Karachi';
  const staff = me.role === 'OWNER' || me.role === 'ADMIN';

  const [classes, setClasses] = useState<Array<{ id: string; name: string }> | null>(null);
  const [classId, setClassId] = useState<string | null>(params.classId ?? null);
  const [students, setStudents] = useState<Array<{ id: string; name: string; externalStudentId: string | null }> | null>(null);
  const [studentId, setStudentId] = useState<string | null>(params.studentId ?? null);
  const [today, setToday] = useState(() => calendarDateIn(new Date(), timeZone));
  const [tab, setTab] = useState<Tab>('SUGGESTED');
  const [list, setList] = useState<LocalAssignment[] | null>(null);
  const [states, setStates] = useState<Map<string, DeviceState>>(new Map());
  const [views, setViews] = useState<Map<string, HomeworkAssignmentView>>(new Map());
  const [records, setRecords] = useState<RecordListRow[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [info, setInfo] = useState<{ testID: string; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<LocalAssignment | null>(null);
  const [busy, setBusy] = useState(false);
  // Confirmations whose result was a conflict (a SYNCED one settled it; it was not applied, review M1).
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  // The queue as of the last render: read by readLocal without making it (and the refresh) depend on every change.
  const itemsRef = useRef(sync.items);
  itemsRef.current = sync.items;
  const actor = useMemo(() => ({ userId: me.id, name: me.displayName }), [me.id, me.displayName]);

  // Classes: the server's list (a Teacher gets assigned classes only); cached ones offline.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = (await session.authorized<ClassListResponse>('/classes')).items.filter((c: ClassResponse) => c.status === 'ACTIVE');
        // The server's list is the truth: cached rosters of classes no longer listed leave the device.
        if (sync.db) await keepRostersOf(sync.db, res.map((c) => c.id));
        if (live) setClasses(res.map((c) => ({ id: c.id, name: c.name })));
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'NETWORK' && sync.db) {
          if (live) {
            setOffline(true);
            setClasses(await cachedClasses(sync.db));
          }
        } else if (live) setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
      }
    })();
    return () => {
      live = false;
    };
  }, [session, sync.db, t]);

  // The class roster (online: today's attendance sheet; offline: the cached roster) and its calendar.
  useEffect(() => {
    if (!classId || !sync.db) return;
    const db = sync.db;
    let live = true;
    void (async () => {
      const date = calendarDateIn(new Date(), timeZone);
      try {
        // Read before the request: an answer that arrives after this class was dropped is not cached (sync/cacheEpoch.ts).
        const token = await readCacheToken(db, classId);
        const res = await session.authorized<AttendanceSheetResponse>(`/attendance/sheet?classId=${classId}&date=${date}`);
        // A write to a workspace closed meanwhile (sign-out) is ignored, other faults are reported; the roster is still shown.
        await cacheRoster(db, token, classId, res.className, res.students, new Date().toISOString()).catch(cacheWriteFailed);
        if (!live) return;
        setToday(res.today);
        setStudents(res.students.map(({ id, name, externalStudentId }) => ({ id, name, externalStudentId })));
        setOffline(false);
        await refreshCalendar(session, db, classId, res.today).catch(() => undefined);
      } catch (err) {
        if (err instanceof ApiFailure && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) {
          // Refused for this class: forget its cached roster and show none of its students.
          await forgetRoster(db, classId);
          if (live) {
            setStudents([]);
            setDenied(t(`errors.${err.code}`));
          }
          return;
        }
        // Only a missing connection falls back to the device's roster; any other failure is shown as an error.
        if (!(err instanceof ApiFailure && err.code === 'NETWORK')) {
          if (live) setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
          return;
        }
        const cached = await cachedRoster(db, classId);
        if (!live) return;
        setOffline(true);
        setStudents(cached?.students ?? []);
      }
    })();
    return () => {
      live = false;
    };
  }, [classId, session, sync.db, timeZone, t]);

  // The student on screen now. A read or fetch started for another student must not show its results here (a quick
  // switch from student A to B must never list A's homework, or A's records to build from, under B's name).
  const studentRef = useRef(studentId);
  studentRef.current = studentId;

  const readLocal = useCallback(async () => {
    if (!sync.db || !studentId) return;
    const db = sync.db;
    const local = await assignmentsForStudent(db, studentId);
    const conflicted = await conflictOpIds(db);
    const next = new Map<string, DeviceState>();
    // A confirmation the server applied is shown confirmed until the pull brings the row (review M1).
    for (const a of local) next.set(a.id, await deviceState(db, displayedAssignment(a, assignmentSync(itemsRef.current, a, conflicted), actor), today));
    const recent = (await recordsForStudent(db, studentId)).slice(0, 5);
    if (studentRef.current !== studentId) return;
    setSettled(conflicted);
    setStates(next);
    setList(local);
    setRecords(recent);
  }, [actor, studentId, sync.db, today]);

  const refresh = useCallback(async () => {
    if (!sync.db || !studentId) return;
    setError(null);
    await readLocal();
    try {
      const res = await fetchHomework(session, sync.db, studentId);
      if (studentRef.current !== studentId) return;
      setViews(new Map(res.items.map((v) => [v.id, v])));
      setOffline(false);
      await readLocal();
    } catch (err) {
      if (studentRef.current !== studentId) return;
      if (err instanceof ApiFailure && err.code === 'NETWORK') setOffline(true);
      else if (err instanceof ApiFailure && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) setDenied(t(`errors.${err.code}`));
      else setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [readLocal, session, studentId, sync.db, t]);

  useEffect(() => {
    setList(null);
    setViews(new Map());
    setStates(new Map());
    setRecords([]);
    setInfo(null);
  }, [refresh]);
  // Load on focus too: an Owner/Admin revision is an online call with no outbox change, so returning from the editor
  // must re-read the device and the server (F08-AC15). Also runs on first focus and when the student changes.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // A sync acknowledged, refused, or pulled something: re-read the device (and the server view, online).
  useEffect(() => {
    void readLocal();
  }, [sync.items, readLocal]);
  // Only when a sync run ends (running true → false); the first focus already loads, so mounting does not refresh twice.
  const wasRunning = useRef(sync.engine.running);
  useEffect(() => {
    const ended = wasRunning.current && !sync.engine.running;
    wasRunning.current = sync.engine.running;
    if (!ended || !studentId) return;
    void refresh();
  }, [sync.engine.running]);

  const rows: Row[] = useMemo(
    () =>
      (list ?? []).map((stored) => {
        const s = assignmentSync(sync.items, stored, settled);
        const a = displayedAssignment(stored, s, actor);
        const device = states.get(a.id);
        const view = views.get(a.id);
        // The server's state (its own clock, attendance, and calendar) while it matches the device's row.
        const fresh = view && view.rowVersion === a.rowVersion && view.status === a.status;
        return {
          a,
          sync: s,
          tab: tabOf(a, s),
          state: fresh ? view.state : (device?.state ?? (a.status === 'CONFIRMED' ? 'OUTSTANDING' : a.status)),
          carriedReason: fresh ? (view.carriedOver?.reason ?? null) : (device?.carry?.reason ?? null),
          effectiveDue: fresh ? (view.carriedOver?.effectiveDueDate ?? view.dueDate) : (device?.carry?.effectiveDueDate ?? a.dueDate),
          progress: device?.progress ?? new Map(),
        };
      }),
    [actor, list, settled, states, sync.items, views],
  );
  const counts = useMemo(() => countsOf(rows.filter((r) => r.tab !== 'NONE' || r.a.status === 'REJECTED').map((r) => ({ status: r.a.status, state: r.state, portions: [...r.progress.values()], confirm: r.sync.confirm }))), [rows]);
  const suggested = rows.filter((r) => r.tab === 'SUGGESTED');
  const confirmed = rows.filter((r) => r.tab === 'CONFIRMED');

  const student = students?.find((s) => s.id === studentId) ?? null;
  const studentName = student?.name ?? list?.[0]?.studentName ?? '';

  /** A suggestion built on demand from one of the student's records: the server's suggest() online, the device's offline. */
  async function buildFrom(recordId: string) {
    if (!sync.db || !sync.outbox || !studentId || !classId) return;
    const db = sync.db;
    setInfo(null);
    setBusy(true);
    try {
      const record = await readRecord(db, recordId);
      if (!record) return;
      let portions: LocalHomeworkPortion[] = [];
      let dueDate: string | null = null;
      try {
        const res = await fetchSuggestion(session, recordId);
        dueDate = res.defaultDueDate;
        portions = res.portions.map((p) => ({
          id: sync.outbox!.newEntityId(),
          section: p.section,
          position: p.position,
          paraNumber: p.paraNumber,
          range: p.range,
          totalLines: p.totalLines,
          lineCountEdition: null,
          assigned: p.assigned,
          needsReview: p.needsReview,
          origin: 'SUGGESTED',
          sourceAttemptId: p.sourceAttemptId,
          sourceLessonPortionId: p.sourceLessonPortionId,
          sourceHomeworkPortionId: p.sourceHomeworkPortionId,
          instructions: null,
          removed: false,
          sourceReportDate: record.reportDate,
          why: p.why,
        }));
      } catch (err) {
        // Offline, or a record not synced yet: the domain's suggest() over the device's copy (plan §2.1).
        if (err instanceof ApiFailure && err.code !== 'NETWORK' && err.code !== 'NOT_FOUND') throw err;
        portions = draftPortions(suggestionsFor(record, await carriedAttemptIds(db)), record.reportDate, () => sync.outbox!.newEntityId());
        dueDate = await defaultDueOnDevice(db, record.classId, record.reportDate);
      }
      if (portions.length === 0) {
        setInfo({ testID: 'homework.nothingToCarry', text: t('homework.nothingToCarry') });
        return;
      }
      await saveNewAssignment(sync.outbox, {
        studentId,
        classId: record.classId,
        studentName: record.studentName ?? studentName,
        sourceDailyRecordId: record.id,
        assignedDate: record.reportDate,
        dueDate,
        instructions: null,
        portions,
        actor: { userId: me.id, name: me.displayName },
      });
      setInfo({ testID: 'homework.built', text: t('homework.built') });
      setTab('SUGGESTED');
      await readLocal();
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  async function reject(a: LocalAssignment) {
    if (!sync.outbox) return;
    setRejecting(null);
    try {
      await rejectDraft(sync.outbox, a.id);
      await readLocal();
    } catch {
      setError(t('homework.saveFailed'));
    }
  }

  const stateText = (r: Row): string => {
    if (r.a.status === 'SUPERSEDED') return t('homework.states.SUPERSEDED');
    if (r.state === 'CARRIED_OVER' && r.carriedReason) return t(`homework.carried.${r.carriedReason}`);
    return t(`homework.states.${r.state}`);
  };

  // ---------- Render ----------

  if (denied) {
    return (
      <AppScreen title={t('homework.title')} testID="homework.screen">
        <Notice tone="error" testID="homework.denied">{denied}</Notice>
      </AppScreen>
    );
  }

  const draftCard = (r: Row, n: number) => {
    const prefix = `homework.draft.${n}`;
    const active = r.a.portions.filter((p) => !p.removed);
    const sourceDate = active.find((p) => p.sourceReportDate)?.sourceReportDate ?? null;
    const failure = r.sync.state === 'FAILED' ? r.sync.failure : null;
    return (
      <View key={r.a.id} testID={prefix} style={styles.draft}>
        {/* Never styled like confirmed homework (F08-AC7): dashed outline, draft glyph, and the label. */}
        <AppText role="cardTitle" color={colors.warning} testID={`${prefix}.label`}>{`◇ ${t('homework.draftLabel')}`}</AppText>
        <AppText testID={`${prefix}.due`}>{r.a.dueDate ? t('homework.due', { date: isolate(r.a.dueDate) }) : t('homework.dueUnknown')}</AppText>
        {sourceDate ? <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.source`}>{t('homework.source', { date: isolate(sourceDate) })}</AppText> : null}
        {active.map((p, k) => (
          <PortionLine key={p.id} portion={p} testID={`${prefix}.portion.${k + 1}`} showOrigin showWhy />
        ))}
        {r.a.instructions ? <AppText role="helper" testID={`${prefix}.instructions`}>{t('homework.instructionsValue', { text: r.a.instructions })}</AppText> : null}
        {r.sync.state !== 'SYNCED' ? (
          <View style={styles.row}>
            <SyncStateIcon kind={r.sync.state} spinning={r.sync.state === 'SYNCING'} />
            <AppText role="helper" testID={`${prefix}.sync.${r.sync.state}`}>{t(`sync.state.${r.sync.state}`)}</AppText>
          </View>
        ) : null}
        {failure ? <Notice tone="error" testID={`${prefix}.rejected`}>{t('homework.serverRefused')}</Notice> : null}
        <Button testID={`${prefix}.review`} label={t('homework.review')} onPress={() => onOpen(r.a.id)} />
        <Button testID={`${prefix}.reject`} variant="tertiary" label={t('homework.reject')} onPress={() => setRejecting(r.a)} />
      </View>
    );
  };

  const confirmedCard = (r: Row, n: number) => {
    const prefix = `homework.confirmed.${n}`;
    const active = r.a.portions.filter((p) => !p.removed);
    const onDevice = r.sync.confirm === 'ON_DEVICE';
    const by = r.a.confirmedByName ?? (r.a.confirmedBy === me.id || onDevice ? me.displayName : null);
    return (
      <Card key={r.a.id}>
        <View testID={prefix} style={{ gap: space[1] }}>
          {r.sync.confirm === 'CONFLICT' ? (
            <>
              <Notice tone="error" testID={`${prefix}.conflict`}>{t('homework.conflict')}</Notice>
              <Button testID={`${prefix}.reviewConflict`} variant="secondary" label={t('homework.reviewConflict')} onPress={() => r.sync.conflictId && onReviewConflict(r.sync.conflictId)} />
            </>
          ) : onDevice ? (
            <View style={styles.row}>
              <SyncStateIcon kind="PENDING" />
              <AppText color={colors.info} testID={`${prefix}.onDevice`}>{t('homework.confirmedOnDevice')}</AppText>
            </View>
          ) : r.sync.confirm === 'FAILED' ? (
            <Notice tone="error" testID={`${prefix}.refused`}>{t('homework.confirmFailed')}</Notice>
          ) : (
            <AppText role="cardTitle" color={r.a.status === 'SUPERSEDED' ? colors.neutral : STATE_COLORS[r.state]} testID={`${prefix}.state`}>
              {`${STATE_ICONS[r.a.status === 'SUPERSEDED' ? 'SUPERSEDED' : r.state]} ${stateText(r)}`}
            </AppText>
          )}
          {r.a.status === 'CONFIRMED' && r.a.confirmedAt ? (
            <AppText role="helper" testID={`${prefix}.by`}>{t('homework.confirmedBy', { name: isolate(by ?? t('dailyRecord.unknownRecorder')), time: formatTime(r.a.confirmedAt) })}</AppText>
          ) : onDevice ? (
            <AppText role="helper" testID={`${prefix}.by`}>{t('homework.confirmedBy', { name: isolate(me.displayName), time: r.sync.confirmedAt ? formatTime(r.sync.confirmedAt) : t('homework.onThisDevice') })}</AppText>
          ) : null}
          <AppText testID={`${prefix}.due`}>{r.a.dueDate ? t('homework.due', { date: isolate(r.a.dueDate) }) : t('homework.dueUnknown')}</AppText>
          {r.state === 'CARRIED_OVER' && r.effectiveDue ? <AppText role="helper" testID={`${prefix}.nowDue`}>{t('homework.nowDue', { date: isolate(r.effectiveDue) })}</AppText> : null}
          {r.a.revisionOf ? <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.revisionOf`}>{t('homework.revisionOf')}</AppText> : null}
          {active.map((p, k) => (
            <PortionLine key={p.id} portion={p} testID={`${prefix}.portion.${k + 1}`} progress={r.progress.get(p.id) ?? null} />
          ))}
          {r.a.instructions ? <AppText role="helper" testID={`${prefix}.instructions`}>{t('homework.instructionsValue', { text: r.a.instructions })}</AppText> : null}
          {/* FR-HW-012, DEC-B17: Owner/Admin only, online only; a Teacher has no Revise control (F08-AC17). */}
          {staff && r.a.status === 'CONFIRMED' && r.sync.confirm === 'NONE' ? (
            sync.online && !offline ? (
              <Button testID={`${prefix}.revise`} variant="secondary" label={t('homework.revise')} onPress={() => onRevise(r.a.id)} />
            ) : (
              <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.reviseOffline`}>{t('homework.reviseOnline')}</AppText>
            )
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <AppScreen title={t('homework.title')} testID="homework.screen">
      {sync.enabled || sync.loadError ? <SyncBanner banner={sync.banner} onPress={onSyncQueue} loadError={sync.loadError} /> : null}
      {offline || !sync.online ? <Notice tone="info" testID="homework.offline">{t('homework.offline')}</Notice> : null}
      {error ? <Notice tone="error" testID="homework.error">{error}</Notice> : null}

      {classes === null && !error ? <AppText color={colors.textSecondary} testID="homework.loading">{t('common.loading')}</AppText> : null}
      {classes?.length === 0 ? <AppText testID="homework.noClasses">{t('daily.noClasses')}</AppText> : null}
      {classes?.length ? (
        <ChipRow label={t('attendance.class')}>
          {classes.map((c) => (
            <Chip
              key={c.id}
              testID={`homework.class.${c.name}`}
              label={c.name}
              selected={c.id === classId}
              onPress={() => {
                setClassId(c.id);
                setStudentId(null);
                setList(null);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      {classId && students && students.length === 0 ? <AppText testID="homework.noStudents">{t('attendance.noStudents')}</AppText> : null}
      {students?.length ? (
        <ChipRow label={t('daily.student')}>
          {students.map((s) => (
            <Chip key={s.id} testID={`homework.student.${s.externalStudentId ?? s.id}`} label={s.name} selected={s.id === studentId} onPress={() => setStudentId(s.id)} />
          ))}
        </ChipRow>
      ) : null}
      {!studentId && students?.length ? <AppText color={colors.textSecondary}>{t('daily.pickStudent')}</AppText> : null}

      {studentId ? (
        <>
          <AppText role="helper" color={colors.textSecondary} testID="homework.counts">
            {t('homework.counts', { draft: isolate(String(counts.draft)), confirmed: isolate(String(counts.confirmed)), carried: isolate(String(counts.carriedOver)) })}
          </AppText>
          <ChipRow label={t('homework.title')}>
            <Chip testID="homework.tab.suggested" label={t('homework.tabSuggested', { count: suggested.length })} selected={tab === 'SUGGESTED'} onPress={() => setTab('SUGGESTED')} />
            <Chip testID="homework.tab.confirmed" label={t('homework.tabConfirmed', { count: confirmed.length })} selected={tab === 'CONFIRMED'} onPress={() => setTab('CONFIRMED')} />
          </ChipRow>
          {info ? <Notice tone="info" testID={info.testID}>{info.text}</Notice> : null}
          {list === null ? <AppText color={colors.textSecondary} testID="homework.loading">{t('common.loading')}</AppText> : null}

          {list !== null && tab === 'SUGGESTED' ? (
            <>
              <AppText role="helper" color={colors.textSecondary}>{t('homework.draftHelp')}</AppText>
              {suggested.length === 0 ? <AppText color={colors.textSecondary} testID="homework.empty.suggested">{t('homework.empty.suggested')}</AppText> : null}
              {suggested.map((r, i) => draftCard(r, i + 1))}
              {records.length ? (
                <Card>
                  <AppText role="cardTitle">{t('homework.buildTitle')}</AppText>
                  <AppText role="helper" color={colors.textSecondary}>{t('homework.buildHelp')}</AppText>
                  {records.map((rec) => (
                    <Button
                      key={rec.id}
                      testID={`homework.buildFrom.${rec.reportDate}`}
                      variant="secondary"
                      busy={busy}
                      label={t('homework.buildFrom', { date: isolate(rec.reportDate) })}
                      onPress={() => void buildFrom(rec.id)}
                    />
                  ))}
                </Card>
              ) : null}
              <Button testID="homework.new" variant="secondary" label={t('homework.new')} onPress={() => classId && onNew({ studentId, classId, studentName })} disabled={!classId} />
            </>
          ) : null}

          {list !== null && tab === 'CONFIRMED' ? (
            <>
              {confirmed.length === 0 ? <AppText color={colors.textSecondary} testID="homework.empty.confirmed">{t('homework.empty.confirmed')}</AppText> : null}
              {confirmed.map((r, i) => confirmedCard(r, i + 1))}
            </>
          ) : null}
        </>
      ) : null}

      <ConfirmSheet visible={rejecting !== null} title={t('homework.rejectTitle')} onCancel={() => setRejecting(null)} testID="homework.reject.sheet">
        <AppText>{t('homework.rejectBody')}</AppText>
        <Button testID="homework.reject.confirm" variant="destructive" label={t('homework.rejectConfirm')} onPress={() => rejecting && void reject(rejecting)} />
        <Button testID="homework.reject.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setRejecting(null)} />
      </ConfirmSheet>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  draft: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.warning,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[2],
    backgroundColor: colors.canvas,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
