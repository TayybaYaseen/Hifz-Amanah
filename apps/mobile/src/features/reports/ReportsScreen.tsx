// F09 · Reports: weekly and monthly student reports and the class summary (design.md §4.10, §5.8, §8; US-039…043,
// US-073; F09-AC1…AC19). Teacher/Admin/Owner only.
// - Online, the report is the server's (authoritative, derived from source on every view, so a correction shows on the
//   next view, F09-AC3). Reopening the screen reloads it.
// - Offline, it is built on this device with the same domain function and labelled "Provisional" with the last
//   successful sync time and the pending-change count (F09-AC16, NFR-OFF-008). Online with changes not yet synced, the
//   server's report shows a notice that it does not include them yet.
// - Attendance and performance are separate sections; Late, Half day, Leave, and normal absence are listed apart, and
//   holidays and no-class days are never absences (F09-AC11…AC13, AC17). Missing values read "Not recorded".
// - Every figure is text (no chart without its text equivalent, design.md §4.10). Private staff text (remarks, internal
//   mistake notes) is labelled "Private to staff"; Students and Parents never reach this screen (F09-AC15).
// Every rule is @hifz/domain/reports; this screen only renders its results.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { AttendanceSheetResponse, ClassListResponse, ClassResponse, ClassSummaryRowView, ReportPortionLineView, ReportSectionView, StudentReportView } from '@hifz/contracts';
import { reportPeriod, shiftPeriod, type PeriodKind, type ReportPeriod } from '@hifz/domain/reports';
import { calendarDateIn } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { StatusChip } from '../../components/StatusChip.tsx';
import { SyncBanner, useFormatDateTime } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Notice, isolate } from '../../components/ui.tsx';
import { cacheWriteFailed, readCacheToken } from '../../sync/cacheEpoch.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, radius, space } from '../../theme/tokens.ts';
import { cacheRoster, cachedClasses, cachedRoster, forgetRoster, keepRostersOf } from '../attendance/local.ts';
import { useAmount } from '../daily-entry/PortionCard.tsx';
import { refreshCalendar } from '../homework/api.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import { fetchClassSummary, fetchStudentReport } from './api.ts';
import { deviceClassSummary, deviceReport, hasCalendar } from './local.ts';
import { attendanceRows, averageText, provisionalNotice, reportSource, totalsLines, type ReportSource } from './view.ts';

type Mode = 'STUDENT' | 'CLASS';

interface Shown<T> {
  data: T;
  source: ReportSource;
}

interface Summary {
  rows: ClassSummaryRowView[];
  period: ReportPeriod | StudentReportView['period'];
}

