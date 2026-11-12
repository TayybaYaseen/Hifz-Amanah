// F05 · Add attempt (UI spec §5; US-023; F05-AC15, FR-ATT-005). A new recitation of one portion: the next attempt
// number, nothing copied from the previous attempt, earlier attempts never changed. Saved with its operation in one
// transaction; the record screen then shows "Saved on this device" until the server acknowledges it.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@hifz/contracts';
import { nextAttemptNo, portionsAllowed } from '@hifz/domain/hifz';
import { StatusChip } from '../../components/StatusChip.tsx';
import { AppScreen, AppText, Button, Card, Notice, isolate } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors } from '../../theme/tokens.ts';
import { readStudentMark } from '../attendance/local.ts';
import { useQuranReference } from '../quran/QuranReferenceContext.tsx';
import { attemptWrite, emptyPerformance, issueSlot, portionFromSaved, portionIssues, type FormIssue, type PortionForm } from './form.ts';
import { addAttempt, readRecord, type LocalPortion, type LocalRecord } from './local.ts';
import { PerformanceBlock, portionTitle, useAmount, type SlotErrors } from './PortionCard.tsx';

const ATTEMPT_FIELDS = new Set(['status', 'completed', 'completedAmount', 'quality', 'mistakes', 'mistake', 'remarks']);

export function AddAttemptScreen({ me, recordId, portionId, onSaved }: { me: MeResponse; recordId: string; portionId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const sync = useSync();
  const { index } = useQuranReference();
  const amount = useAmount();
  const [record, setRecord] = useState<LocalRecord | null>(null);
  const [portion, setPortion] = useState<LocalPortion | null>(null);
  const [form, setForm] = useState<PortionForm | null>(null);
  const [allowed, setAllowed] = useState<ReturnType<typeof portionsAllowed> | null>(null);
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!sync.db) return;
    const db = sync.db;
    void (async () => {
      const r = await readRecord(db, recordId);
      const p = r?.portions.find((x) => x.id === portionId && !x.removed) ?? null;
      if (!r || !p) {
        setMissing(true);
        return;
      }
      setRecord(r);
      setPortion(p);
      // Nothing is copied from the previous attempt (UI spec §5).
      setForm({ ...portionFromSaved(p), perf: emptyPerformance() });
      const mark = await readStudentMark(db, r.studentId, r.reportDate);
      setAllowed(portionsAllowed(mark?.status ?? null));
    })();
  }, [portionId, recordId, sync.db]);

  if (missing) {
    return (
      <AppScreen title={t('dailyAttempt.title')} testID="attempt.screen">
        <Notice tone="error" testID="attempt.notFound">{t('dailyRecord.notOnDevice')}</Notice>
      </AppScreen>
    );
  }
  if (!record || !portion || !form) {
    return (
      <AppScreen title={t('dailyAttempt.title')} testID="attempt.screen">
        <AppText color={colors.textSecondary}>{t('common.loading')}</AppText>
      </AppScreen>
    );
  }

  const number = record.portions.filter((p) => p.section === portion.section && !p.removed).findIndex((p) => p.id === portion.id) + 1;
  const title = portionTitle(t, portion.section, number);
  const errors: SlotErrors = {};
  for (const i of issues) {
    errors[issueSlot(i)] ??= t('daily.portionError', { portion: title, message: t(`daily.fieldError.${i.messageKey}`, Object.fromEntries(Object.entries(i.params ?? {}).map(([k, v]) => [k, isolate(String(v))]))) });
  }

  async function save() {
    if (!sync.outbox || !form || !portion || !record) return;
    // Only the attempt's own fields are checked here; the portion was validated when it was saved.
    const found = portionIssues(form, number, index).filter((i) => ATTEMPT_FIELDS.has(i.field));
    setIssues(found);
    if (found.length) return;
    setBusy(true);
    setError(null);
    try {
      await addAttempt(sync.outbox, { portionId: portion.id, reportDate: record.reportDate, studentName: record.studentName ?? '', actor: { userId: me.id, name: me.displayName }, attempt: attemptWrite(form, index), now: new Date().toISOString() });
      onSaved();
    } catch {
      setError(t('daily.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title={t('dailyAttempt.title')} testID="attempt.screen">
      <Card>
        <AppText role="cardTitle" testID="attempt.title">{t('dailyAttempt.for', { portion: title, number: isolate(String(nextAttemptNo(portion.attempts))) })}</AppText>
        {form.perf.status ? <StatusChip status={form.perf.status} testID={`attempt.statusChip.${form.perf.status}`} /> : null}
        {portion.assigned ? <AppText testID="attempt.assigned">{t('dailyAttempt.assigned', { amount: amount(portion.assigned) })}</AppText> : null}
        {portion.section === 'SABAQ' && portion.range ? (
          <AppText role="helper" color={colors.textSecondary}>
            {t('dailyRecord.range', { surah: isolate(String(portion.range.surahStart)), range: isolate(`${portion.range.ayahStart}–${portion.range.ayahEnd}`) })}
          </AppText>
        ) : null}
        {portion.paraNumber !== null ? <AppText role="helper" color={colors.textSecondary}>{t('quranRef.range.para', { para: isolate(String(portion.paraNumber)) })}</AppText> : null}
      </Card>
      <Notice tone="info">{t('dailyAttempt.earlierKept')}</Notice>
      {allowed && allowed !== 'ALLOWED' ? (
        <Notice tone="error" testID="attempt.blocked">{t('errors.ATTENDANCE_CHANGE_TO_LATE')}</Notice>
      ) : (
        <>
          <Card>
            <PerformanceBlock
              form={form}
              onChange={(next) => {
                setForm(next);
                setIssues([]);
              }}
              prefix="attempt"
              index={index}
              errors={errors}
            />
          </Card>
          {error ? <Notice tone="error" testID="attempt.saveError">{error}</Notice> : null}
          <Button testID="attempt.save" label={t('dailyAttempt.save')} busy={busy} busyLabel={t('common.saving')} disabled={!sync.outbox || allowed === null} onPress={() => void save()} />
        </>
      )}
    </AppScreen>
  );
}
