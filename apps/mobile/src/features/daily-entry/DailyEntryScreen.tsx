// F05 · Daily Entry (design.md §4.7; UI spec §2; US-018…023; F05-AC1…AC22). Teacher/Admin/Owner, offline-first.
// - Context: date ≤ today in the madrasa's timezone (F05-AC17), class, student, and a session label in MULTI_SESSION
//   only (F05-AC7). SINGLE mode opens the existing record instead of starting a second one (F05-AC6).
// - Attendance first, with F04's rules (validateMark, "Mark Late instead"); Absent or Leave replaces the sections by
//   "Change to Late" (F05-AC18) and no portion control exists (F05-AC5).
// - Three separate section cards (F05-AC13), several Sabqi/Manzil portions each with its own outcome (F05-AC11).
// - Save validates every portion through the domain; errors name the section and portion and every value is kept
//   (F05-AC3). Then ONE SQLite transaction writes the attendance change, record, portions, attempts, and all their
//   operations (F12-AC1) before "Saved on this device" is shown on the record.
// - Edit mode (`recordId`) corrects the portions and their latest attempts (UI spec 8.7) with audited UPDATEs.
// Form state never holds localized text, so a language switch keeps every value (F05 edge case).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OVERALL_LABELS, type OverallLabel } from '@hifz/domain/quality';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AttendanceSheetResponse, ClassListResponse, ClassResponse, DailyRecordDetail, DailyRecordListResponse, DayKind, MeResponse, OrganizationSettingsResponse } from '@hifz/contracts';
import { ATTENDANCE_STATUSES, attendanceLabel, normalizeMark, suggestsLate, validateMark, type AttendanceStatus, type Mark, type MarkingRole } from '@hifz/domain/calendar';
import { checkNewRecord, normalizeSessionLabel, portionsAllowed, sabqiDefaultPara, SESSION_LABEL_MAX, type DailyReportMode } from '@hifz/domain/hifz';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { ConfirmSheet, SavedOnDeviceNotice, SyncBanner } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice, isolate } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { attendanceHandler, cacheRoster, cachedClasses, cachedRoster, readMarks, readStudentMark, type LocalMark } from '../attendance/local.ts';
import { useQuranReference } from '../quran/QuranReferenceContext.tsx';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import {
  SECTION_LIST,
  attemptWrite,
  issueSlot,
  newPortion,
  portionDiff,
  portionFromSaved,
  portionIssues,
  portionWrite,
  sabaqParaOf,
  sectionSlug,
  type FormIssue,
  type PortionForm,
} from './form.ts';
import { cacheReportMode, readCachedReportMode, readRecord, recitedOn, recordsOn, saveCorrection, saveNewEntry, storeDetail, type LocalRecord, type PortionCorrection, type Section } from './local.ts';
import { PortionCard, portionTitle, type SlotErrors } from './PortionCard.tsx';
import { recordRejections } from './rejections.ts';

interface Student {
  id: string;
  name: string;
  externalStudentId: string | null;
}

interface Sheet {
  students: Student[];
  /** Null offline: the server re-checks the day on sync. */
  day: { kind: DayKind; label: string | null } | null;
  recited: Map<string, boolean>;
  today: string | null;
}

const STATUS_KEY = (s: AttendanceStatus) => `attendance.statuses.${s}`;

export interface DailyEntryParams {
  classId?: string;
  studentId?: string;
  date?: string;
  recordId?: string;
}

