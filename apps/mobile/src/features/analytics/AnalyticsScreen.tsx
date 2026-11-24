// F15 · Analytics (US-062, US-063; F15-AC1…AC6, AC9, AC11, AC12, AC17; docs/handover/F15-ui-spec.md Screen 1).
// Teacher (assigned classes), Admin and Owner only: Students and Parents have no entry, no route, and the API refuses
// them too (F15-AC9).
// - Calculated metrics first, all from @hifz/domain/analytics: online and fully synced, the server's figures
//   (authoritative); offline, or while changes on this device wait to sync, the device's figures built with the same
//   domain function and labelled Provisional with the last sync time and the pending-change count (F15-AC2).
// - Quality: 1 · Excellent at the top, 5 · Weak at the bottom, gaps for days without ratings, and the trend in words
//   from the domain's direction (a falling average is improvement, F15-AC3).
// - The AI area comes after, visually separate, and never replaces or hides a metric whatever its state (F15-AC4…6).
//   It is never called offline and never shows cached output; changing the student or period clears it.
// This screen only renders; every rule is in packages/domain and the server.
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { AiState, AttendanceSheetResponse, ClassListResponse, ClassResponse, MeResponse, StudentAnalyticsView } from '@hifz/contracts';
import { reportPeriod, shiftPeriod, type PeriodKind } from '@hifz/domain/reports';
import { calendarDateIn } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { SyncBanner, useFormatDateTime } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Notice, isolate } from '../../components/ui.tsx';
import { useLocale } from '../../i18n/LocaleContext.tsx';
import { cacheWriteFailed, readCacheToken } from '../../sync/cacheEpoch.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { cacheRoster, cachedClasses, cachedRoster, forgetRoster, keepRostersOf } from '../attendance/local.ts';
import { useAmount } from '../daily-entry/PortionCard.tsx';
import { refreshCalendar } from '../homework/api.ts';
import { hasCalendar } from '../reports/local.ts';
import { attendanceRows } from '../reports/view.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import { AiPanel } from './AiPanel.tsx';
import { fetchAnalytics, requestAiRecommendation } from './api.ts';
import { deviceAnalytics } from './local.ts';
import { TrendChart } from './TrendChart.tsx';
import {
  AI_SLOW_MS,
  aiFailureOf,
  aiView,
  analyticsSource,
  canSeeAnalytics,
  chartSummary,
  isRevoked,
  oneDecimal,
  progressPairs,
  provisionalBanner,
  trendMessage,
  type AiRequest,
  type AnalyticsSource,
} from './view.ts';

export interface AnalyticsParams {
  classId?: string;
  studentId?: string;
  kind?: PeriodKind;
  anchor?: string;
}

const MISTAKE_CODES = ['HARKAAT', 'TAJWEED', 'LAFZI', 'AYAT_BHOOLNA', 'TARTEEB', 'WAQF_IBTIDA'] as const;
const TREND_ICON: Record<string, string> = { IMPROVING: '↓', DECLINING: '↑', STEADY: '→', NOT_ENOUGH_DATA: 'ℹ' };

