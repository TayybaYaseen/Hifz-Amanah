// Bulk Entry — class attendance (US-015, US-016; design.md §4.8; FR-CAL-007, FR-CAL-010, FR-DAY-002A, FR-DAY-010).
// Attendance only: Present / Late / Half day / Leave / Absent. No Sabaq, Sabqi, Manzil, quantity, mistake, or
// quality field exists here (F04-AC6, AGENTS.md §5.10).
// - "Mark all Present" fills only students with no mark; nobody's mark is overwritten (F04-AC7).
// - Save with unmarked students opens "N students not marked": Mark them Absent / Go back. Nothing is saved for them
//   until the Teacher chooses (F04-AC8).
// - Each row is validated and saved on its own; the result shows exact saved / needs-correction counts, and rows that
//   need correction keep what was entered (F04-AC9).
// - Leave needs a reason on that row (F04-AC14, AC21); a Teacher's Leave shows "Leave — awaiting approval" (AC13).
// - Saves go to the device first, one transaction per row with its sync operation (F04-AC12, F12-AC1); the engine
//   syncs them, and a retried send never duplicates (F04-AC10).
// - Holidays, closures, and no-class days show a notice and record nothing (F04-AC5).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AttendanceSheetResponse, ClassListResponse, ClassResponse, DayKind, MeResponse } from '@hifz/contracts';
import {
  ATTENDANCE_STATUSES,
  attendanceLabel,
  bulkSummary,
  changed,
  markAllPresent,
  markUnmarkedAbsent,
  normalizeMark,
  suggestsLate,
  unmarkedStudents,
  validateMark,
  type AttendanceStatus,
  type BulkRow,
  type BulkSummary,
  type Mark,
  type MarkingRole,
  type RowOutcome,
} from '@hifz/domain/calendar';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { isolate } from '../../i18n/direction.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import { attendanceHandler, cacheRoster, cachedClasses, cachedRoster, readMarks, saveMark, type LocalMark } from './local.ts';

interface SheetStudent {
  id: string;
  name: string;
  externalStudentId: string | null;
  recited: boolean;
}

interface Sheet {
  className: string;
  today: string;
  /** The day type from the server; null when the sheet was opened offline (the server re-checks on sync). */
  day: { kind: DayKind; label: string | null } | null;
  students: SheetStudent[];
}

type BulkRowL = BulkRow & { saved: LocalMark | null };

const STATUS_KEY: Record<AttendanceStatus, string> = {
  PRESENT: 'attendance.statuses.PRESENT',
  LATE: 'attendance.statuses.LATE',
  HALF_DAY: 'attendance.statuses.HALF_DAY',
  LEAVE: 'attendance.statuses.LEAVE',
  ABSENT: 'attendance.statuses.ABSENT',
};