export function ReportsScreen({ onSyncQueue }: { onSyncQueue: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const formatTime = useFormatDateTime();
  const amount = useAmount();
  const timeZone = sync.meta?.orgTimeZone ?? 'Asia/Karachi';

  const [classes, setClasses] = useState<Array<{ id: string; name: string }> | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; name: string; externalStudentId: string | null }> | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('STUDENT');
  const [kind, setKind] = useState<PeriodKind>('WEEK');
  const [today, setToday] = useState(() => calendarDateIn(new Date(), timeZone));
  const [anchor, setAnchor] = useState(today);
  const [report, setReport] = useState<Shown<StudentReportView> | null>(null);
  const [summary, setSummary] = useState<Shown<Summary> | null>(null);
  const [noCalendar, setNoCalendar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const period = reportPeriod(kind, anchor, { timeZone });
  const syncState = { offline: true, pendingChanges: sync.unsynced, lastSyncedAt: sync.meta?.lastSuccessAt ?? null };

  // Reopening the screen (after correcting a record) shows the report rebuilt from source (F09-AC3).
  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));

  // Classes: the server's list (a Teacher gets assigned classes only); the cached ones offline.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = (await session.authorized<ClassListResponse>('/classes')).items.filter((c: ClassResponse) => c.status === 'ACTIVE');
        if (sync.db) await keepRostersOf(sync.db, res.map((c) => c.id));
        if (live) setClasses(res.map((c) => ({ id: c.id, name: c.name })));
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'NETWORK' && sync.db) {
          if (live) setClasses(await cachedClasses(sync.db));
        } else if (live) setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
      }
    })();
    return () => {
      live = false;
    };
  }, [session, sync.db, t]);

  // The class roster (online: the attendance sheet, which also caches it; offline: the cached roster) and timetable.
  useEffect(() => {
    if (!classId || !sync.db) return;
    const db = sync.db;
    let live = true;
    void (async () => {
      try {
        const token = await readCacheToken(db, classId);
        const res = await session.authorized<AttendanceSheetResponse>(`/attendance/sheet?classId=${classId}&date=${calendarDateIn(new Date(), timeZone)}`);
        await cacheRoster(db, token, classId, res.className, res.students, new Date().toISOString()).catch(cacheWriteFailed);
        if (!live) return;
        setToday(res.today);
        setStudents(res.students.map(({ id, name, externalStudentId }) => ({ id, name, externalStudentId })));
        // The timetable lets the device classify days when the next report has to be built offline.
        await refreshCalendar(session, db, classId, res.today).catch(() => undefined);
      } catch (err) {
        if (err instanceof ApiFailure && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) {
          await forgetRoster(db, classId);
          if (live) {
            setStudents([]);
            setDenied(t(`errors.${err.code}`));
          }
          return;
        }
        if (!(err instanceof ApiFailure && err.code === 'NETWORK')) {
          if (live) setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
          return;
        }
        const cached = await cachedRoster(db, classId);
        if (live) setStudents(cached?.students ?? []);
      }
    })();
    return () => {
      live = false;
    };
  }, [classId, session, sync.db, timeZone, t]);

  // The report or summary for the chosen period.
  useEffect(() => {
    if (!classId || !sync.db) return;
    if (mode === 'STUDENT' && !studentId) return;
    const db = sync.db;
    let live = true;
    setLoading(true);
    setError(null);
    void (async () => {
      let networkFailed = false;
      try {
        if (reportSource(sync.online, false) === 'SERVER') {
          if (mode === 'STUDENT') {
            const res = await fetchStudentReport(session, studentId!, kind, anchor);
            if (live) setReport({ data: res.report, source: 'SERVER' });
          } else {
            const res = await fetchClassSummary(session, classId, kind, anchor);
            if (live) setSummary({ data: { rows: res.rows, period: res.period }, source: 'SERVER' });
          }
          return;
        }
        networkFailed = true;
      } catch (err) {
        if (!(err instanceof ApiFailure && err.code === 'NETWORK')) {
          if (live) setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
          return;
        }
        networkFailed = true;
      } finally {
        if (live && !networkFailed) setLoading(false);
      }
      // No connection: the device's provisional report (NFR-OFF-008).
      try {
        if (reportSource(sync.online, networkFailed) !== 'DEVICE') return;
        const calendarKnown = await hasCalendar(db, classId);
        const roster = students ?? [];
        if (mode === 'STUDENT') {
          const student = roster.find((s) => s.id === studentId) ?? { id: studentId!, name: '' };
          const data = await deviceReport(db, { student: { id: student.id, name: student.name }, classId, period, today, sync: syncState });
          if (live) setReport({ data, source: 'DEVICE' });
        } else {
          const data = await deviceClassSummary(db, { students: roster.map((s) => ({ id: s.id, name: s.name })), classId, period, today, sync: syncState });
          if (live) setSummary({ data: { rows: data.rows, period: data.period }, source: 'DEVICE' });
        }
        if (live) setNoCalendar(!calendarKnown);
      } catch {
        if (live) setError(t('reports.loadFailed'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
    // syncState and period are derived from the listed inputs.
  }, [mode, classId, studentId, kind, anchor, reloadKey, sync.online, sync.db, sync.unsynced, students, today, session, t]);

  // ---------- Pieces ----------

  const rangeText = (p: { from: string; to: string; timeZone: string }) => t('reports.range', { from: isolate(p.from), to: isolate(p.to), timeZone: isolate(p.timeZone) });

  const provisionalBanner = (source: ReportSource) => {
    const notice = provisionalNotice({ source, pendingChanges: sync.unsynced });
    if (notice === 'PROVISIONAL') {
      const last = sync.meta?.lastSuccessAt ?? null;
      return (
        <Notice tone="info" testID="reports.provisional">
          {`${t('reports.provisional')}\n${last ? t('reports.lastSync', { time: formatTime(last) }) : t('reports.neverSynced')}\n${t('reports.pending', { count: sync.unsynced })}`}
        </Notice>
      );
    }
    if (notice === 'PENDING_CHANGES') return <Notice tone="info" testID="reports.pendingChanges">{t('reports.pendingChanges', { count: sync.unsynced })}</Notice>;
    return null;
  };

  const sectionCard = (s: ReportSectionView) => {
    const prefix = `reports.section.${s.section}`;
    return (
      <Card key={s.section}>
        <View testID={prefix} style={styles.block}>
          <AppText role="cardTitle" accessibilityRole="header">{t(`sections.${s.section}`)}</AppText>
          {s.portionCount === 0 ? (
            <AppText color={colors.textSecondary} testID={`${prefix}.empty`}>{t('reports.sectionEmpty')}</AppText>
          ) : (
            <>
              <AppText testID={`${prefix}.assigned`}>{t('reports.assigned', { value: totalsLines(s.totals.assigned, amount, t).join(' · ') })}</AppText>
              <AppText testID={`${prefix}.completed`}>{t('reports.completed', { value: totalsLines(s.totals.completed, amount, t).join(' · ') })}</AppText>
              <AppText testID={`${prefix}.remaining`}>{t('reports.remaining', { value: totalsLines(s.totals.remaining, amount, t).join(' · ') })}</AppText>
              {s.totals.notRecorded ? <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.notRecorded`}>{t('reports.portionsNotRecorded', { count: s.totals.notRecorded })}</AppText> : null}
              {s.extraTotals.completed.length ? <AppText role="helper" testID={`${prefix}.extra`}>{t('reports.extra', { value: totalsLines(s.extraTotals.completed, amount, t).join(' · ') })}</AppText> : null}
              <AppText role="helper" testID={`${prefix}.statuses`}>
                {(['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'PENDING', 'ABSENT', 'NOT_ASSIGNED'] as const)
                  .filter((k) => s.statusCounts[k] > 0)
                  .map((k) => `${t(`portionStatus.${k}`)}: ${isolate(String(s.statusCounts[k]))}`)
                  .join(' · ') || t('reports.none')}
              </AppText>
              <AppText testID={`${prefix}.quality`}>{t('reports.qualityLine', { value: averageText(s.quality, t, isolate) })}</AppText>
              <AppText role="cardTitle">{t('reports.paraWise')}</AppText>
              {s.paras.map((p) => (
                <AppText key={String(p.paraNumber)} testID={`${prefix}.para.${p.paraNumber ?? 'none'}`}>
                  {t('reports.paraLine', {
                    para: isolate(p.paraNumber === null ? '—' : String(p.paraNumber)),
                    completed: totalsLines(p.totals.completed, amount, t).join(' · '),
                    assigned: totalsLines(p.totals.assigned, amount, t).join(' · '),
                  })}
                </AppText>
              ))}
              {s.pending.length ? <AppText role="cardTitle">{t('reports.pendingPortions')}</AppText> : null}
              {s.pending.map((p, i) => (
                <AppText key={p.portionId} role="helper" testID={`${prefix}.pending.${i + 1}`}>
                  {t('reports.pendingLine', {
                    date: isolate(p.date),
                    para: isolate(p.paraNumber === null ? '—' : String(p.paraNumber)),
                    status: p.status ? t(`portionStatus.${p.status}`) : t('quality.notRecorded'),
                    remaining: p.remaining ? amount(p.remaining) : t('quality.notRecorded'),
                  })}
                  {p.carriedInto ? ` · ${t(p.carriedInto.status === 'CONFIRMED' ? 'reports.carriedIntoConfirmed' : 'reports.carriedIntoDraft')}` : ''}
                </AppText>
              ))}
            </>
          )}
        </View>
      </Card>
    );
  };

  const portionLine = (p: ReportPortionLineView, testID: string) => (
    <View key={p.portionId} testID={testID} style={styles.line}>
      <AppText testID={`${testID}.what`}>
        {p.section === 'SABAQ' && p.range
          ? t('reports.sabaqLine', { surah: isolate(String(p.range.surahStart)), range: isolate(`${p.range.ayahStart}–${p.range.ayahEnd}`), para: isolate(String(p.paraNumber ?? '—')) })
          : t('reports.paraOnly', { section: t(`sections.${p.section}`), para: isolate(String(p.paraNumber ?? '—')) })}
        {p.isExtra ? ` · ${t('reports.extraLabel')}` : ''}
      </AppText>
      <View style={styles.row}>
        {p.status ? <StatusChip status={p.status} testID={`${testID}.status.${p.status}`} /> : <AppText color={colors.textSecondary} testID={`${testID}.status.none`}>{t('quality.notRecorded')}</AppText>}
      </View>
      <AppText testID={`${testID}.amount`}>{t('reports.amountLine', { completed: p.completed ? amount(p.completed) : t('quality.notRecorded'), assigned: amount(p.assigned) })}</AppText>
      <AppText role="helper" testID={`${testID}.quality`}>
        {p.quality === null ? t('reports.qualityLine', { value: t('quality.notRecorded') }) : t('reports.qualityLine', { value: t('quality.option', { score: isolate(String(p.quality)), label: t(`quality.name.${p.quality}`) }) })}
        {' · '}
        {p.mistakeCount === null ? t('mistakes.notRecorded') : t('mistakes.count', { count: isolate(String(p.mistakeCount)) })}
        {p.attempts.length > 1 ? ` · ${t('reports.attempts', { count: p.attempts.length })}` : ''}
      </AppText>
      {p.mistakes.map((m, i) =>
        m.note ? (
          <AppText key={i} role="helper" testID={`${testID}.note.${i + 1}`} color={colors.textSecondary}>
            {`${t(`mistakes.categories.${m.category}`)}: ${m.note} (${t(m.noteVisibility === 'SHARED' ? 'reports.sharedNote' : 'reports.privateToStaff')})`}
          </AppText>
        ) : null,
      )}
      {p.remarks ? <AppText role="helper" testID={`${testID}.remarks`} color={colors.textSecondary}>{`${p.remarks} (${t('reports.privateToStaff')})`}</AppText> : null}
    </View>
  );

  const studentBody = (r: StudentReportView, source: ReportSource) => {
    const c = r.attendance.counts;
    const otherDays = r.attendance.days.filter((d) => ['HOLIDAY', 'CLOSURE', 'NO_CLASS', 'UNSCHEDULED', 'ABSENT', 'LEAVE', 'LEAVE_REJECTED', 'LEAVE_AWAITING', 'LATE', 'HALF_DAY'].includes(d.category));
    return (
      <>
        {provisionalBanner(source)}
        <AppText role="sectionTitle" testID="reports.range">{rangeText(r.period)}</AppText>
        {!r.hasData ? (
          <Card>
            <AppText testID="reports.noRecords">{t('reports.noRecords')}</AppText>
            <AppText role="helper" color={colors.textSecondary}>{t('reports.noRecordsHelp')}</AppText>
          </Card>
        ) : (
          <>
            {/* Attendance, apart from performance (FR-CAL-005). */}
            <Card>
              <View testID="reports.attendance" style={styles.block}>
                <AppText role="cardTitle" accessibilityRole="header">{t('reports.attendanceTitle')}</AppText>
                {noCalendar && source === 'DEVICE' ? (
                  <AppText color={colors.textSecondary} testID="reports.noCalendar">{t('reports.noCalendar')}</AppText>
                ) : (
                  <>
                    {attendanceRows(c).map((row) => (
                      <AppText key={row.key} testID={`reports.attendance.${row.key}`}>{t(`reports.att.${row.key}`, { count: isolate(String(row.count)) })}</AppText>
                    ))}
                    {otherDays.map((d) => (
                      <AppText key={d.date} role="helper" color={colors.textSecondary} testID={`reports.day.${d.date}`}>
                        {`${isolate(d.date)} · ${t(`reports.dayCategory.${d.category}`)}${d.exceptionLabel ? ` — ${isolate(d.exceptionLabel)}` : ''}`}
                      </AppText>
                    ))}
                  </>
                )}
              </View>
            </Card>

            {/* Performance: Sabaq, Sabqi, Manzil each on their own (FR-MNR-003). */}
            <Card>
              <View testID="reports.performance" style={styles.block}>
                <AppText role="cardTitle" accessibilityRole="header">{t('reports.performanceTitle')}</AppText>
                <AppText testID="reports.quality">{t('reports.averageQuality', { value: averageText(r.quality, t, isolate) })}</AppText>
                <AppText role="helper" color={colors.textSecondary}>{t('quality.lowerIsBetter')}</AppText>
                <AppText testID="reports.mistakes">
                  {r.mistakes.recordedAttempts === 0 ? t('mistakes.notRecorded') : t('mistakes.count', { count: isolate(String(r.mistakes.total)) })}
                </AppText>
                {r.mistakes.total > 0 ? (
                  <AppText role="helper" testID="reports.mistakes.byCategory">
                    {Object.entries(r.mistakes.byCategory)
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => `${t(`mistakes.categories.${k}`)}: ${isolate(String(n))}`)
                      .join(' · ')}
                  </AppText>
                ) : null}
                {r.mistakes.notRecordedAttempts > 0 ? <AppText role="helper" color={colors.textSecondary} testID="reports.mistakes.notRecorded">{t('reports.mistakesNotRecorded', { count: r.mistakes.notRecordedAttempts })}</AppText> : null}
              </View>
            </Card>
            {r.sections.map(sectionCard)}

            {/* Recurring difficulty (FR-MNR-006, DEC-B34): dates and counts with it. */}
            {r.recurringDifficulties.length ? (
              <Card>
                <View testID="reports.difficulties" style={styles.block}>
                  <AppText role="cardTitle" accessibilityRole="header">{t('reports.difficultiesTitle')}</AppText>
                  {r.recurringDifficulties.map((d) => (
                    <AppText key={`${d.paraNumber ?? 'r'}-${d.dates[0] ?? ''}`} testID={`reports.difficulty.${d.paraNumber ?? 'range'}`}>
                      {t('reports.difficultyLine', {
                        para: isolate(d.paraNumber === null ? '—' : String(d.paraNumber)),
                        marked: isolate(String(d.majorOrRepeatedAttempts)),
                        notRemembered: isolate(String(d.notRememberedAttempts)),
                        dates: d.dates.map((x) => isolate(x)).join(', '),
                      })}
                      {Object.entries(d.byCategory).some(([, n]) => n > 0)
                        ? `\n${Object.entries(d.byCategory)
                            .filter(([, n]) => n > 0)
                            .map(([k, n]) => `${t(`mistakes.categories.${k}`)}: ${isolate(String(n))}`)
                            .join(' · ')}`
                        : ''}
                    </AppText>
                  ))}
                </View>
              </Card>
            ) : null}

            {/* Homework: confirmed and suggestions are separate counts (FR-RPT-007, FR-MNR-005). */}
            <Card>
              <View testID="reports.homework" style={styles.block}>
                <AppText role="cardTitle" accessibilityRole="header">{t('reports.homeworkTitle')}</AppText>
                {(['confirmed', 'drafts', 'assigned', 'attempted', 'completed', 'carriedForward', 'carriedOver', 'outstanding'] as const).map((k) => (
                  <AppText key={k} testID={`reports.homework.${k}`}>{t(`reports.hw.${k}`, { count: isolate(String(r.homework[k])) })}</AppText>
                ))}
              </View>
            </Card>

            {/* Daily record history: only days with recorded work (absent days never appear as failed, F09-AC11). */}
            <AppText role="sectionTitle" accessibilityRole="header">{t('reports.historyTitle')}</AppText>
            {r.days.length === 0 ? <AppText color={colors.textSecondary} testID="reports.history.empty">{t('reports.historyEmpty')}</AppText> : null}
            {r.days.map((d) => (
              <Card key={d.recordId}>
                <View testID={`reports.dayRecord.${d.date}${d.sessionLabel ? `.${d.sessionLabel}` : ''}`} style={styles.block}>
                  <AppText role="cardTitle">{d.sessionLabel ? t('reports.dayWithSession', { date: isolate(d.date), session: isolate(d.sessionLabel) }) : isolate(d.date)}</AppText>
                  <AppText role="helper">{d.overallLabel ? t('overall.value', { label: t(`overall.${d.overallLabel}`) }) : t('overall.value', { label: t('overall.none') })}</AppText>
                  {d.portions.map((p, i) => portionLine(p, `reports.dayRecord.${d.date}.portion.${i + 1}`))}
                </View>
              </Card>
            ))}
            {r.excludedRecords.length ? <AppText role="helper" color={colors.textSecondary} testID="reports.excluded">{t('reports.excluded', { count: r.excludedRecords.length })}</AppText> : null}
          </>
        )}
      </>
    );
  };

  const summaryBody = (s: Summary, source: ReportSource) => (
    <>
      {provisionalBanner(source)}
      <AppText role="sectionTitle" testID="reports.range">{rangeText(s.period)}</AppText>
      <AppText role="helper" color={colors.textSecondary}>{t('reports.summaryStaffOnly')}</AppText>
      {s.rows.length === 0 ? <AppText testID="reports.summary.empty">{t('reports.summaryEmpty')}</AppText> : null}
      {s.rows.map((row, i) => (
        <Card key={row.studentId}>
          <View testID={`reports.summary.row.${i + 1}`} style={styles.block}>
            <AppText role="cardTitle" testID={`reports.summary.row.${i + 1}.name`}>{isolate(row.studentName)}</AppText>
            <AppText testID={`reports.summary.row.${i + 1}.attendance`}>
              {t('reports.summaryAttendance', {
                present: isolate(String(row.attendance.present)),
                late: isolate(String(row.attendance.late)),
                halfDay: isolate(String(row.attendance.halfDay)),
                leave: isolate(String(row.attendance.leave)),
                absent: isolate(String(row.attendance.absent)),
              })}
            </AppText>
            {(['SABAQ', 'SABQI', 'MANZIL'] as const).map((sec) => (
              <AppText key={sec} role="helper" testID={`reports.summary.row.${i + 1}.${sec}`}>
                {`${t(`sections.${sec}`)}: ${totalsLines(row.completed[sec], amount, t).join(' · ')}`}
              </AppText>
            ))}
            <AppText testID={`reports.summary.row.${i + 1}.quality`}>{t('reports.averageQuality', { value: averageText(row.quality, t, isolate) })}</AppText>
            <AppText testID={`reports.summary.row.${i + 1}.homework`}>{t('reports.hw.outstanding', { count: isolate(String(row.outstandingHomework)) })}</AppText>
          </View>
        </Card>
      ))}
    </>
  );

  // ---------- Render ----------

  if (denied) {
    return (
      <AppScreen title={t('reports.title')} testID="reports.screen">
        <Notice tone="error" testID="reports.denied">{denied}</Notice>
      </AppScreen>
    );
  }

  const shown = mode === 'STUDENT' ? report : summary;
  return (
    <AppScreen title={t('reports.title')} testID="reports.screen">
      {sync.enabled || sync.loadError ? <SyncBanner banner={sync.banner} onPress={onSyncQueue} loadError={sync.loadError} /> : null}
      {error ? <Notice tone="error" testID="reports.error">{error}</Notice> : null}

      <ChipRow label={t('reports.modeLabel')}>
        <Chip testID="reports.mode.student" label={t('reports.modeStudent')} selected={mode === 'STUDENT'} onPress={() => setMode('STUDENT')} />
        <Chip testID="reports.mode.class" label={t('reports.modeClass')} selected={mode === 'CLASS'} onPress={() => setMode('CLASS')} />
      </ChipRow>
      <ChipRow label={t('reports.kindLabel')}>
        <Chip testID="reports.kind.week" label={t('reports.weekly')} selected={kind === 'WEEK'} onPress={() => setKind('WEEK')} />
        <Chip testID="reports.kind.month" label={t('reports.monthly')} selected={kind === 'MONTH'} onPress={() => setKind('MONTH')} />
      </ChipRow>
      <View style={styles.row}>
        <Button testID="reports.prev" variant="tertiary" label={t('reports.previous')} onPress={() => setAnchor(shiftPeriod(period, -1).from)} />
        <Button testID="reports.next" variant="tertiary" label={t('reports.next')} onPress={() => setAnchor(shiftPeriod(period, 1).from)} disabled={period.to >= today} />
      </View>

      {classes === null && !error ? <AppText color={colors.textSecondary} testID="reports.loading">{t('common.loading')}</AppText> : null}
      {classes?.length === 0 ? <AppText testID="reports.noClasses">{t('daily.noClasses')}</AppText> : null}
      {classes?.length ? (
        <ChipRow label={t('attendance.class')}>
          {classes.map((c) => (
            <Chip
              key={c.id}
              testID={`reports.class.${c.name}`}
              label={c.name}
              selected={c.id === classId}
              onPress={() => {
                setClassId(c.id);
                setStudentId(null);
                setReport(null);
                setSummary(null);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      {mode === 'STUDENT' && students?.length ? (
        <ChipRow label={t('daily.student')}>
          {students.map((s) => (
            <Chip key={s.id} testID={`reports.student.${s.externalStudentId ?? s.id}`} label={s.name} selected={s.id === studentId} onPress={() => setStudentId(s.id)} />
          ))}
        </ChipRow>
      ) : null}
      {mode === 'STUDENT' && classId && !studentId && students?.length ? <AppText color={colors.textSecondary}>{t('daily.pickStudent')}</AppText> : null}

      {loading ? <AppText color={colors.textSecondary} testID="reports.loading">{t('common.loading')}</AppText> : null}
      {!loading && shown && mode === 'STUDENT' && report ? studentBody(report.data, report.source) : null}
      {!loading && shown && mode === 'CLASS' && summary ? summaryBody(summary.data, summary.source) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  line: { gap: space[1], paddingVertical: space[2], borderTopWidth: 1, borderColor: colors.border, borderRadius: radius.input },
});
