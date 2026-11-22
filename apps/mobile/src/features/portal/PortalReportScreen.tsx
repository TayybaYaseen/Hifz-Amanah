// F10 · One published report for a Student or Parent (design.md §4.11, §4.12; FR-PORT-006; F10-AC1, AC2, AC4, AC11,
// AC15, AC17). Read-only: no edit, comment, or reply control (F10 "Out of scope").
// - It shows what the server sends, already projected for this audience: attendance apart from performance, portions
//   with quantities and statuses, quality as number + label from the approved scale (lower is better), mistake counts by
//   category, the overall label, confirmed homework, the remarks and mistake notes the Teacher shared, and the
//   teacher's name. Internal notes, Leave reasons, draft homework, AI output, and sync details never reach the app.
// - "Updated on …" when a correction changed the report after it was published (F10-AC15).
// - Not found reads "This report is not available" whatever the reason (unpublished, revoked, not theirs, F10-AC2, AC7).
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { FamilyPortionLineView, FamilySectionView, PortalReportResponse } from '@hifz/contracts';
import { useSession } from '../../auth/SessionContext.tsx';
import { StatusChip } from '../../components/StatusChip.tsx';
import { useFormatDateTime } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Notice, isolate } from '../../components/ui.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { useAmount } from '../daily-entry/PortionCard.tsx';
import { attendanceRows, averageText, totalsLines } from '../reports/view.ts';
import { fetchPortalReport } from './api.ts';
import { categoryCounts, portalFailure, type PortalFailure } from './view.ts';