export function BulkEntryScreen({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const timeZone = sync.meta?.orgTimeZone ?? 'Asia/Karachi';
  const role = me.role as MarkingRole;

  const [classes, setClasses] = useState<Array<{ id: string; name: string }> | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [date, setDate] = useState(() => calendarDateIn(new Date(), timeZone));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [rows, setRows] = useState<BulkRowL[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<BulkSummary | null>(null);

  // Classes: the server's list when online (a Teacher gets assigned classes only); the cached ones offline.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const list = (await session.authorized<ClassListResponse>('/classes')).items.filter((c: ClassResponse) => c.status === 'ACTIVE');
        if (live) setClasses(list.map((c) => ({ id: c.id, name: c.name })));
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'NETWORK' && sync.db) {
          if (live) setClasses(await cachedClasses(sync.db));
        } else if (live) setLoadError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
      }
    })();
    return () => {
      live = false;
    };
  }, [session, sync.db, t]);

  const load = useCallback(async () => {
    if (!classId || !sync.db) return;
    const db = sync.db;
    setLoadError(null);
    setSummary(null);
    setRowErrors({});
    let next: Sheet | null = null;
    try {
      const res = await session.authorized<AttendanceSheetResponse>(`/attendance/sheet?classId=${classId}&date=${date}`);
      await cacheRoster(db, classId, res.className, res.students, new Date().toISOString());
      // Server records the device has not pulled yet become local rows, so an edit can be queued against them.
      const local = await readMarks(db, classId, date);
      for (const s of res.students) {
        if (s.record && !local.has(s.id)) {
          const { id, rowVersion, ...fields } = s.record;
          await attendanceHandler.upsertFromServer(db, id, rowVersion, fields);
        }
      }
      next = { className: res.className, today: res.today, day: res.day, students: res.students.map(({ id, name, externalStudentId, recited }) => ({ id, name, externalStudentId, recited })) };
      setOffline(false);
    } catch (err) {
      if (!(err instanceof ApiFailure && err.code === 'NETWORK')) {
        setLoadError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
        setSheet(null);
        return;
      }
      const cached = await cachedRoster(db, classId);
      if (!cached) {
        setLoadError(t('attendance.offlineNoRoster'));
        setSheet(null);
        return;
      }
      next = { className: cached.className, today: calendarDateIn(new Date(), timeZone), day: null, students: cached.students.map((s) => ({ ...s, recited: false })) };
      setOffline(true);
    }
    const marks = await readMarks(db, classId, date);
    setSheet(next);
    setRows(next.students.map((s) => ({ studentId: s.id, saved: marks.get(s.id) ?? null, draft: null })));
  }, [classId, date, session, sync.db, t, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  // When the queue changes (a sync acknowledged a mark, or a pull brought a newer one), re-read the device's marks so
  // "waiting to sync" turns into the synced status. Drafts the Teacher is editing are kept.
  useEffect(() => {
    if (!classId || !sync.db || !sheet) return;
    let live = true;
    void readMarks(sync.db, classId, date).then((marks) => {
      if (live) setRows((prev) => prev.map((r) => ({ ...r, saved: marks.get(r.studentId) ?? r.saved })));
    });
    return () => {
      live = false;
    };
  }, [sync.items, sync.db, classId, date, sheet]);

  const names = useMemo(() => new Map(sheet?.students.map((s) => [s.id, s.name]) ?? []), [sheet]);
  const recited = useMemo(() => new Map(sheet?.students.map((s) => [s.id, s.recited]) ?? []), [sheet]);
  const today = sheet?.today ?? calendarDateIn(new Date(), timeZone);
  const workingDay = !sheet?.day || sheet.day.kind === 'SCHEDULED';
  const future = date > today;
  const canEdit = Boolean(sheet) && workingDay && !future && Boolean(sync.outbox);

  const setDraft = (studentId: string, update: (current: Mark | null) => Mark) => {
    setSummary(null);
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, draft: update(r.draft ?? r.saved) } : r)));
    setRowErrors(({ [studentId]: _, ...rest }) => rest);
  };

  async function commit(toSave: BulkRowL[]) {
    if (!classId || !sheet || !sync.outbox || !sync.db) return;
    setBusy(true);
    try {
      await commitRows(toSave, classId, sheet);
    } finally {
      setBusy(false);
    }
  }

  async function commitRows(toSave: BulkRowL[], classId: string, sheet: Sheet) {
    if (!sync.outbox || !sync.db) return;
    const outcomes: RowOutcome[] = [];
    const errors: Record<string, string> = {};
    for (const row of toSave.filter(changed)) {
      const mark = normalizeMark(row.draft!);
      const issues = validateMark(mark, {
        reportDate: date,
        today,
        dayKind: sheet.day?.kind ?? 'SCHEDULED',
        enrolled: true,
        recited: recited.get(row.studentId) ?? false,
      });
      if (issues.length) {
        const issue = issues[0]!;
        errors[row.studentId] = t(issue.field === 'leaveReason' && issue.code === 'REQUIRED' ? 'attendance.reasonRequired' : `fields.${issue.code}`);
        outcomes.push('NEEDS_CORRECTION');
        continue;
      }
      try {
        await saveMark(sync.outbox, { studentId: row.studentId, label: names.get(row.studentId) ?? '', existing: row.saved, mark }, { classId, date, role });
        outcomes.push('SAVED');
      } catch {
        errors[row.studentId] = t('attendance.rowSaveFailed');
        outcomes.push('NEEDS_CORRECTION');
      }
    }
    const marks = await readMarks(sync.db, classId, date);
    // Saved rows show the stored mark; rows that need correction keep what was entered (design §4.8).
    const next = toSave.map((r) => (errors[r.studentId] ? r : { ...r, saved: marks.get(r.studentId) ?? r.saved, draft: null }));
    setRows(next);
    setRowErrors(errors);
    setSummary(bulkSummary(outcomes, unmarkedStudents(next).length));
  }

  function onSave() {
    const missing = unmarkedStudents(rows);
    if (missing.length) {
      setDialog(missing);
      return;
    }
    void commit(rows);
  }

  return (
    <AppScreen title={t('attendance.title')} testID="bulk.screen">
      <Notice tone="info" testID="bulk.attendanceOnly">{t('attendance.attendanceOnly')}</Notice>
      {classes === null && !loadError ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {classes?.length === 0 ? <AppText testID="bulk.noClasses">{t('attendance.noClasses')}</AppText> : null}
      {classes?.length ? (
        <ChipRow label={t('attendance.class')}>
          {classes.map((c) => (
            <Chip key={c.id} testID={`bulk.class.${c.name}`} label={c.name} selected={c.id === classId} onPress={() => setClassId(c.id)} />
          ))}
        </ChipRow>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <Button testID="bulk.prevDay" variant="secondary" label={t('attendance.prevDay')} onPress={() => setDate((d) => addDays(d, -1))} />
        <AppText role="cardTitle" testID="bulk.date">{isolate(date)}</AppText>
        <Button testID="bulk.nextDay" variant="secondary" label={t('attendance.nextDay')} disabled={date >= today} onPress={() => setDate((d) => addDays(d, 1))} />
        {date !== today ? <Button testID="bulk.today" variant="secondary" label={t('attendance.today')} onPress={() => setDate(today)} /> : null}
      </View>

      {loadError ? (
        <>
          <Notice tone="error" testID="bulk.error">{loadError}</Notice>
          <Button testID="bulk.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
        </>
      ) : null}
      {!classId && classes?.length ? <AppText color={colors.textSecondary}>{t('attendance.pickClass')}</AppText> : null}
      {offline ? <Notice tone="info" testID="bulk.offline">{t('attendance.offlineSheet')}</Notice> : null}
      {sheet && !workingDay ? (
        <Notice tone="info" testID={`bulk.day.${sheet.day!.kind}`}>
          {t(`attendance.day.${sheet.day!.kind}`, { label: sheet.day!.label ?? '' })}
        </Notice>
      ) : null}
      {sheet && future ? <Notice tone="info" testID="bulk.future">{t('fields.FUTURE')}</Notice> : null}
      {summary ? (
        <Notice tone={summary.needsCorrection ? 'error' : 'success'} testID="bulk.summary">
          {t('attendance.summary', { saved: summary.saved, needsCorrection: summary.needsCorrection, notMarked: summary.notMarked })}
        </Notice>
      ) : null}

      {sheet && canEdit && rows.length ? (
        <Button testID="bulk.markAllPresent" variant="secondary" label={t('attendance.markAllPresent')} onPress={() => setRows((r) => markAllPresent(r) as BulkRowL[])} />
      ) : null}
      {sheet && rows.length === 0 ? <AppText testID="bulk.empty">{t('attendance.noStudents')}</AppText> : null}

      {sheet && workingDay && !future
        ? rows.map((row) => {
            const name = names.get(row.studentId) ?? '';
            const current = row.draft ?? row.saved;
            const error = rowErrors[row.studentId];
            return (
              <Card key={row.studentId}>
                <AppText role="cardTitle">{isolate(name)}</AppText>
                {row.saved ? (
                  <AppText role="helper" color={colors.textSecondary} testID={`bulk.row.${name}.saved`}>
                    {t(`attendance.label.${attendanceLabel(row.saved)}`)}
                    {row.saved.rowVersion === null ? ` · ${t('attendance.waitingToSync')}` : ''}
                  </AppText>
                ) : (
                  <AppText role="helper" color={colors.textSecondary} testID={`bulk.row.${name}.unmarked`}>
                    {t('attendance.notMarked')}
                  </AppText>
                )}
                <ChipRow label={t('attendance.statusFor', { name })}>
                  {ATTENDANCE_STATUSES.map((status) => (
                    <Chip
                      key={status}
                      testID={`bulk.row.${name}.${status}`}
                      label={t(STATUS_KEY[status])}
                      selected={current?.status === status}
                      onPress={() => setDraft(row.studentId, (c) => ({ status, leaveReason: c?.leaveReason ?? null, absentNote: c?.absentNote ?? null }))}
                    />
                  ))}
                </ChipRow>
                {current?.status === 'LEAVE' ? (
                  <Field
                    testID={`bulk.row.${name}.reason`}
                    label={t('attendance.leaveReason')}
                    helper={t('attendance.internalOnly')}
                    value={current.leaveReason ?? ''}
                    onChangeText={(text) => setDraft(row.studentId, (c) => ({ status: 'LEAVE', leaveReason: text, absentNote: c?.absentNote ?? null }))}
                  />
                ) : null}
                {suggestsLate(current?.status ?? null, recited.get(row.studentId) ?? false) ? (
                  <>
                    <Notice tone="info">{t('attendance.recitedSuggestLate')}</Notice>
                    <Button
                      testID={`bulk.row.${name}.markLate`}
                      variant="secondary"
                      label={t('attendance.markLateInstead')}
                      onPress={() => setDraft(row.studentId, () => ({ status: 'LATE', leaveReason: null, absentNote: null }))}
                    />
                    <Field
                      testID={`bulk.row.${name}.absentNote`}
                      label={t('attendance.absentNote')}
                      helper={t('attendance.internalOnly')}
                      value={current?.absentNote ?? ''}
                      onChangeText={(text) => setDraft(row.studentId, () => ({ status: 'ABSENT', leaveReason: null, absentNote: text }))}
                    />
                  </>
                ) : null}
                {error ? (
                  <AppText role="helper" color={colors.danger} testID={`bulk.row.${name}.error`}>
                    {`⚠ ${error}`}
                  </AppText>
                ) : null}
              </Card>
            );
          })
        : null}

      {/* The "not marked" dialog opens beside Save, where the Teacher's eyes are (FR-CAL-010). */}
      {dialog ? (
        <Card>
          <AppText role="cardTitle" testID="bulk.unmarked.title">{t('attendance.unmarkedTitle', { count: dialog.length })}</AppText>
          {dialog.map((id) => (
            <AppText key={id}>{names.get(id)}</AppText>
          ))}
          <Button
            testID="bulk.unmarked.absent"
            label={t('attendance.markThemAbsent')}
            onPress={() => {
              const next = markUnmarkedAbsent(rows, dialog) as BulkRowL[];
              setDialog(null);
              void commit(next);
            }}
          />
          <Button testID="bulk.unmarked.back" variant="secondary" label={t('attendance.goBack')} onPress={() => setDialog(null)} />
        </Card>
      ) : null}
      {summary ? (
        <Notice tone={summary.needsCorrection ? 'error' : 'success'} testID="bulk.summaryBottom">
          {t('attendance.summary', { saved: summary.saved, needsCorrection: summary.needsCorrection, notMarked: summary.notMarked })}
        </Notice>
      ) : null}
      {sheet && canEdit && rows.length && !dialog ? (
        <Button testID="bulk.save" label={t('attendance.save')} busy={busy} busyLabel={t('common.saving')} onPress={onSave} />
      ) : null}
    </AppScreen>
  );
}