export function DailyEntryScreen({ me, params, onSaved, onOpenRecord, onSyncQueue }: {
  me: MeResponse;
  params: DailyEntryParams;
  onSaved: (recordId: string, edited: boolean) => void;
  onOpenRecord: (recordId: string) => void;
  onSyncQueue: () => void;
}) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const ref = useQuranReference();
  const index = ref.index;
  const timeZone = sync.meta?.orgTimeZone ?? 'Asia/Karachi';
  const role = me.role as MarkingRole;
  const editing = Boolean(params.recordId);

  const [mode, setMode] = useState<DailyReportMode | null>(null);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }> | null>(null);
  const [classId, setClassId] = useState<string | null>(params.classId ?? null);
  const [date, setDate] = useState(() => params.date ?? calendarDateIn(new Date(), timeZone));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [offline, setOffline] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(params.studentId ?? null);
  const [existing, setExisting] = useState<Array<{ id: string; sessionLabel: string | null }> | null>(null);
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const [sessionLabel, setSessionLabel] = useState('');
  // F07 · The record's overall performance label (US-032): optional, never derived from the portions' quality.
  const [overallLabel, setOverallLabel] = useState<OverallLabel | null>(null);
  const [savedMark, setSavedMark] = useState<LocalMark | null>(null);
  const [draftMark, setDraftMark] = useState<Mark | null>(null);
  const [recitedLocal, setRecitedLocal] = useState(false);
  const [portions, setPortions] = useState<PortionForm[]>([]);
  const [removedSaved, setRemovedSaved] = useState<string[]>([]);
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [contextErrors, setContextErrors] = useState<{ session?: string; sessionTakenId?: string; reason?: string; absentNote?: string }>({});
  const [confirmRemove, setConfirmRemove] = useState<PortionForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [record, setRecord] = useState<LocalRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(editing);
  const keySeq = useRef(0);

  const today = sheet?.today ?? calendarDateIn(new Date(), timeZone);
  const future = date > today;

  // The daily-report mode: fetched when online and cached for offline use (UI spec 8.8); unknown → the session label
  // is optional and the server decides on sync.
  useEffect(() => {
    if (!sync.db) return;
    const db = sync.db;
    let live = true;
    void readCachedReportMode(db).then((cached) => {
      if (live && cached) setMode((m) => m ?? cached);
    });
    session
      .authorized<OrganizationSettingsResponse>('/organization')
      .then(async (org) => {
        if (!live) return;
        setMode(org.dailyReportMode);
        await cacheReportMode(db, org.dailyReportMode);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session, sync.db]);

  // Edit mode: the record from the device (or the server, online, if it is not on the device yet).
  useEffect(() => {
    if (!editing || !sync.db || !params.recordId) return;
    const db = sync.db;
    let live = true;
    void (async () => {
      let local = await readRecord(db, params.recordId!);
      if (!local) {
        try {
          const detail = await session.authorized<DailyRecordDetail>(`/hifz/daily-records/${params.recordId}`);
          await storeDetail(db, detail, { studentName: detail.record.studentName, className: null });
          local = await readRecord(db, params.recordId!);
        } catch (err) {
          if (live) setDenied(t(err instanceof ApiFailure && err.code === 'NETWORK' ? 'dailyRecord.notOnDevice' : (errorKeys(err).form ?? 'errors.INTERNAL')));
        }
      }
      if (!live) return;
      setRecordLoading(false);
      if (!local) return;
      setRecord(local);
      setClassId(local.classId);
      setStudentId(local.studentId);
      setDate(local.reportDate);
      setSessionLabel(local.sessionLabel ?? '');
      setOverallLabel(local.overallLabel);
      setPortions(local.portions.filter((p) => !p.removed).map(portionFromSaved));
    })();
    return () => {
      live = false;
    };
  }, [editing, params.recordId, session, sync.db, t]);

  // Classes: the server's list (a Teacher gets assigned classes only); the cached ones offline.
  useEffect(() => {
    if (editing) return;
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
  }, [editing, session, sync.db, t]);

  // The class roster and attendance for the date (online: the attendance sheet; offline: the cached roster).
  const loadSheet = useCallback(async () => {
    if (!classId || !sync.db) return;
    const db = sync.db;
    setLoadError(null);
    try {
      const res = await session.authorized<AttendanceSheetResponse>(`/attendance/sheet?classId=${classId}&date=${date}`);
      await cacheRoster(db, classId, res.className, res.students, new Date().toISOString());
      const local = await readMarks(db, classId, date);
      for (const s of res.students) {
        if (s.record && !local.has(s.id)) {
          const { id, rowVersion, ...fields } = s.record;
          await attendanceHandler.upsertFromServer(db, id, rowVersion, fields);
        }
      }
      setSheet({
        students: res.students.map(({ id, name, externalStudentId }) => ({ id, name, externalStudentId })),
        day: res.day,
        recited: new Map(res.students.map((s) => [s.id, s.recited])),
        today: res.today,
      });
      setOffline(false);
    } catch (err) {
      if (err instanceof ApiFailure && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) {
        setDenied(t(`errors.${err.code}`));
        return;
      }
      if (!(err instanceof ApiFailure && err.code === 'NETWORK')) {
        setLoadError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
        return;
      }
      const cached = await cachedRoster(db, classId);
      setOffline(true);
      setSheet(cached ? { students: cached.students, day: null, recited: new Map(), today: null } : { students: [], day: null, recited: new Map(), today: null });
      if (!cached) setLoadError(t('attendance.offlineNoRoster'));
    }
  }, [classId, date, session, sync.db, t]);

  useEffect(() => {
    void loadSheet();
  }, [loadSheet]);

  // The student's attendance and records on the date (local first; the server's list when online).
  useEffect(() => {
    if (!studentId || !sync.db) return;
    const db = sync.db;
    let live = true;
    setDuplicateDismissed(false);
    void (async () => {
      const mark = await readStudentMark(db, studentId, date);
      const recited = await recitedOn(db, studentId, date);
      const localRecords = await recordsOn(db, studentId, date);
      if (!live) return;
      setSavedMark(mark);
      setRecitedLocal(recited);
      setExisting(localRecords);
      try {
        const res = await session.authorized<DailyRecordListResponse>(`/hifz/daily-records?studentId=${studentId}&date=${date}`);
        if (!live) return;
        const merged = new Map(localRecords.map((r) => [r.id, r]));
        for (const r of res.items) merged.set(r.id, { id: r.id, sessionLabel: r.sessionLabel });
        setExisting([...merged.values()]);
      } catch {
        // Offline (or the list is not available): the device's records only; the server re-checks on sync.
      }
    })();
    return () => {
      live = false;
    };
  }, [studentId, date, session, sync.db, sheet]);

  const students = sheet?.students ?? [];
  const student = students.find((s) => s.id === studentId) ?? null;
  const studentName = record?.studentName ?? student?.name ?? '';
  const className = classes?.find((c) => c.id === classId)?.name ?? record?.className ?? '';
  const workingDay = !sheet?.day || sheet.day.kind === 'SCHEDULED';
  const currentMark: Mark | null = draftMark ?? savedMark;
  const allowed = portionsAllowed(currentMark?.status ?? null);
  const recited = (studentId ? sheet?.recited.get(studentId) : false) || recitedLocal || (record?.portions.some((p) => !p.removed && p.attempts.length > 0) ?? false);
  const otherRecords = (existing ?? []).filter((r) => r.id !== record?.id);
  const duplicate = !editing && mode === 'SINGLE' && otherRecords.length > 0 ? otherRecords[0]! : null;
  const showSession = mode === 'MULTI_SESSION' || (mode === null && (!editing || Boolean(record?.sessionLabel)));
  const contextReady = Boolean(studentId) && !future && workingDay && !denied && (!editing || record !== null);

  // Server rejections of this record's operations, shown on the right portion (edit mode).
  const rejections = useMemo(() => (record ? recordRejections(sync.items, record) : null), [record, sync.items]);

  const sabqiDefault = useMemo(
    () =>
      sabqiDefaultPara(
        portions
          .filter((p) => p.section === 'SABAQ')
          .map((p, i) => ({ position: i + 1, paraNumber: p.savedId ? (record?.portions.find((r) => r.id === p.savedId)?.paraNumber ?? sabaqParaOf(p, index)) : sabaqParaOf(p, index) })),
      ),
    [portions, index, record],
  );

  const numbered = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of SECTION_LIST) portions.filter((p) => p.section === s).forEach((p, i) => out.set(p.key, i + 1));
    return out;
  }, [portions]);

  const nextKey = () => {
    keySeq.current += 1;
    return `new-${keySeq.current}`;
  };

  const addPortion = (section: Section, isExtra: boolean) => {
    setSaveError(null);
    setPortions((list) => [...list, newPortion(nextKey(), section, { isExtra, sabqiPara: section === 'SABQI' ? sabqiDefault : null })]);
  };

  const updatePortion = (next: PortionForm) => {
    setSaveError(null);
    setPortions((list) => list.map((p) => (p.key === next.key ? next : p)));
    // Errors clear on the next change to that portion; the others stay until the next save.
    setIssues((list) => list.filter((i) => i.portionKey !== next.key));
  };

  const removePortion = (form: PortionForm) => {
    setPortions((list) => list.filter((p) => p.key !== form.key));
    setIssues((list) => list.filter((i) => i.portionKey !== form.key));
    if (form.savedId) setRemovedSaved((ids) => [...ids, form.savedId!]);
    setConfirmRemove(null);
  };

  const setMark = (mark: Mark) => {
    setSaveError(null);
    setAttendanceSaved(false);
    setDraftMark(mark);
    setContextErrors((e) => ({ ...e, reason: undefined, absentNote: undefined }));
  };

  const errorsFor = (form: PortionForm): SlotErrors => {
    const out: SlotErrors = {};
    const number = numbered.get(form.key) ?? 1;
    const portion = portionTitle(t, form.section, number);
    const render = (i: { messageKey: string; params?: Record<string, number> }) =>
      t('daily.portionError', { portion, message: t(`daily.fieldError.${i.messageKey}`, Object.fromEntries(Object.entries(i.params ?? {}).map(([k, v]) => [k, isolate(String(v))]))) });
    for (const i of issues.filter((x) => x.portionKey === form.key)) out[issueSlot(i)] ??= render(i);
    for (const r of rejections?.portions.filter((x) => x.portionId === form.savedId) ?? []) out[r.field] ??= render(r);
    return out;
  };

  async function save() {
    if (!sync.outbox || !studentId || !classId) return;
    setSaveError(null);
    setAttendanceSaved(false);
    // 1. Context: session label (F05-AC7) and attendance (F04 rules).
    const ctxErrors: typeof contextErrors = {};
    const label = normalizeSessionLabel(sessionLabel);
    if (!editing && mode !== null) {
      const check = checkNewRecord(mode, otherRecords, mode === 'SINGLE' ? null : sessionLabel);
      if (!check.ok) {
        if (check.code === 'SESSION_LABEL_REQUIRED') ctxErrors.session = t('daily.sessionRequired');
        else if (check.code === 'SESSION_LABEL_TOO_LONG') ctxErrors.session = t('daily.sessionTooLong');
        else if (check.code === 'DUPLICATE_SESSION') {
          ctxErrors.session = t('daily.sessionTaken');
          ctxErrors.sessionTakenId = check.existingId;
        } else if (check.code === 'DUPLICATE_RECORD') {
          setDuplicateDismissed(false);
          return;
        }
      }
    }
    if (label !== null && label.length > SESSION_LABEL_MAX) ctxErrors.session = t('daily.sessionTooLong');
    const markChanged = draftMark !== null && JSON.stringify(normalizeMark(draftMark)) !== JSON.stringify(savedMark ? normalizeMark(savedMark) : null);
    if (draftMark && markChanged) {
      const markIssues = validateMark(normalizeMark(draftMark), { reportDate: date, today, dayKind: sheet?.day?.kind ?? 'SCHEDULED', enrolled: true, recited });
      for (const issue of markIssues) {
        if (issue.field === 'leaveReason') ctxErrors.reason = t(issue.code === 'REQUIRED' ? 'attendance.reasonRequired' : 'fields.TOO_LONG');
        else if (issue.field === 'absentNote') ctxErrors.absentNote = t(`fields.${issue.code}`);
        else setSaveError(t(issue.code === 'FUTURE' ? 'errors.FUTURE_DATE' : `fields.${issue.code}`));
      }
      if (markIssues.some((i) => i.field === 'reportDate' || i.field === 'studentId')) return;
    }
    // 2. Portions, through the domain (F05-AC3): every value kept, every error on its portion.
    const portionList = allowed === 'ALLOWED' ? portions : [];
    const all = portionList.flatMap((p) => portionIssues(p, numbered.get(p.key) ?? 1, index));
    setContextErrors(ctxErrors);
    setIssues(all);
    if (all.length || Object.keys(ctxErrors).length) return;
    if (allowed === 'ATTENDANCE_REQUIRED') return;
    // Absent or Leave on a new entry: only an attendance change is saved (UI spec 8.6); nothing changed, nothing to save.
    if (!editing && allowed !== 'ALLOWED' && !markChanged) return;

    const attendance = draftMark && markChanged ? { input: { studentId, label: studentName, existing: savedMark, mark: draftMark }, ctx: { classId, date, role } } : null;
    const actor = { userId: me.id, name: me.displayName };
    const now = new Date().toISOString();
    setBusy(true);
    try {
      if (!editing) {
        const id = await saveNewEntry(sync.outbox, {
          studentId,
          classId,
          reportDate: date,
          sessionLabel: mode === 'SINGLE' ? null : label,
          overallLabel,
          studentName,
          className,
          actor,
          attendance,
          portions: portionList.map((p) => ({ portion: portionWrite(p, numbered.get(p.key) ?? 1, index), attempt: attemptWrite(p, index) })),
          now,
        });
        if (id) onSaved(id, false);
        else {
          setDraftMark(null);
          setSavedMark(await readStudentMark(sync.db!, studentId, date));
          setAttendanceSaved(true);
        }
        return;
      }
      if (!record) return;
      const corrections: PortionCorrection[] = [];
      if (allowed === 'ALLOWED') {
        for (const p of portions) {
          const position = numbered.get(p.key) ?? 1;
          const write = portionWrite(p, position, index);
          const attempt = attemptWrite(p, index);
          const saved = p.savedId ? record.portions.find((r) => r.id === p.savedId) : undefined;
          if (!saved) {
            corrections.push({ id: null, portion: write, portionChanged: true, positionChanged: false, removed: false, attempt, latestAttemptId: null, outcomeChanged: true, remarksChanged: false });
            continue;
          }
          const diff = portionDiff(saved, write, attempt);
          if (diff.portionChanged || diff.positionChanged || diff.outcomeChanged || diff.remarksChanged) {
            corrections.push({ id: saved.id, portion: write, removed: false, attempt, latestAttemptId: p.latestAttemptId, ...diff });
          }
        }
        for (const id of removedSaved) {
          const saved = record.portions.find((r) => r.id === id);
          if (saved?.assigned) {
            corrections.push({
              id,
              portion: { section: saved.section, position: saved.position, isExtra: saved.isExtra, paraNumber: saved.paraNumber, range: saved.range, assigned: saved.assigned, totalLines: saved.totalLines, totalLinesSource: saved.totalLinesSource },
              portionChanged: false,
              positionChanged: false,
              removed: true,
              attempt: null,
              latestAttemptId: null,
              outcomeChanged: false,
              remarksChanged: false,
            });
          }
        }
      }
      const newLabel = showSession && label !== (record.sessionLabel ?? null) ? label : undefined;
      const newOverall = overallLabel !== record.overallLabel ? overallLabel : undefined;
      await saveCorrection(sync.outbox, { recordId: record.id, reportDate: record.reportDate, studentName, sessionLabel: newLabel, overallLabel: newOverall, attendance, actor, portions: corrections, now });
      onSaved(record.id, true);
    } catch {
      // Nothing was written (one transaction); the form keeps every value.
      setSaveError(t('daily.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Render ----------

  if (denied) {
    return (
      <AppScreen title={t(editing ? 'daily.editTitle' : 'daily.title')} testID="daily.screen">
        <Notice tone="error" testID="daily.denied">{denied}</Notice>
      </AppScreen>
    );
  }
  if (!sync.outbox || recordLoading) {
    return (
      <AppScreen title={t(editing ? 'daily.editTitle' : 'daily.title')} testID="daily.screen">
        <AppText color={colors.textSecondary} testID="daily.loading">{t('common.loading')}</AppText>
      </AppScreen>
    );
  }

  const markTitle = draftMark ? t(STATUS_KEY(draftMark.status)) : savedMark ? t(`attendance.label.${attendanceLabel(savedMark)}`) : t('attendance.notMarked');
  const sectionCards = contextReady && allowed === 'ALLOWED';
  const needsPortion = allowed === 'ALLOWED' && portions.length === 0;
  const saveDisabled = busy || !contextReady || allowed === 'ATTENDANCE_REQUIRED' || needsPortion || duplicate !== null;

  return (
    <AppScreen title={t(editing ? 'daily.editTitle' : 'daily.title')} testID="daily.screen">
      {sync.enabled || sync.loadError ? <SyncBanner banner={sync.banner} onPress={onSyncQueue} loadError={sync.loadError} /> : null}
      {offline || !sync.online ? <Notice tone="info" testID="daily.offline">{t('daily.offline')}</Notice> : null}
      {editing ? <Notice tone="info" testID="daily.editHelp">{t('daily.editHelp')}</Notice> : null}

      {/* Step 1 · Context */}
      {editing ? (
        <Card>
          <AppText role="cardTitle" testID="daily.date">{isolate(date)}</AppText>
          {className ? <AppText testID="daily.class">{t('dailyRecord.class', { name: isolate(className) })}</AppText> : null}
          <AppText testID="daily.student">{isolate(studentName)}</AppText>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <Button testID="daily.prevDay" variant="secondary" label={t('attendance.prevDay')} onPress={() => setDate((d) => addDays(d, -1))} />
            <AppText role="cardTitle" testID="daily.date">{isolate(date)}</AppText>
            <Button testID="daily.nextDay" variant="secondary" label={t('attendance.nextDay')} disabled={date >= today} onPress={() => setDate((d) => addDays(d, 1))} />
            {date !== today ? <Button testID="daily.today" variant="secondary" label={t('attendance.today')} onPress={() => setDate(today)} /> : null}
          </View>
          {future ? <Notice tone="info" testID="daily.future">{t('daily.futureNotAllowed')}</Notice> : null}
          {classes === null && !loadError ? <AppText color={colors.textSecondary} testID="daily.loading">{t('common.loading')}</AppText> : null}
          {classes?.length === 0 ? <AppText testID="daily.noClasses">{t('daily.noClasses')}</AppText> : null}
          {classes?.length ? (
            <ChipRow label={t('attendance.class')}>
              {classes.map((c) => (
                <Chip
                  key={c.id}
                  testID={`daily.class.${c.name}`}
                  label={c.name}
                  selected={c.id === classId}
                  onPress={() => {
                    setClassId(c.id);
                    setStudentId(null);
                  }}
                />
              ))}
            </ChipRow>
          ) : null}
          {!classId && classes?.length ? <AppText color={colors.textSecondary}>{t('attendance.pickClass')}</AppText> : null}
          {loadError ? (
            <>
              <Notice tone="error" testID={offline ? 'daily.offlineNoRoster' : 'daily.loadError'}>{loadError}</Notice>
              {!offline ? <Button testID="daily.retry" variant="secondary" label={t('common.retry')} onPress={() => void loadSheet()} /> : null}
            </>
          ) : null}
          {classId && sheet && students.length === 0 && !loadError ? <AppText testID="daily.noStudents">{t('attendance.noStudents')}</AppText> : null}
          {students.length ? (
            <View style={{ gap: space[1] }}>
              <AppText role="helper" color={colors.textSecondary}>{t('daily.student')}</AppText>
              <ChipRow label={t('daily.student')}>
                {students.map((s) => (
                  <Chip key={s.id} testID={`daily.student.${s.externalStudentId ?? s.id}`} label={s.name} selected={s.id === studentId} onPress={() => setStudentId(s.id)} />
                ))}
              </ChipRow>
              {!studentId ? <AppText color={colors.textSecondary}>{t('daily.pickStudent')}</AppText> : null}
            </View>
          ) : null}
        </>
      )}

      {sheet && !workingDay && sheet.day ? (
        <Notice tone="info" testID={`daily.day.${sheet.day.kind}`}>{t(`attendance.day.${sheet.day.kind}`, { label: sheet.day.label ?? '' })}</Notice>
      ) : null}

      {contextReady && showSession ? (
        <View style={{ gap: space[1] }}>
          {otherRecords.some((r) => r.sessionLabel) ? (
            <AppText role="helper" color={colors.textSecondary} testID="daily.sessions.existing">
              {t('daily.sessionsExisting', { labels: otherRecords.flatMap((r) => (r.sessionLabel ? [isolate(r.sessionLabel)] : [])).join(t('common.listSeparator')) })}
            </AppText>
          ) : null}
          <Field
            testID="daily.session"
            label={mode === 'MULTI_SESSION' ? t('daily.sessionLabel') : `${t('daily.sessionLabel')} (${t('common.optional')})`}
            helper={mode === 'MULTI_SESSION' ? t('daily.sessionHelp') : t('daily.sessionOptionalHelp')}
            value={sessionLabel}
            onChangeText={(text) => {
              setSessionLabel(text);
              setContextErrors((e) => ({ ...e, session: undefined, sessionTakenId: undefined }));
            }}
            maxLength={SESSION_LABEL_MAX}
            autoCapitalize="words"
            error={contextErrors.session}
          />
          {contextErrors.sessionTakenId ? (
            <Button testID="daily.session.openExisting" variant="tertiary" label={t('daily.openExisting')} onPress={() => onOpenRecord(contextErrors.sessionTakenId!)} />
          ) : null}
        </View>
      ) : null}

      {/* SINGLE mode: a record already exists for this student and date (F05-AC6). */}
      <ConfirmSheet visible={duplicate !== null && !duplicateDismissed} title={t('daily.duplicate.title')} onCancel={() => { setDuplicateDismissed(true); setStudentId(null); }} testID="daily.duplicate.sheet">
        <AppText testID="daily.duplicate.body">{t('daily.duplicate.body', { name: isolate(studentName), date: isolate(date) })}</AppText>
        <Button testID="daily.duplicate.open" label={t('daily.duplicate.open')} onPress={() => duplicate && onOpenRecord(duplicate.id)} />
        <Button testID="daily.duplicate.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => { setDuplicateDismissed(true); setStudentId(null); }} />
      </ConfirmSheet>

      {rejections && (rejections.record.length || rejections.portions.length) ? (
        <Notice tone="error" testID="daily.rejected">
          {[t('dailyRecord.rejected'), ...rejections.record.map((k) => t(k))].join('\n')}
        </Notice>
      ) : null}

      {/* Step 2 · Attendance (F04 rules, reused) */}
      {contextReady && duplicate === null ? (
        <Card>
          <AppText role="cardTitle">{t('attendance.statusField')}</AppText>
          <AppText role="helper" color={colors.textSecondary} testID="daily.attendance.current">{markTitle}</AppText>
          <ChipRow label={t('attendance.statusFor', { name: isolate(studentName) })}>
            {ATTENDANCE_STATUSES.map((status) => (
              <Chip
                key={status}
                testID={`daily.attendance.${status}`}
                label={t(STATUS_KEY(status))}
                selected={currentMark?.status === status}
                onPress={() => setMark({ status, leaveReason: status === 'LEAVE' ? (currentMark?.leaveReason ?? null) : null, absentNote: null })}
              />
            ))}
          </ChipRow>
          {currentMark?.status === 'LEAVE' ? (
            <Field
              testID="daily.attendance.reason"
              label={t('attendance.leaveReason')}
              helper={t('attendance.internalOnly')}
              value={currentMark.leaveReason ?? ''}
              onChangeText={(text) => setMark({ status: 'LEAVE', leaveReason: text, absentNote: null })}
              error={contextErrors.reason}
            />
          ) : null}
          {suggestsLate(currentMark?.status ?? null, recited) ? (
            <>
              <Notice tone="info">{t('attendance.recitedSuggestLate')}</Notice>
              <Button testID="daily.attendance.markLate" variant="secondary" label={t('attendance.markLateInstead')} onPress={() => setMark({ status: 'LATE', leaveReason: null, absentNote: null })} />
              <Field
                testID="daily.attendance.absentNote"
                label={t('attendance.absentNote')}
                helper={t('attendance.internalOnly')}
                value={currentMark?.absentNote ?? ''}
                onChangeText={(text) => setMark({ status: 'ABSENT', leaveReason: null, absentNote: text })}
                error={contextErrors.absentNote}
              />
            </>
          ) : null}
          {allowed === 'ATTENDANCE_REQUIRED' ? <Notice tone="info" testID="daily.attendance.required">{t('daily.attendanceFirst')}</Notice> : null}
          {allowed === 'CHANGE_TO_LATE' ? (
            <>
              <Notice tone="info" testID="daily.attendance.blocked">
                {t(currentMark?.status === 'LEAVE' ? 'daily.blockedLeave' : 'daily.blockedAbsent', { name: isolate(studentName) })}
              </Notice>
              <Button testID="daily.attendance.changeToLate" variant="secondary" label={t('daily.changeToLate')} onPress={() => setMark({ status: 'LATE', leaveReason: null, absentNote: null })} />
            </>
          ) : null}
        </Card>
      ) : null}

      {/* UI spec 8.9: Absent kept on a record that already has portions — shown read-only, no new portions. */}
      {contextReady && allowed === 'CHANGE_TO_LATE' && editing && portions.length ? (
        <Card>
          <AppText role="helper" color={colors.textSecondary} testID="daily.existingReadOnly">{t('daily.existingReadOnly')}</AppText>
          {portions.map((p) => (
            <AppText key={p.key}>{portionTitle(t, p.section, numbered.get(p.key) ?? 1)}</AppText>
          ))}
        </Card>
      ) : null}

      {/* Step 3 · Sabaq, Sabqi, Manzil: three separate sections, never merged (F05-AC13). */}
      {sectionCards && duplicate === null
        ? SECTION_LIST.map((section) => {
            const slug = sectionSlug(section);
            const list = portions.filter((p) => p.section === section);
            return (
              <View key={section} style={{ gap: space[3] }}>
                <View>
                  <AppText role="sectionTitle" testID={`daily.${slug}.section`}>{t(`sections.${section}`)}</AppText>
                  <AppText role="helper" color={colors.textSecondary}>{t(`sections.hint.${section}`)}</AppText>
                  <AppText role="helper" color={colors.textSecondary}>{t('daily.sectionCount', { count: isolate(String(list.length)) })}</AppText>
                </View>
                {list.length === 0 ? <AppText color={colors.textSecondary} testID={`daily.${slug}.empty`}>{t('daily.sectionEmpty', { section: t(`sections.${section}`) })}</AppText> : null}
                {list.map((p) => (
                  <PortionCard
                    key={p.key}
                    form={p}
                    number={numbered.get(p.key) ?? 1}
                    onChange={updatePortion}
                    onRemove={() => (p.attemptCount > 0 ? setConfirmRemove(p) : removePortion(p))}
                    index={index}
                    errors={errorsFor(p)}
                    sabqiDefault={sabqiDefault}
                  />
                ))}
                <Button testID={`daily.${slug}.add`} variant="secondary" label={t('daily.addPortion')} onPress={() => addPortion(section, false)} />
                <Button testID={`daily.${slug}.addExtra`} variant="tertiary" label={t('daily.addExtra')} onPress={() => addPortion(section, true)} />
              </View>
            );
          })
        : null}

      {/* F07 · Overall performance (design.md §4.7): once per record, below the sections, optional. Captioned so it is
          never read as the 1–5 quality, and never filled in from it (F07-AC12, AC13). */}
      {sectionCards && duplicate === null ? (
        <Card>
          <AppText role="cardTitle" testID="daily.overall.title">{t('overall.title')}</AppText>
          <AppText role="helper" color={colors.textSecondary}>{t('overall.help')}</AppText>
          <ChipRow label={t('overall.title')}>
            <Chip testID="daily.overall.NONE" label={t('overall.none')} selected={overallLabel === null} onPress={() => setOverallLabel(null)} />
            {OVERALL_LABELS.map((l) => (
              <Chip key={l} testID={`daily.overall.${l}`} label={t(`overall.${l}`)} selected={overallLabel === l} onPress={() => setOverallLabel(l)} />
            ))}
          </ChipRow>
        </Card>
      ) : null}

      <ConfirmSheet visible={confirmRemove !== null} title={confirmRemove ? t('daily.removeTitle', { portion: portionTitle(t, confirmRemove.section, numbered.get(confirmRemove.key) ?? 1) }) : ''} onCancel={() => setConfirmRemove(null)} testID="daily.removePortion.sheet">
        <AppText>{t('daily.removeBody', { count: isolate(String(confirmRemove?.attemptCount ?? 0)) })}</AppText>
        <Button testID="daily.removePortion.confirm" variant="destructive" label={t('daily.removeConfirm')} onPress={() => confirmRemove && removePortion(confirmRemove)} />
        <Button testID="daily.removePortion.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setConfirmRemove(null)} />
      </ConfirmSheet>

      {/* Save area */}
      {issues.length ? (
        <View style={{ gap: space[1] }}>
          <Notice tone="error" testID="daily.errorSummary">{t('daily.errorsSummary', { count: isolate(String(issues.length)) })}</Notice>
          {issues.map((i, n) => (
            <AppText key={`${i.portionKey}-${issueSlot(i)}`} role="helper" color={colors.danger} testID={`daily.errorSummary.${n}`}>
              {`⚠ ${t('daily.portionError', { portion: portionTitle(t, i.section, i.portionNumber), message: t(`daily.fieldError.${i.messageKey}`, Object.fromEntries(Object.entries(i.params ?? {}).map(([k, v]) => [k, isolate(String(v))]))) })}`}
            </AppText>
          ))}
        </View>
      ) : null}
      {saveError ? <Notice tone="error" testID="daily.saveError">{saveError}</Notice> : null}
      {attendanceSaved ? <SavedOnDeviceNotice /> : null}
      {contextReady && needsPortion ? <AppText role="helper" color={colors.textSecondary} testID="daily.needsPortion">{t('daily.needsPortion')}</AppText> : null}
      {contextReady && duplicate === null ? (
        <Button
          testID="daily.save"
          label={allowed === 'CHANGE_TO_LATE' && !editing ? t('daily.attendanceOnlySave') : t('daily.save')}
          busy={busy}
          busyLabel={t('common.saving')}
          disabled={saveDisabled}
          onPress={() => void save()}
        />
      ) : null}
    </AppScreen>
  );
}