export function PortalReportScreen({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const formatTime = useFormatDateTime();
  const amount = useAmount();
  const [data, setData] = useState<PortalReportResponse | null>(null);
  const [failure, setFailure] = useState<PortalFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));

  useEffect(() => {
    let live = true;
    setFailure(null);
    void (async () => {
      try {
        const res = await fetchPortalReport(session, reportId);
        if (live) setData(res);
      } catch (err) {
        if (!live) return;
        // Never keep showing an earlier copy: offline or unavailable clears it (no cached report data, F10-AC4).
        setData(null);
        setFailure(portalFailure(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [session, reportId, reloadKey]);

  if (failure) {
    return (
      <AppScreen title={t('portal.reportTitle')} testID="portalReport.screen">
        <Notice tone="error" testID={failure === 'OFFLINE' ? 'portal.offline' : failure === 'NOT_AVAILABLE' ? 'portalReport.unavailable' : 'portalReport.error'}>
          {t(failure === 'OFFLINE' ? 'portal.offline' : failure === 'NOT_AVAILABLE' ? 'portal.unavailable' : 'errors.INTERNAL')}
        </Notice>
        {failure === 'NOT_AVAILABLE' ? (
          <Button testID="portalReport.back" variant="secondary" label={t('common.back')} onPress={onBack} />
        ) : (
          <Button testID="portalReport.retry" label={t('common.retry')} onPress={() => setReloadKey((k) => k + 1)} />
        )}
      </AppScreen>
    );
  }
  if (!data) {
    return (
      <AppScreen title={t('portal.reportTitle')} testID="portalReport.screen">
        <AppText color={colors.textSecondary} testID="portalReport.loading">{t('common.loading')}</AppText>
      </AppScreen>
    );
  }

  const r = data.report;
  const scoreText = (q: number | null) => (q === null ? t('quality.notRecorded') : t('quality.option', { score: isolate(String(q)), label: t(`quality.name.${q}`) }));

  const line = (p: FamilyPortionLineView, testID: string) => (
    <View key={p.portionId} testID={testID} style={{ gap: space[1], paddingVertical: space[2], borderTopWidth: 1, borderColor: colors.border }}>
      <AppText testID={`${testID}.what`}>
        {p.section === 'SABAQ' && p.range
          ? t('reports.sabaqLine', { surah: isolate(String(p.range.surahStart)), range: isolate(`${p.range.ayahStart}–${p.range.ayahEnd}`), para: isolate(String(p.paraNumber ?? '—')) })
          : t('reports.paraOnly', { section: t(`sections.${p.section}`), para: isolate(String(p.paraNumber ?? '—')) })}
        {p.isExtra ? ` · ${t('reports.extraLabel')}` : ''}
      </AppText>
      <View style={{ flexDirection: 'row' }}>
        {p.status ? <StatusChip status={p.status} testID={`${testID}.status.${p.status}`} /> : <AppText color={colors.textSecondary}>{t('quality.notRecorded')}</AppText>}
      </View>
      <AppText testID={`${testID}.amount`}>{t('reports.amountLine', { completed: p.completed ? amount(p.completed) : t('quality.notRecorded'), assigned: amount(p.assigned) })}</AppText>
      <AppText role="helper" testID={`${testID}.quality`}>
        {`${t('reports.qualityLine', { value: scoreText(p.quality) })} · ${p.mistakeCount === null ? t('mistakes.notRecorded') : t('mistakes.count', { count: isolate(String(p.mistakeCount)) })}`}
      </AppText>
      {p.mistakes.map((m, i) => (m.note ? <AppText key={i} role="helper" testID={`${testID}.note.${i + 1}`}>{`${t(`mistakes.categories.${m.category}`)}: ${m.note}`}</AppText> : null))}
      {p.remarks ? <AppText role="helper" testID={`${testID}.remarks`}>{t('portal.remark', { text: p.remarks })}</AppText> : null}
    </View>
  );

  const section = (s: FamilySectionView) => (
    <Card key={s.section}>
      <View testID={`portalReport.section.${s.section}`} style={{ gap: space[1] }}>
        <AppText role="cardTitle" accessibilityRole="header">{t(`sections.${s.section}`)}</AppText>
        {s.portionCount === 0 ? (
          <AppText color={colors.textSecondary}>{t('reports.sectionEmpty')}</AppText>
        ) : (
          <>
            <AppText>{t('reports.assigned', { value: totalsLines(s.totals.assigned, amount, t).join(' · ') })}</AppText>
            <AppText>{t('reports.completed', { value: totalsLines(s.totals.completed, amount, t).join(' · ') })}</AppText>
            <AppText>{t('reports.remaining', { value: totalsLines(s.totals.remaining, amount, t).join(' · ') })}</AppText>
            <AppText role="helper">
              {(['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'PENDING', 'ABSENT', 'NOT_ASSIGNED'] as const)
                .filter((k) => s.statusCounts[k] > 0)
                .map((k) => `${t(`portionStatus.${k}`)}: ${isolate(String(s.statusCounts[k]))}`)
                .join(' · ') || t('reports.none')}
            </AppText>
            <AppText>{t('reports.qualityLine', { value: averageText(s.quality, t, isolate) })}</AppText>
          </>
        )}
      </View>
    </Card>
  );

  return (
    <AppScreen title={t('portal.reportTitle')} testID="portalReport.screen">
      <AppText role="sectionTitle" testID="portalReport.student">{isolate(r.student.name)}</AppText>
      <AppText testID="portalReport.range">{t('reports.range', { from: isolate(r.period.from), to: isolate(r.period.to), timeZone: isolate(r.period.timeZone) })}</AppText>
      <AppText role="helper" color={colors.textSecondary}>{t('portal.publishedOn', { time: formatTime(data.publishedAt, true) })}</AppText>
      {data.updatedAt ? <Notice tone="info" testID="portalReport.updated">{t('portal.updatedOn', { time: formatTime(data.updatedAt, true) })}</Notice> : null}
      <AppText testID="portalReport.teachers">
        {data.teachers.length ? t('portal.teachers', { names: data.teachers.map((x) => isolate(x.name)).join(t('common.listSeparator')) }) : t('portal.noTeacher')}
      </AppText>

      {!r.hasData ? (
        <Card>
          <AppText testID="portalReport.noRecords">{t('reports.noRecords')}</AppText>
          <AppText role="helper" color={colors.textSecondary}>{t('reports.noRecordsHelp')}</AppText>
        </Card>
      ) : (
        <>
          {/* Attendance, apart from performance; Leave and normal absence are separate lines (FR-CAL-005). */}
          <Card>
            <View testID="portalReport.attendance" style={{ gap: space[1] }}>
              <AppText role="cardTitle" accessibilityRole="header">{t('reports.attendanceTitle')}</AppText>
              {attendanceRows(r.attendance.counts).map((row) => (
                <AppText key={row.key} testID={`portalReport.attendance.${row.key}`}>{t(`reports.att.${row.key}`, { count: isolate(String(row.count)) })}</AppText>
              ))}
            </View>
          </Card>

          <Card>
            <View testID="portalReport.performance" style={{ gap: space[1] }}>
              <AppText role="cardTitle" accessibilityRole="header">{t('reports.performanceTitle')}</AppText>
              <AppText testID="portalReport.quality">{t('reports.averageQuality', { value: averageText(r.quality, t, isolate) })}</AppText>
              <AppText role="helper" color={colors.textSecondary}>{t('quality.lowerIsBetter')}</AppText>
              <AppText testID="portalReport.mistakes">{r.mistakes.recordedAttempts === 0 ? t('mistakes.notRecorded') : t('mistakes.count', { count: isolate(String(r.mistakes.total)) })}</AppText>
              {categoryCounts(r.mistakes.byCategory).length ? (
                <AppText role="helper" testID="portalReport.mistakes.byCategory">
                  {categoryCounts(r.mistakes.byCategory)
                    .map(([k, n]) => `${t(`mistakes.categories.${k}`)}: ${isolate(String(n))}`)
                    .join(' · ')}
                </AppText>
              ) : null}
            </View>
          </Card>
          {r.sections.map(section)}

          {/* Confirmed homework only (FR-PORT-006). */}
          <Card>
            <View testID="portalReport.homework" style={{ gap: space[1] }}>
              <AppText role="cardTitle" accessibilityRole="header">{t('reports.homeworkTitle')}</AppText>
              {(['confirmed', 'assigned', 'attempted', 'completed', 'carriedOver', 'outstanding'] as const).map((k) => (
                <AppText key={k} testID={`portalReport.homework.${k}`}>{t(`reports.hw.${k}`, { count: isolate(String(r.homework[k])) })}</AppText>
              ))}
            </View>
          </Card>

          <AppText role="sectionTitle" accessibilityRole="header">{t('reports.historyTitle')}</AppText>
          {r.days.length === 0 ? <AppText color={colors.textSecondary}>{t('reports.historyEmpty')}</AppText> : null}
          {r.days.map((d) => (
            <Card key={d.recordId}>
              <View testID={`portalReport.day.${d.date}`} style={{ gap: space[1] }}>
                <AppText role="cardTitle">{d.sessionLabel ? t('reports.dayWithSession', { date: isolate(d.date), session: isolate(d.sessionLabel) }) : isolate(d.date)}</AppText>
                <AppText role="helper" testID={`portalReport.day.${d.date}.overall`}>{t('overall.value', { label: t(d.overallLabel ? `overall.${d.overallLabel}` : 'overall.none') })}</AppText>
                {d.portions.map((p, i) => line(p, `portalReport.day.${d.date}.portion.${i + 1}`))}
              </View>
            </Card>
          ))}
        </>
      )}
    </AppScreen>
  );
}
