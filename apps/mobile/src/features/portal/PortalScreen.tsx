// F10 · Student and Parent reports home (design.md §4.11, §4.12; US-044, US-045; F10-AC1…AC7).
// - Online and read-only: no edit control anywhere. Every view is fetched fresh; nothing is kept on the device, so a
//   Student and a Parent who share a phone never see each other's data (F10 edge case, NFR-PORT-005).
// - A Parent switches between their verified linked students only; there is no search (F10-AC5, AC6). A revoked link
//   disappears from the switcher on the next load, and its reports answer "not available" (F10-AC7).
// - No connection: "Network unavailable", with no cached report data (F10-AC4).
// - No published report yet: "No report is available yet", never an empty chart that reads as zero.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { MeResponse, PortalReportListItem, PortalStudentsResponse } from '@hifz/contracts';
import type { PeriodKind } from '@hifz/domain/reports';
import { useSession } from '../../auth/SessionContext.tsx';
import { useFormatDateTime } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Notice, isolate } from '../../components/ui.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import { fetchPortalReports, fetchPortalStudents } from './api.ts';
import { appendPage, pickStudent, portalFailure, showSwitcher, type PortalFailure } from './view.ts';

export function PortalScreen({ me, onOpen }: { me: MeResponse; onOpen: (reportId: string) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const formatTime = useFormatDateTime();
  const [students, setStudents] = useState<PortalStudentsResponse['items'] | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [kind, setKind] = useState<PeriodKind>('WEEK');
  const [items, setItems] = useState<PortalReportListItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failure, setFailure] = useState<PortalFailure | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // The chosen student as of the last render, read by the student-list load (no stale closure).
  const chosenRef = useRef<string | null>(null);
  chosenRef.current = studentId;

  // Every return to this screen asks the server again: an unpublished report or a revoked link shows at once.
  useFocusEffect(useCallback(() => setReloadKey((k) => k + 1), []));

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetchPortalStudents(session);
        if (!live) return;
        setFailure(null);
        setStudents(res.items);
        const current = chosenRef.current;
        const next = pickStudent(res.items, current);
        // The chosen child is no longer linked (F10-AC7): say so, then show the remaining ones.
        if (current !== null && next !== current) setRevoked(true);
        setStudentId(next);
      } catch (err) {
        if (!live) return;
        setStudents(null);
        setItems(null);
        setFailure(portalFailure(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [session, reloadKey]);

  useEffect(() => {
    if (!studentId) {
      setItems(null);
      return;
    }
    let live = true;
    setItems(null);
    void (async () => {
      try {
        const res = await fetchPortalReports(session, studentId, kind, null);
        if (!live) return;
        setItems(res.items);
        setCursor(res.nextCursor);
      } catch (err) {
        if (!live) return;
        const f = portalFailure(err);
        if (f === 'NOT_AVAILABLE') {
          // The link went away between the two requests: reload the switcher.
          setRevoked(true);
          setReloadKey((k) => k + 1);
          return;
        }
        setFailure(f);
      }
    })();
    return () => {
      live = false;
    };
  }, [session, studentId, kind, reloadKey]);

  const loadMore = async () => {
    if (!studentId || !cursor || busy) return;
    setBusy(true);
    try {
      const res = await fetchPortalReports(session, studentId, kind, cursor);
      setItems((current) => appendPage(current ?? [], res.items));
      setCursor(res.nextCursor);
    } catch (err) {
      setFailure(portalFailure(err));
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setFailure(null);
    setReloadKey((k) => k + 1);
  };

  if (failure === 'OFFLINE') {
    return (
      <AppScreen title={t('portal.title')} testID="portal.screen">
        <Notice tone="error" testID="portal.offline">{t('portal.offline')}</Notice>
        <Button testID="portal.retry" label={t('common.retry')} onPress={retry} />
      </AppScreen>
    );
  }
  if (failure === 'ERROR' || failure === 'NOT_AVAILABLE') {
    return (
      <AppScreen title={t('portal.title')} testID="portal.screen">
        <Notice tone="error" testID="portal.error">{t('errors.INTERNAL')}</Notice>
        <Button testID="portal.retry" label={t('common.retry')} onPress={retry} />
      </AppScreen>
    );
  }

  const chosen = students?.find((s) => s.id === studentId) ?? null;
  return (
    <AppScreen title={t('portal.title')} testID="portal.screen">
      <AppText role="helper" color={colors.textSecondary} testID="portal.readOnly">{t('portal.readOnly')}</AppText>
      {revoked ? <Notice tone="info" testID="portal.revoked">{t('portal.revoked')}</Notice> : null}
      {students === null ? <AppText color={colors.textSecondary} testID="portal.loading">{t('common.loading')}</AppText> : null}
      {students !== null && students.length === 0 ? (
        <Card>
          <AppText role="cardTitle" testID="portal.noLink">{t(me.role === 'PARENT' ? 'portal.noLinkParent' : 'portal.noLinkStudent')}</AppText>
          <AppText role="helper" color={colors.textSecondary}>{t('portal.contactMadrasa')}</AppText>
        </Card>
      ) : null}
      {students && showSwitcher(students) ? (
        <ChipRow label={t('portal.child')}>
          {students.map((s, i) => (
            <Chip
              key={s.id}
              testID={`portal.child.${i + 1}`}
              label={s.name}
              selected={s.id === studentId}
              onPress={() => {
                setRevoked(false);
                setStudentId(s.id);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      {chosen ? (
        <>
          <AppText role="sectionTitle" testID="portal.student">{isolate(chosen.name)}</AppText>
          <ChipRow label={t('reports.kindLabel')}>
            <Chip testID="portal.kind.week" label={t('reports.weekly')} selected={kind === 'WEEK'} onPress={() => setKind('WEEK')} />
            <Chip testID="portal.kind.month" label={t('reports.monthly')} selected={kind === 'MONTH'} onPress={() => setKind('MONTH')} />
          </ChipRow>
          {items === null ? <AppText color={colors.textSecondary} testID="portal.loading">{t('common.loading')}</AppText> : null}
          {items?.length === 0 ? (
            <Card>
              <AppText testID="portal.noReports">{t('portal.noReports')}</AppText>
              <AppText role="helper" color={colors.textSecondary}>{t('portal.noReportsHelp')}</AppText>
            </Card>
          ) : null}
          {items?.map((r) => (
            <Card key={r.id}>
              <View style={{ gap: space[1] }}>
                <AppText role="cardTitle">{t('portal.period', { from: isolate(r.from), to: isolate(r.to) })}</AppText>
                <AppText role="helper" color={colors.textSecondary}>{t('portal.publishedOn', { time: formatTime(r.publishedAt, true) })}</AppText>
                {r.updatedAt ? <AppText role="helper" testID={`portal.updated.${r.from}`}>{t('portal.updatedOn', { time: formatTime(r.updatedAt, true) })}</AppText> : null}
                <Button testID={`portal.report.${r.kind}.${r.from}`} variant="secondary" label={t('portal.open')} onPress={() => onOpen(r.id)} />
              </View>
            </Card>
          ))}
          {cursor ? <Button testID="portal.more" variant="tertiary" label={t('portal.more')} busy={busy} onPress={() => void loadMore()} /> : null}
        </>
      ) : null}
    </AppScreen>
  );
}