export function AnalyticsScreen({ me, params, onSyncQueue, onOpenAiSettings }: { me: MeResponse; params: AnalyticsParams; onSyncQueue: () => void; onOpenAiSettings: () => void }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { session } = useSession();
  const sync = useSync();
  const formatTime = useFormatDateTime();
  const amount = useAmount();
  const timeZone = sync.meta?.orgTimeZone ?? 'Asia/Karachi';

  const [classes, setClasses] = useState<Array<{ id: string; name: string }> | null>(null);
  const [classId, setClassId] = useState<string | null>(params.classId ?? null);
  const [students, setStudents] = useState<Array<{ id: string; name: string; externalStudentId: string | null }> | null>(null);
  const [studentId, setStudentId] = useState<string | null>(params.studentId ?? null);
  const [kind, setKind] = useState<PeriodKind>(params.kind ?? 'WEEK');
  const [today, setToday] = useState(() => calendarDateIn(new Date(), timeZone));
  const [anchor, setAnchor] = useState(params.anchor ?? today);
  const [shown, setShown] = useState<{ data: StudentAnalyticsView; source: AnalyticsSource } | null>(null);
  const [noCalendar, setNoCalendar] = useState(false);
  const [serverAi, setServerAi] = useState<AiState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [aiRequest, setAiRequest] = useState<AiRequest>({ kind: 'NONE' });
  const aiToken = useRef(0);

  const period = reportPeriod(kind, anchor, { timeZone });

  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));

  const clearForRevoked = useCallback((id: string | null) => {
    setRevoked(true);
    setShown(null);
    setStudents(null);
    setStudentId(null);
    setClassId(null);
    if (id) setClasses((list) => list?.filter((c) => c.id !== id) ?? null);
  }, []);

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
        await refreshCalendar(session, db, classId, res.today).catch(() => undefined);
      } catch (err) {
        if (isRevoked(err)) {
          await forgetRoster(db, classId);
          if (live) clearForRevoked(classId);
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
  }, [classId, session, sync.db, timeZone, t, clearForRevoked]);

  // A new student or period never shows the previous AI answer (no cached AI output).
  useEffect(() => {
    aiToken.current += 1;
    setAiRequest({ kind: 'NONE' });
  }, [classId, studentId, kind, anchor]);

  // The metrics for the chosen student and period.
  useEffect(() => {
    if (!classId || !studentId || !sync.db) return;
    const db = sync.db;
    let live = true;
    setLoading(true);
    setError(null);
    void (async () => {
      let networkFailed = !sync.online;
      let server: StudentAnalyticsView | null = null;
      if (sync.online) {
        try {
          const res = await fetchAnalytics(session, studentId, kind, anchor);
          server = res.analytics;
          if (live) setServerAi(res.ai.state);
        } catch (err) {
          if (isRevoked(err)) {
            if (live) {
              clearForRevoked(classId);
              setLoading(false);
            }
            return;
          }
          if (!(err instanceof ApiFailure && err.code === 'NETWORK')) {
            if (live) {
              setError(t('analytics.error'));
              setLoading(false);
            }
            return;
          }
          networkFailed = true;
        }
      }
      try {
        const source = analyticsSource({ online: sync.online, networkFailed, pendingChanges: sync.unsynced });
        if (source === 'SERVER' && server) {
          if (live) setShown({ data: server, source });
          return;
        }
        // Offline, or changes on this device not yet on the server: the device's provisional figures (NFR-OFF-008).
        const roster = students ?? [];
        const student = roster.find((s) => s.id === studentId) ?? { id: studentId, name: '' };
        const calendarKnown = await hasCalendar(db, classId);
        const data = await deviceAnalytics(db, {
          student: { id: student.id, name: student.name },
          classId,
          period,
          today,
          sync: { offline: networkFailed, pendingChanges: sync.unsynced, lastSyncedAt: sync.meta?.lastSuccessAt ?? null },
        });
        if (live) {
          setShown({ data, source: 'DEVICE' });
          setNoCalendar(!calendarKnown);
        }
      } catch {
        if (live) setError(t('analytics.error'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
    // period is derived from kind, anchor and timeZone.
  }, [classId, studentId, kind, anchor, reloadKey, sync.online, sync.db, sync.unsynced, students, today, session, t, clearForRevoked]);

  const getAi = async () => {
    if (!sync.online || !studentId) return;
    const token = ++aiToken.current;
    setAiRequest({ kind: 'LOADING', slow: false });
    const slow = setTimeout(() => {
      if (aiToken.current === token) setAiRequest({ kind: 'LOADING', slow: true });
    }, AI_SLOW_MS);
    try {
      const response = await requestAiRecommendation(session, studentId, kind, anchor, locale);
      if (aiToken.current === token) setAiRequest({ kind: 'READY', response });
    } catch (err) {
      if (aiToken.current === token) setAiRequest({ kind: 'FAILED', failure: aiFailureOf(err) });
    } finally {
      clearTimeout(slow);
    }
  };

  if (!canSeeAnalytics(me.role)) {
    return (
      <AppScreen title={t('analytics.title')} testID="analytics.screen">
        <Notice tone="error" testID="analytics.revoked">{t('errors.FORBIDDEN')}</Notice>
      </AppScreen>
    );
  }

  // ---------- Pieces ----------

  const provisional = (data: StudentAnalyticsView) => {
    const banner = provisionalBanner(data.provisional);
    if (!banner) return null;
    const time = banner.lastSyncedAt ? formatTime(banner.lastSyncedAt) : t('analytics.neverSynced');
    return (
      <View testID="analytics.provisional" accessible accessibilityLabel={t('analytics.provisionalBody', { time, count: banner.pending })}>
        <Notice tone="info">
          <AppText role="cardTitle" color={colors.info}>{t('analytics.provisional')}</AppText>
          <AppText color={colors.info} testID="analytics.provisional.lastSync">
            {banner.lastSyncedAt ? t('reports.lastSync', { time }) : t('analytics.neverSynced')}
          </AppText>
          <AppText color={colors.info} testID="analytics.provisional.pending">{t('reports.pending', { count: banner.pending })}</AppText>
        </Notice>
      </View>
    );
  };

  const progressCard = (s: StudentAnalyticsView['progress'][number]) => {
    const prefix = `analytics.progress.${s.section}`;
    return (
      <View key={s.section} testID={prefix} style={styles.sub}>
        <AppText role="cardTitle" accessibilityRole="header">{t(`sections.${s.section}`)}</AppText>
        {s.portionCount === 0 ? (
          <AppText color={colors.textSecondary}>{t('reports.sectionEmpty')}</AppText>
        ) : (
          <>
            {progressPairs(s.totals).map((p) => (
              <AppText key={p.unit} testID={`${prefix}.${p.unit}`}>
                {t('analytics.progress.line', {
                  unit: p.unit === 'PARA' ? t('analytics.progress.para') : t(`units.${p.unit}`),
                  completed: p.completed ? amount(p.completed) : t('analytics.notRecorded'),
                  assigned: p.assigned ? amount(p.assigned) : t('analytics.notRecorded'),
                })}
              </AppText>
            ))}
            {s.totals.notRecorded ? <AppText role="helper" color={colors.textSecondary}>{t('reports.portionsNotRecorded', { count: s.totals.notRecorded })}</AppText> : null}
            {s.extraTotals.completed.length ? <AppText role="helper">{t('reports.extra', { value: s.extraTotals.completed.map((q) => amount(q)).join(' · ') })}</AppText> : null}
            {s.section !== 'SABAQ'
              ? s.paras.map((p) => (
                  <AppText key={String(p.paraNumber)} role="helper" testID={`${prefix}.para.${p.paraNumber ?? 'none'}`}>
                    {t('reports.paraLine', {
                      para: isolate(p.paraNumber === null ? '—' : String(p.paraNumber)),
                      completed: p.totals.completed.length ? p.totals.completed.map((q) => amount(q)).join(' · ') : t('analytics.notRecorded'),
                      assigned: p.totals.assigned.map((q) => amount(q)).join(' · ') || t('reports.none'),
                    })}
                  </AppText>
                ))
              : null}
          </>
        )}
      </View>
    );
  };

  const mistakesCard = (data: StudentAnalyticsView) => {
    const m = data.mistakeTrend.totals;
    return (
      <Card>
        <View testID="analytics.mistakes" style={styles.block}>
          <AppText role="cardTitle" accessibilityRole="header">{t('analytics.mistakes.title')}</AppText>
          {!m.hasData ? (
            <AppText color={colors.textSecondary} testID="analytics.mistakes.notRecorded">{t('analytics.notRecorded')}</AppText>
          ) : (
            <>
              <AppText role="helper" color={colors.textSecondary}>{t('analytics.mistakes.byCategory')}</AppText>
              {MISTAKE_CODES.map((c) => (
                <AppText key={c} testID={`analytics.mistakes.category.${c}`}>{`${t(`mistakes.categories.${c}`)}: ${isolate(String(m.byCategory[c]))}`}</AppText>
              ))}
              <AppText role="helper" color={colors.textSecondary}>{t('analytics.mistakes.bySeverity')}</AppText>
              {(['MINOR', 'MAJOR'] as const).map((s) => (
                <AppText key={s} testID={`analytics.mistakes.severity.${s}`}>{`${t(`mistakes.severities.${s}`)}: ${isolate(String(m.bySeverity[s]))}`}</AppText>
              ))}
              <AppText testID="analytics.mistakes.repeated">{`${t('analytics.mistakes.repeated')}: ${isolate(String(m.repeated))}`}</AppText>
            </>
          )}
          {m.notRecorded > 0 ? <AppText role="helper" color={colors.textSecondary}>{t('reports.mistakesNotRecorded', { count: m.notRecorded })}</AppText> : null}
          {data.mistakeTrend.weeks.length > 1 ? (
            <>
              <AppText role="helper" color={colors.textSecondary}>{t('analytics.mistakes.weekly')}</AppText>
              {data.mistakeTrend.weeks.map((w, i) => (
                <AppText key={w.from} role="helper" testID={`analytics.mistakes.week.${i + 1}`}>
                  {t('analytics.mistakes.weekLine', {
                    from: isolate(w.from),
                    to: isolate(w.to),
                    value: w.hasData
                      ? MISTAKE_CODES.filter((c) => w.byCategory[c] > 0)
                          .map((c) => `${t(`mistakes.categories.${c}`)} ${isolate(String(w.byCategory[c]))}`)
                          .join(' · ') || t('mistakes.count', { count: isolate(String(w.total)) })
                      : t('analytics.notRecorded'),
                  })}
                </AppText>
              ))}
            </>
          ) : null}
        </View>
      </Card>
    );
  };

  const qualityCard = (data: StudentAnalyticsView) => {
    const q = data.qualityTrend;
    const avg = q.average;
    const sum = chartSummary(q.points);
    const label = avg.nearestScore === null ? t('analytics.notRecorded') : t(`quality.name.${avg.nearestScore}`);
    const summary = t('analytics.chart.summary', {
      from: isolate(data.period.from),
      to: isolate(data.period.to),
      avg: avg.display === null ? t('analytics.notRecorded') : isolate(avg.display),
      label,
      count: isolate(String(avg.count)),
      min: sum.best === null ? t('analytics.notRecorded') : isolate(oneDecimal(sum.best)),
      max: sum.weakest === null ? t('analytics.notRecorded') : isolate(oneDecimal(sum.weakest)),
      gaps: isolate(String(sum.gaps)),
    });
    const trend = trendMessage(q.direction, q.firstHalf, q.secondHalf);
    return (
      <Card>
        <View testID="analytics.quality" style={styles.block}>
          <AppText role="cardTitle" accessibilityRole="header">{t('analytics.quality.title')}</AppText>
          <AppText testID="analytics.quality.average">
            {avg.display === null || avg.nearestScore === null
              ? t('analytics.notRecorded')
              : t('analytics.quality.average', { value: isolate(avg.display), label, count: isolate(String(avg.count)) })}
          </AppText>
          <AppText testID="analytics.quality.trend">
            {`${TREND_ICON[q.direction] ?? 'ℹ'} ${t(trend.key, Object.fromEntries(Object.entries(trend.params).map(([k, v]) => [k, isolate(v)])))}`}
          </AppText>
          <AppText role="helper" color={colors.textSecondary}>{t('quality.lowerIsBetter')}</AppText>
          {!data.insufficientData && q.points.length ? <TrendChart points={q.points} summary={summary} /> : null}
          <AppText role="helper" testID="analytics.quality.summary">{summary}</AppText>
        </View>
      </Card>
    );
  };

  const difficultCard = (data: StudentAnalyticsView) => (
    <Card>
      <View testID="analytics.difficult" style={styles.block}>
        <AppText role="cardTitle" accessibilityRole="header">{t('analytics.difficult.title')}</AppText>
        {data.difficultPortions.length === 0 ? <AppText color={colors.textSecondary} testID="analytics.difficult.none">{t('analytics.difficult.none')}</AppText> : null}
        {data.difficultPortions.map((d, i) => (
          <View key={`${d.paraNumber ?? 'r'}-${i}`} testID={`analytics.difficult.${i + 1}`} style={styles.block}>
            <AppText>
              {t('analytics.difficult.item', {
                portion:
                  d.paraNumber !== null
                    ? t('analytics.difficult.para', { para: isolate(String(d.paraNumber)) })
                    : d.range
                      ? t('analytics.difficult.range', { surah: isolate(String(d.range.surahStart)), from: isolate(String(d.range.ayahStart)), to: isolate(String(d.range.ayahEnd)) })
                      : '—',
                count: isolate(String(d.dates.length)),
              })}
            </AppText>
            <AppText role="helper" color={colors.textSecondary}>
              {[
                d.sections.map((s) => t(`sections.${s}`)).join(', '),
                d.notRememberedAttempts ? `${t('portionStatus.NOT_REMEMBERED')}: ${isolate(String(d.notRememberedAttempts))}` : '',
                MISTAKE_CODES.filter((c) => d.byCategory[c] > 0)
                  .map((c) => `${t(`mistakes.categories.${c}`)}: ${isolate(String(d.byCategory[c]))}`)
                  .join(' · '),
                d.dates.map((x) => isolate(x)).join(', '),
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );

  const attendanceCard = (data: StudentAnalyticsView, source: AnalyticsSource) => (
    <Card>
      <View testID="analytics.attendance" style={styles.block}>
        <AppText role="cardTitle" accessibilityRole="header">{t('analytics.attendance.title')}</AppText>
        {noCalendar && source === 'DEVICE' ? (
          <AppText color={colors.textSecondary}>{t('reports.noCalendar')}</AppText>
        ) : (
          attendanceRows(data.attendance).map((row) => (
            <AppText key={row.key} testID={`analytics.attendance.${row.key}`}>{t(`reports.att.${row.key}`, { count: isolate(String(row.count)) })}</AppText>
          ))
        )}
      </View>
    </Card>
  );

  const homeworkCard = (data: StudentAnalyticsView) => (
    <Card>
      <View testID="analytics.homework" style={styles.block}>
        <AppText role="cardTitle" accessibilityRole="header">{t('analytics.homework.title')}</AppText>
        {(['confirmed', 'completed', 'outstanding'] as const).map((k) => (
          <AppText key={k} testID={`analytics.homework.${k}`}>{t(`reports.hw.${k}`, { count: isolate(String(data.homework[k])) })}</AppText>
        ))}
        <AppText testID="analytics.homework.carriedOver">{`${t('analytics.homework.carried')}: ${isolate(String(data.homework.carriedOver))}`}</AppText>
      </View>
    </Card>
  );

  const body = (data: StudentAnalyticsView, source: AnalyticsSource) => {
    const ai = aiView({ role: me.role, online: sync.online, serverState: serverAi, insufficientData: data.insufficientData || !data.hasData, request: aiRequest });
    return (
      <>
        {provisional(data)}
        <AppText role="sectionTitle" accessibilityRole="header">{t('analytics.metricsHeader')}</AppText>
        {!data.hasData || data.insufficientData ? (
          <Card>
            <AppText testID="analytics.notEnough">{t('analytics.notEnough')}</AppText>
            <AppText role="helper" color={colors.textSecondary}>{t('analytics.notEnoughHelp')}</AppText>
          </Card>
        ) : null}
        {data.hasData ? (
          <>
            <Card>
              <View style={styles.block}>
                <AppText role="cardTitle" accessibilityRole="header">{t('analytics.progress.title')}</AppText>
                {data.progress.map(progressCard)}
              </View>
            </Card>
            {mistakesCard(data)}
            {qualityCard(data)}
            {difficultCard(data)}
            {attendanceCard(data, source)}
            {homeworkCard(data)}
          </>
        ) : null}
        <AiPanel view={ai} onGet={() => void getAi()} onOpenSettings={onOpenAiSettings} />
      </>
    );
  };

  // ---------- Render ----------

  return (
    <AppScreen title={t('analytics.title')} testID="analytics.screen">
      {sync.enabled || sync.loadError ? <SyncBanner banner={sync.banner} onPress={onSyncQueue} loadError={sync.loadError} /> : null}
      {revoked ? <Notice tone="error" testID="analytics.revoked">{t('analytics.revoked')}</Notice> : null}
      {error ? (
        <>
          <Notice tone="error" testID="analytics.error">{error}</Notice>
          <Button testID="analytics.retry" variant="secondary" label={t('common.retry')} onPress={() => setReloadKey((k) => k + 1)} />
        </>
      ) : null}

      {classes === null && !error ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {classes?.length === 0 ? <AppText>{t('daily.noClasses')}</AppText> : null}
      {classes?.length ? (
        <ChipRow label={t('attendance.class')}>
          {classes.map((c) => (
            <Chip
              key={c.id}
              testID={`analytics.class.${c.name}`}
              label={c.name}
              selected={c.id === classId}
              onPress={() => {
                setRevoked(false);
                setClassId(c.id);
                setStudentId(null);
                setShown(null);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      {students?.length ? (
        <ChipRow label={t('daily.student')}>
          {students.map((s) => (
            <Chip
              key={s.id}
              testID={`analytics.student.${s.externalStudentId ?? s.id}`}
              label={s.name}
              selected={s.id === studentId}
              onPress={() => {
                setStudentId(s.id);
                setShown(null);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      <ChipRow label={t('reports.kindLabel')}>
        <Chip testID="analytics.period.WEEK" label={t('reports.weekly')} selected={kind === 'WEEK'} onPress={() => setKind('WEEK')} />
        <Chip testID="analytics.period.MONTH" label={t('reports.monthly')} selected={kind === 'MONTH'} onPress={() => setKind('MONTH')} />
      </ChipRow>
      <View style={styles.row}>
        <Button testID="analytics.period.prev" variant="tertiary" label={t('reports.previous')} onPress={() => setAnchor(shiftPeriod(period, -1).from)} />
        <Button testID="analytics.period.next" variant="tertiary" label={t('reports.next')} onPress={() => setAnchor(shiftPeriod(period, 1).from)} disabled={period.to >= today} />
      </View>
      <AppText testID="analytics.range">{t('reports.range', { from: isolate(period.from), to: isolate(period.to), timeZone: isolate(period.timeZone) })}</AppText>

      {!classId || !studentId ? <AppText color={colors.textSecondary} testID="analytics.choose">{t('analytics.choose')}</AppText> : null}
      {loading ? <AppText color={colors.textSecondary} testID="analytics.loading">{t('analytics.loading')}</AppText> : null}
      {!loading && shown && classId && studentId ? body(shown.data, shown.source) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[1] },
  sub: { gap: space[1], paddingTop: space[2], borderTopWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
});
