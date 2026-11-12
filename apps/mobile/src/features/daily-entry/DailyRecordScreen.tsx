// F05 · Daily record detail (design.md §13 US-023; UI spec §4; F05-AC1, AC2, AC4, AC11, AC13, AC15, AC16).
// Reads the device first (works offline) and refreshes from GET /hifz/daily-records/:id when online. The sync state
// covers all of the record's operations: "Saved on this device" (◷) until the server acknowledges every one, ✓ only
// then. Each portion shows its own current outcome from its latest attempt (portionProgress); the assigned amount is
// counted once (F05-AC16). Remarks are staff-only and labelled so.
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DailyRecordDetail, MeResponse } from '@hifz/contracts';
import { mistakeCount, portionProgress } from '@hifz/domain/hifz';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { SavedOnDeviceNotice, SyncStateIcon, useFormatDateTime } from '../../components/sync.tsx';
import { StatusChip } from '../../components/StatusChip.tsx';
import { AppScreen, AppText, Button, Card, Notice, QuranText, isolate } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { cachedClasses } from '../attendance/local.ts';
import { useQuranReference } from '../quran/QuranReferenceContext.tsx';
import { SECTION_LIST, sectionSlug } from './form.ts';
import { readRecord, recordSyncState, storeDetail, type LocalAttempt, type LocalPortion, type LocalRecord } from './local.ts';
import { portionTitle, useAmount } from './PortionCard.tsx';
import { recordRejections } from './rejections.ts';

