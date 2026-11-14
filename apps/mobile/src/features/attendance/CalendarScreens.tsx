// F04 online screens (design.md §4.14). Every permission is decided by the server; `canManage` only hides refused
// controls.
// - Leave approvals (US-017; FR-CAL-008): Owner/Admin approve or reject a Teacher-marked Leave, with confirmation;
//   each decision is audited by the server (F04-AC15, AC16). Teachers never see approve/reject (AC17).
// - Holidays and closures (US-014; FR-CAL-002, FR-CAL-009): madrasa-wide holidays/closures and per-class no-class
//   days. Declaring one on a date that already has records warns with the count and needs confirmation (F04-AC20).
// - Timetable (US-013; FR-CAL-001): the weekdays a class meets, effective from a date (F04-AC1, AC2).
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  CalendarExceptionView,
  ClassListResponse,
  ClassResponse,
  ClassScheduleResponse,
  ExceptionKind,
  ExceptionListResponse,
  LeaveItem,
  LeaveListResponse,
} from '@hifz/contracts';
import { WEEKDAYS, normalizeWeekdays, type Weekday } from '@hifz/domain/calendar';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { isolate } from '../../i18n/direction.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';

const WEEKDAY_KEY: Record<Weekday, string> = {
  1: 'weekDays.MONDAY',
  2: 'weekDays.TUESDAY',
  3: 'weekDays.WEDNESDAY',
  4: 'weekDays.THURSDAY',
  5: 'weekDays.FRIDAY',
  6: 'weekDays.SATURDAY',
  7: 'weekDays.SUNDAY',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function useToday(): string {
  const sync = useSync();
  return calendarDateIn(new Date(), sync.meta?.orgTimeZone ?? 'Asia/Karachi');
}

// ---------- Leave approvals ----------

type LeaveFilter = 'REQUESTED' | 'APPROVED' | 'REJECTED';

export function LeaveApprovalsScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [filter, setFilter] = useState<LeaveFilter>('REQUESTED');
  const [items, setItems] = useState<LeaveItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ item: LeaveItem; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      setItems((await session.authorized<LeaveListResponse>(`/attendance/leave?status=${filter}`)).items);
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [filter, session, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide() {
    if (!confirming) return;
    setBusy(true);
    setError(null);
    try {
      await session.authorized(`/attendance/${confirming.item.record.id}/leave-decision`, {
        method: 'POST',
        body: { decision: confirming.decision, rowVersion: confirming.item.record.rowVersion },
      });
      setDone(t(confirming.decision === 'APPROVE' ? 'leave.approved' : 'leave.rejected', { name: confirming.item.studentName }));
      setConfirming(null);
      await load();
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title={t('leave.title')} testID="leave.screen">
      <ChipRow label={t('leave.filter')}>
        {(['REQUESTED', 'APPROVED', 'REJECTED'] as const).map((f) => (
          <Chip key={f} testID={`leave.filter.${f}`} label={t(`leave.filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ChipRow>
      {done ? <Notice tone="success" testID="leave.done">{done}</Notice> : null}
      {error ? (
        <>
          <Notice tone="error" testID="leave.error">{error}</Notice>
          <Button testID="leave.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
        </>
      ) : null}
      {items === null && !error ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {items?.length === 0 ? <AppText testID="leave.empty">{t(filter === 'REQUESTED' ? 'leave.empty' : 'leave.emptyDecided')}</AppText> : null}
      {items?.map((item) => {
        const name = item.studentName;
        const isConfirming = confirming?.item.record.id === item.record.id;
        return (
          <Card key={item.record.id}>
            <AppText role="cardTitle">{isolate(name)}</AppText>
            <AppText role="helper" color={colors.textSecondary}>
              {t('leave.meta', { className: isolate(item.className), date: isolate(item.record.reportDate) })}
            </AppText>
            {item.requestedBy ? <AppText role="helper" color={colors.textSecondary}>{t('leave.requestedBy', { name: isolate(item.requestedBy.displayName) })}</AppText> : null}
            <AppText testID={`leave.item.${name}.reason`}>{t('leave.reason', { reason: item.record.leaveReason ?? '' })}</AppText>
            {item.decidedBy ? (
              <AppText role="helper" color={colors.textSecondary}>{t('leave.decidedBy', { name: isolate(item.decidedBy.displayName) })}</AppText>
            ) : null}
            {filter === 'REQUESTED' && !isConfirming ? (
              <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                <Button testID={`leave.item.${name}.approve`} label={t('leave.approve')} onPress={() => { setDone(null); setConfirming({ item, decision: 'APPROVE' }); }} />
                <Button testID={`leave.item.${name}.reject`} variant="secondary" label={t('leave.reject')} onPress={() => { setDone(null); setConfirming({ item, decision: 'REJECT' }); }} />
              </View>
            ) : null}
            {isConfirming ? (
              <>
                <Notice tone="info">{t(confirming.decision === 'APPROVE' ? 'leave.confirmApprove' : 'leave.confirmReject', { name })}</Notice>
                <Button
                  testID={`leave.item.${name}.confirm`}
                  variant={confirming.decision === 'APPROVE' ? 'primary' : 'destructive'}
                  label={t(confirming.decision === 'APPROVE' ? 'leave.approve' : 'leave.reject')}
                  busy={busy}
                  busyLabel={t('common.saving')}
                  onPress={() => void decide()}
                />
                <Button testID={`leave.item.${name}.cancel`} variant="secondary" label={t('common.cancel')} onPress={() => setConfirming(null)} />
              </>
            ) : null}
          </Card>
        );
      })}
    </AppScreen>
  );
}

// ---------- Holidays, closures, no-class days ----------

export function HolidaysScreen({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const today = useToday();
  const [items, setItems] = useState<CalendarExceptionView[] | null>(null);
  const [classes, setClasses] = useState<ClassResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<ExceptionKind>('HOLIDAY');
  const [classId, setClassId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [recordsWarning, setRecordsWarning] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // From 30 days ago to 6 months ahead.
      const res = await session.authorized<ExceptionListResponse>(`/calendar/exceptions?from=${addDays(today, -30)}&to=${addDays(today, 183)}`);
      setItems(res.items);
      if (canManage) setClasses((await session.authorized<ClassListResponse>('/classes')).items.filter((c) => c.status === 'ACTIVE'));
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [canManage, session, t, today]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setAdding(false);
    setDate(today);
    setKind('HOLIDAY');
    setClassId(null);
    setLabel('');
    setFields({});
    setRecordsWarning(null);
  }

  async function save(confirm: boolean) {
    const problems: Record<string, string> = {};
    if (!DATE.test(date)) problems.date = t('fields.INVALID');
    if (!label.trim()) problems.label = t('fields.REQUIRED');
    if (kind === 'NO_CLASS' && !classId) problems.classId = t('holidays.pickClass');
    setFields(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setError(null);
    try {
      await session.authorized('/calendar/exceptions', {
        method: 'POST',
        body: { date, kind, label: label.trim(), classId: kind === 'NO_CLASS' ? classId : null, confirm },
      });
      setNotice(t('holidays.added'));
      resetForm();
      await load();
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'RECORDS_EXIST') {
        // F04-AC20: warn with the number of records; the Admin must confirm.
        setRecordsWarning(Number(err.fields.records ?? 0));
      } else {
        const keys = errorKeys(err);
        setFields(Object.fromEntries(Object.entries(keys.fields).map(([f, k]) => [f, t(k)])));
        if (keys.form) setError(t(keys.form));
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    try {
      await session.authorized(`/calendar/exceptions/${id}/cancel`, { method: 'POST' });
      setNotice(t('holidays.cancelled'));
      setCancelling(null);
      await load();
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title={t('holidays.title')} testID="holidays.screen">
      <AppText color={colors.textSecondary}>{t('holidays.help')}</AppText>
      {notice ? <Notice tone="success" testID="holidays.notice">{notice}</Notice> : null}
      {error ? (
        <>
          <Notice tone="error" testID="holidays.error">{error}</Notice>
          <Button testID="holidays.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
        </>
      ) : null}
      {canManage && !adding ? <Button testID="holidays.add" label={t('holidays.add')} onPress={() => { setNotice(null); setAdding(true); }} /> : null}
      {adding ? (
        <Card>
          <ChipRow label={t('holidays.kind')}>
            {(['HOLIDAY', 'CLOSURE', 'NO_CLASS'] as const).map((k) => (
              <Chip key={k} testID={`holidays.kind.${k}`} label={t(`holidays.kinds.${k}`)} selected={kind === k} onPress={() => { setKind(k); setRecordsWarning(null); }} />
            ))}
          </ChipRow>
          <AppText role="helper" color={colors.textSecondary}>{t(kind === 'NO_CLASS' ? 'holidays.noClassHelp' : 'holidays.madrasaHelp')}</AppText>
          {kind === 'NO_CLASS' ? (
            <>
              <ChipRow label={t('attendance.class')}>
                {classes.map((c) => (
                  <Chip key={c.id} testID={`holidays.class.${c.name}`} label={c.name} selected={classId === c.id} onPress={() => { setClassId(c.id); setRecordsWarning(null); }} />
                ))}
              </ChipRow>
              {fields.classId ? <AppText role="helper" color={colors.danger}>{`⚠ ${fields.classId}`}</AppText> : null}
            </>
          ) : null}
          <Field testID="holidays.date" label={t('holidays.date')} helper={t('holidays.dateHelp')} value={date} error={fields.date} onChangeText={(v) => { setDate(v); setRecordsWarning(null); }} />
          <Field testID="holidays.label" label={t('holidays.label')} value={label} error={fields.label} onChangeText={setLabel} />
          {recordsWarning !== null ? (
            <>
              <Notice tone="error" testID="holidays.recordsWarning">{t('holidays.recordsWarning', { count: recordsWarning })}</Notice>
              <Button testID="holidays.confirm" variant="destructive" label={t('holidays.declareAnyway')} busy={busy} busyLabel={t('common.saving')} onPress={() => void save(true)} />
            </>
          ) : (
            <Button testID="holidays.save" label={t('common.save')} busy={busy} busyLabel={t('common.saving')} onPress={() => void save(false)} />
          )}
          <Button testID="holidays.cancelForm" variant="secondary" label={t('common.cancel')} onPress={resetForm} />
        </Card>
      ) : null}
      {items === null && !error ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {items?.length === 0 ? <AppText testID="holidays.empty">{t('holidays.empty')}</AppText> : null}
      {items?.map((item) => (
        <Card key={item.id}>
          <AppText role="cardTitle" testID={`holidays.item.${item.date}.${item.kind}`}>{`${isolate(item.date)} · ${t(`holidays.kinds.${item.kind}`)}`}</AppText>
          <AppText>{isolate(item.label)}</AppText>
          <AppText role="helper" color={colors.textSecondary}>
            {item.className ? t('holidays.forClass', { className: isolate(item.className) }) : t('holidays.wholeMadrasa')}
          </AppText>
          {canManage && cancelling !== item.id ? (
            <Button testID={`holidays.item.${item.date}.cancel`} variant="secondary" label={t('holidays.cancel')} onPress={() => setCancelling(item.id)} />
          ) : null}
          {cancelling === item.id ? (
            <>
              <Notice tone="info">{t('holidays.confirmCancel')}</Notice>
              <Button testID={`holidays.item.${item.date}.confirmCancel`} variant="destructive" label={t('holidays.cancel')} busy={busy} busyLabel={t('common.saving')} onPress={() => void cancel(item.id)} />
              <Button variant="secondary" label={t('common.back')} onPress={() => setCancelling(null)} />
            </>
          ) : null}
        </Card>
      ))}
    </AppScreen>
  );
}

// ---------- Timetable ----------

export function TimetableScreen({ klass, canManage }: { klass: ClassResponse; canManage: boolean }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const today = useToday();
  const [schedule, setSchedule] = useState<ClassScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [from, setFrom] = useState(today);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSchedule(await session.authorized<ClassScheduleResponse>(`/classes/${klass.id}/schedule`));
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [klass.id, session, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = (list: readonly number[]) => (list.length ? normalizeWeekdays(list).map((d) => t(WEEKDAY_KEY[d])).join(t('common.listSeparator')) : t('timetable.noDays'));

  async function save() {
    if (!DATE.test(from)) {
      setFields({ effectiveFrom: t('fields.INVALID') });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setSchedule(await session.authorized<ClassScheduleResponse>(`/classes/${klass.id}/schedule`, { method: 'PUT', body: { effectiveFrom: from, weekdays } }));
      setEditing(false);
      setNotice(t('timetable.saved', { date: isolate(from) }));
    } catch (err) {
      const keys = errorKeys(err);
      setFields(Object.fromEntries(Object.entries(keys.fields).map(([f, k]) => [f, t(k)])));
      if (keys.form) setError(t(keys.form));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title={t('timetable.title')} testID="timetable.screen">
      <AppText role="cardTitle">{isolate(klass.name)}</AppText>
      {notice ? <Notice tone="success" testID="timetable.notice">{notice}</Notice> : null}
      {error ? (
        <>
          <Notice tone="error" testID="timetable.error">{error}</Notice>
          <Button testID="timetable.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
        </>
      ) : null}
      {schedule === null && !error ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {schedule ? (
        <Card>
          <AppText role="helper" color={colors.textSecondary}>{t('timetable.current')}</AppText>
          <AppText testID="timetable.current">{schedule.current ? days(schedule.current.weekdays) : t('timetable.none')}</AppText>
          <AppText role="helper" color={colors.textSecondary}>{t('timetable.otherDays')}</AppText>
        </Card>
      ) : null}
      {schedule && schedule.versions.length > 1 ? (
        <Card>
          <AppText role="cardTitle">{t('timetable.history')}</AppText>
          {schedule.versions.map((v) => (
            <AppText key={v.effectiveFrom} role="helper">
              {t('timetable.version', { from: isolate(v.effectiveFrom), to: v.effectiveTo ? isolate(v.effectiveTo) : t('timetable.now'), days: days(v.weekdays) })}
            </AppText>
          ))}
        </Card>
      ) : null}
      {canManage && schedule && !editing ? (
        <Button
          testID="timetable.edit"
          label={t('timetable.edit')}
          onPress={() => {
            setNotice(null);
            setWeekdays(normalizeWeekdays(schedule.current?.weekdays ?? []));
            setFrom(today);
            setFields({});
            setEditing(true);
          }}
        />
      ) : null}
      {editing ? (
        <Card>
          <ChipRow label={t('timetable.days')}>
            {WEEKDAYS.map((d) => (
              <Chip
                key={d}
                role="checkbox"
                testID={`timetable.day.${d}`}
                label={t(WEEKDAY_KEY[d])}
                selected={weekdays.includes(d)}
                onPress={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : normalizeWeekdays([...w, d])))}
              />
            ))}
          </ChipRow>
          <Field testID="timetable.from" label={t('timetable.effectiveFrom')} helper={t('timetable.effectiveFromHelp')} value={from} error={fields.effectiveFrom} onChangeText={setFrom} />
          <Button testID="timetable.save" label={t('common.save')} busy={busy} busyLabel={t('common.saving')} onPress={() => void save()} />
          <Button testID="timetable.cancel" variant="secondary" label={t('common.cancel')} onPress={() => setEditing(false)} />
        </Card>
      ) : null}
    </AppScreen>
  );
}