export function DailyRecordScreen({ me, recordId, edited, onEdit, onAddAttempt, onSyncQueue, onOpenRecord }: {
  me: MeResponse;
  recordId: string;
  edited: boolean;
  onEdit: () => void;
  onAddAttempt: (portionId: string) => void;
  onSyncQueue: () => void;
  onOpenRecord: (recordId: string) => void;
}) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const { index } = useQuranReference();
  const amount = useAmount();
  const formatTime = useFormatDateTime();
  const [record, setRecord] = useState<LocalRecord | null>(null);
  const [className, setClassName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ key: string; denied: boolean; notOnDevice: boolean } | null>(null);
  const [history, setHistory] = useState<Record<string, boolean>>({});

  const readLocal = useCallback(async () => {
    if (!sync.db) return null;
    const local = await readRecord(sync.db, recordId);
    setRecord(local);
    if (local && !local.className) {
      const cls = (await cachedClasses(sync.db)).find((c) => c.id === local.classId);
      setClassName(cls?.name ?? null);
    }
    return local;
  }, [recordId, sync.db]);

  const load = useCallback(async () => {
    if (!sync.db) return;
    setError(null);
    setLoading(true);
    const local = await readLocal();
    try {
      const detail = await session.authorized<DailyRecordDetail>(`/hifz/daily-records/${recordId}`);
      await storeDetail(sync.db, detail, { studentName: detail.record.studentName, className: null });
      await readLocal();
    } catch (err) {
      if (!local) {
        const network = err instanceof ApiFailure && err.code === 'NETWORK';
        const denied = err instanceof ApiFailure && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND');
        setError({ key: network ? 'dailyRecord.notOnDevice' : (errorKeys(err).form ?? 'errors.INTERNAL'), denied, notOnDevice: network });
      }
      // A record only on this device (not synced yet) is shown from the device.
    } finally {
      setLoading(false);
    }
  }, [readLocal, recordId, session, sync.db]);

  useEffect(() => {
    void load();
  }, [load]);

  // The queue changed (a sync acknowledged an operation, or a pull brought a newer version): re-read the device.
  useEffect(() => {
    void readLocal();
  }, [sync.items, readLocal]);

  if (!record) {
    return (
      <AppScreen title={t('dailyRecord.title')} testID="record.screen">
        {loading ? <AppText color={colors.textSecondary} testID="record.loading">{t('common.loading')}</AppText> : null}
        {error ? (
          <>
            <Notice tone="error" testID={error.denied ? 'record.denied' : error.notOnDevice ? 'record.notOnDevice' : 'record.error'}>{t(error.key)}</Notice>
            {!error.denied ? <Button testID="record.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} /> : null}
          </>
        ) : null}
      </AppScreen>
    );
  }

  const state = recordSyncState(sync.items, record);
  const rejections = recordRejections(sync.items, record);
  const visible = record.portions.filter((p) => !p.removed);
  const recorder = (a: { recordedBy: string | null; recordedByName: string | null }) =>
    a.recordedByName ?? (a.recordedBy === me.id ? me.displayName : t('dailyRecord.unknownRecorder'));

  const qualityText = (q: number | null) => (q === null ? t('quality.notRecorded') : t('quality.option', { score: String(q), label: t(`quality.name.${q}`) }));
  const mistakesText = (a: LocalAttempt) => {
    const count = mistakeCount(a);
    const head = count === null ? t('mistakes.notRecorded') : count === 0 ? t('mistakes.noneChosen') : t('mistakes.count', { count: isolate(String(count)) });
    const items = a.mistakes.map((m) => [t(`mistakes.categories.${m.category}`), t(`mistakes.severities.${m.severity}`), ...(m.repeated ? [t('mistakes.repeated')] : [])].join(' · '));
    return [head, ...items].join('\n');
  };

  const portionBlock = (p: LocalPortion, n: number) => {
    const prefix = `record.${sectionSlug(p.section)}.portion.${n}`;
    const progress = p.assigned ? portionProgress({ assigned: p.assigned }, p.attempts) : null;
    const latest = p.attempts.at(-1) ?? null;
    const open = history[p.id] ?? false;
    const name = p.range ? index?.surahNames.get(p.range.surahStart)?.nameAr : undefined;
    const pRejections = rejections.portions.filter((r) => r.portionId === p.id);
    return (
      <Card key={p.id}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
          <AppText role="cardTitle" testID={`${prefix}.title`}>{portionTitle(t, p.section, n)}</AppText>
          {p.isExtra ? <AppText role="helper" color={colors.info} testID={`${prefix}.extra`}>{`＋ ${t('daily.extra')}`}</AppText> : null}
          {progress?.currentStatus ? <StatusChip status={progress.currentStatus} testID={`${prefix}.status.${progress.currentStatus}`} /> : null}
        </View>
        {p.section === 'SABAQ' && p.range ? (
          <View>
            {name ? <QuranText>{name}</QuranText> : null}
            <AppText testID={`${prefix}.range`}>
              {t('dailyRecord.range', { surah: isolate(String(p.range.surahStart)), range: isolate(`${p.range.ayahStart}–${p.range.ayahEnd}`) })}
            </AppText>
          </View>
        ) : null}
        {p.paraNumber !== null ? <AppText testID={`${prefix}.para`}>{t('quranRef.range.para', { para: isolate(String(p.paraNumber)) })}</AppText> : null}
        {p.section === 'SABAQ' && p.totalLines !== null ? <AppText testID={`${prefix}.totalLines`}>{t('dailyRecord.totalLines', { count: isolate(String(p.totalLines)) })}</AppText> : null}
        {progress ? (
          <>
            <AppText testID={`${prefix}.assigned`}>{t('dailyRecord.assigned', { amount: amount(progress.assigned) })}</AppText>
            <AppText testID={`${prefix}.completed`}>{t('dailyRecord.completed', { amount: progress.completed ? amount(progress.completed) : t('quality.notRecorded') })}</AppText>
            <AppText testID={`${prefix}.remaining`}>{t('daily.remaining', { amount: progress.remaining ? amount(progress.remaining) : t('quality.notRecorded') })}</AppText>
            <AppText testID={`${prefix}.quality`}>{t('quality.value', { value: qualityText(progress.quality) })}</AppText>
          </>
        ) : null}
        {latest ? <AppText role="helper" testID={`${prefix}.mistakes`}>{mistakesText(latest)}</AppText> : null}
        {latest?.remarks ? (
          <View>
            <AppText role="helper" color={colors.textSecondary}>{`🔒 ${t('daily.privateToStaff')}`}</AppText>
            <AppText testID={`${prefix}.remarks`}>{t('dailyRecord.remarks', { text: latest.remarks })}</AppText>
          </View>
        ) : null}
        {pRejections.map((r) => (
          <AppText key={`${r.field}-${r.messageKey}`} role="helper" color={colors.danger} testID={`${prefix}.rejected`} accessibilityRole="alert">
            {`⚠ ${t('daily.portionError', { portion: portionTitle(t, p.section, n), message: t(`daily.fieldError.${r.messageKey}`, Object.fromEntries(Object.entries(r.params ?? {}).map(([k, v]) => [k, isolate(String(v))]))) })}`}
          </AppText>
        ))}
        <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.attemptCount`}>{t('dailyRecord.attempts', { count: isolate(String(p.attempts.length)) })}</AppText>
        <Button testID={`${prefix}.addAttempt`} variant="secondary" label={t('dailyRecord.addAttempt')} onPress={() => onAddAttempt(p.id)} />
        {p.attempts.length ? (
          <Button
            testID={`${prefix}.history`}
            variant="tertiary"
            label={open ? t('dailyRecord.hideHistory') : t('dailyRecord.viewHistory')}
            onPress={() => setHistory((h) => ({ ...h, [p.id]: !open }))}
          />
        ) : null}
        {open
          ? p.attempts.map((a) => {
              const k = a.attemptNo;
              const ap = `${prefix}.attempt.${k}`;
              const current = latest?.id === a.id;
              return (
                <View key={a.id} testID={ap} style={{ gap: space[1], borderTopWidth: 1, borderColor: colors.border, paddingTop: space[2] }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
                    <AppText style={{ fontWeight: '600' }}>{t('dailyRecord.attemptTitle', { number: isolate(String(k)) })}</AppText>
                    {current ? <AppText role="helper" color={colors.brandPrimary} testID={`${ap}.current`}>{`● ${t('dailyRecord.currentAttempt')}`}</AppText> : null}
                    <StatusChip status={a.status} testID={`${ap}.status.${a.status}`} />
                  </View>
                  <AppText role="helper" color={colors.textSecondary} testID={`${ap}.time`}>{formatTime(a.attemptedAt)}</AppText>
                  <AppText role="helper" color={colors.textSecondary} testID={`${ap}.recorder`}>{t('dailyRecord.recordedBy', { name: isolate(recorder(a)) })}</AppText>
                  <AppText role="helper" testID={`${ap}.completed`}>{t('dailyRecord.completed', { amount: a.completed ? amount(a.completed) : t('quality.notRecorded') })}</AppText>
                  <AppText role="helper" testID={`${ap}.mistakes`}>{mistakesText(a)}</AppText>
                  <AppText role="helper" testID={`${ap}.quality`}>{t('quality.value', { value: qualityText(a.quality) })}</AppText>
                  {a.remarks ? <AppText role="helper" testID={`${ap}.remarks`}>{`🔒 ${t('dailyRecord.remarks', { text: a.remarks })}`}</AppText> : null}
                </View>
              );
            })
          : null}
      </Card>
    );
  };

  return (
    <AppScreen title={t('dailyRecord.title')} testID="record.screen">
      {state === 'PENDING' || state === 'SYNCING' ? <SavedOnDeviceNotice /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <SyncStateIcon kind={state} spinning={state === 'SYNCING'} />
        <AppText testID={`record.sync.${state}`}>{t(`sync.state.${state}`)}</AppText>
      </View>
      {state === 'FAILED' || state === 'ACTION_REQUIRED' ? (
        <>
          {rejections.record.length || rejections.portions.length ? (
            <Notice tone="error" testID="record.rejected">{[t('dailyRecord.rejected'), ...rejections.record.map((k) => t(k))].join('\n')}</Notice>
          ) : null}
          {rejections.existingRecordId ? (
            <Button testID="record.openExisting" variant="secondary" label={t('daily.duplicate.open')} onPress={() => onOpenRecord(rejections.existingRecordId!)} />
          ) : null}
          <Button testID="record.reviewSync" variant="tertiary" label={t('dailyRecord.reviewSync')} onPress={onSyncQueue} />
        </>
      ) : null}
      {edited ? <Notice tone="info" testID="record.homeworkNotice">{t('dailyRecord.homeworkUnchanged')}</Notice> : null}

      <Card>
        <AppText role="cardTitle" testID="record.student">{isolate(record.studentName ?? '')}</AppText>
        {record.className ?? className ? <AppText testID="record.class">{t('dailyRecord.class', { name: isolate((record.className ?? className)!) })}</AppText> : null}
        {/* The Teacher's chosen date, never the save or sync time (F05-AC1, AC2). */}
        <AppText testID="record.date">{t('dailyRecord.date', { date: isolate(record.reportDate) })}</AppText>
        {record.sessionLabel ? <AppText testID="record.session">{t('dailyRecord.session', { label: isolate(record.sessionLabel) })}</AppText> : null}
        <AppText role="helper" color={colors.textSecondary} testID="record.recordedBy">{t('dailyRecord.recordedBy', { name: isolate(recorder(record)) })}</AppText>
        <AppText testID="record.portionCount">{t('dailyRecord.portionCount', { count: isolate(String(visible.length)) })}</AppText>
      </Card>

      {SECTION_LIST.map((section) => {
        const slug = sectionSlug(section);
        const list = visible.filter((p) => p.section === section);
        return (
          <View key={section} style={{ gap: space[3] }}>
            <AppText role="sectionTitle" testID={`record.${slug}.section`}>{t(`sections.${section}`)}</AppText>
            {list.length === 0 ? <AppText color={colors.textSecondary} testID={`record.${slug}.empty`}>{t('dailyRecord.sectionEmpty')}</AppText> : null}
            {list.map((p, i) => portionBlock(p, i + 1))}
          </View>
        );
      })}

      <Button testID="record.edit" variant="secondary" label={t('dailyRecord.edit')} onPress={onEdit} />
    </AppScreen>
  );
}
