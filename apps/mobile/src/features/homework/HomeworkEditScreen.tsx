// F08 · New homework, review of a draft, and revision (design.md §4.9 "Review screen" and "Confirmation", §5.11;
// US-033, US-036, US-037, US-038; F08-AC1, AC2, AC4, AC8…AC10, AC12, AC15, AC18, AC20).
// - Portions use the F05 portion fields (Sabaq lines over a single-Surah range with its Para derived; Sabqi/Manzil Para
//   with presets or Lines/Ayat/Pages). Each portion shows whether it was suggested, edited, or added (F08-AC8).
// - Save draft and Reject write the device first, in one transaction with their operation (F12-AC1).
// - Confirm shows a summary and needs an explicit accept; offline it queues CONFIRM_HOMEWORK and the list shows
//   "Confirmed on device — waiting to sync" (F08-AC20). All-or-nothing: one portion without an amount confirms nothing.
// - Revise (Owner/Admin, online only) creates a new confirmed assignment through the server; the old one is kept and
//   marked Superseded (F08-AC15). Confirmed homework is never edited here.
// Every rule is the domain's (confirmIssues, dueDateIssue, originAfterEdit, validatePortionFields).
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { HOMEWORK_INSTRUCTIONS_MAX, type HomeworkAssignmentView, type MeResponse, type ReviseHomeworkRequest } from '@hifz/contracts';
import { HOMEWORK_PORTIONS_MAX, confirmIssues, dueDateIssue } from '@hifz/domain/homework';
import type { RangeReference } from '@hifz/domain/hifz';
import { addDays, calendarDateIn, isCalendarDate } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { ConfirmSheet, SyncBanner } from '../../components/sync.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice, isolate } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { SECTION_LIST, issueSlot, sectionSlug, type FormIssue } from '../daily-entry/form.ts';
import type { Section } from '../daily-entry/local.ts';
import { RevisionFields, SabaqFields, portionTitle, type SlotErrors } from '../daily-entry/PortionCard.tsx';
import { useQuranReference } from '../quran/QuranReferenceContext.tsx';
import { reviseHomework } from './api.ts';
import { formFromHomework, homeworkIssues, newEditorEntry, toHomeworkPortion, type EditorPortion } from './form.ts';
import { confirmDraft, defaultDueOnDevice, readAssignment, rejectDraft, saveDraftEdits, saveNewAssignment, storeViews, type LocalAssignment, type LocalHomeworkPortion } from './local.ts';
import { usePortionText } from './PortionLine.tsx';

export type HomeworkEditParams =
  | { mode: 'new'; studentId: string; classId: string; studentName: string }
  | { mode: 'edit'; assignmentId: string }
  | { mode: 'revise'; assignmentId: string };

interface Entry extends EditorPortion {
  key: string;
}

export function HomeworkEditScreen({ me, params, onDone, onSyncQueue }: { me: MeResponse; params: HomeworkEditParams; onDone: () => void; onSyncQueue: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const { index } = useQuranReference();
  const portionText = usePortionText();
  const timeZone = sync.meta?.orgTimeZone ?? 'Asia/Karachi';
  const revise = params.mode === 'revise';
  const titleKey = params.mode === 'new' ? 'homework.newTitle' : revise ? 'homework.reviseTitle' : 'homework.editTitle';

  const [assignment, setAssignment] = useState<LocalAssignment | null>(null);
  const [loading, setLoading] = useState(params.mode !== 'new');
  const [denied, setDenied] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [removed, setRemoved] = useState<LocalHomeworkPortion[]>([]);
  const [instructions, setInstructions] = useState('');
  const [due, setDue] = useState('');
  const [assignedDate, setAssignedDate] = useState(() => calendarDateIn(new Date(), timeZone));
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [contextError, setContextError] = useState<{ due?: string; instructions?: string; portions?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const keySeq = useRef(0);
  const nextKey = () => `hw-${(keySeq.current += 1)}`;

  const studentId = params.mode === 'new' ? params.studentId : assignment?.studentId;
  const classId = params.mode === 'new' ? params.classId : assignment?.classId;
  const studentName = params.mode === 'new' ? params.studentName : (assignment?.studentName ?? '');

  // Load the draft (or the confirmed assignment being revised) from the device, or the server when it is not here.
  useEffect(() => {
    if (!sync.db) return;
    const db = sync.db;
    let live = true;
    void (async () => {
      if (params.mode === 'new') {
        const d = await defaultDueOnDevice(db, params.classId, assignedDate);
        if (live && d) setDue((v) => v || d);
        return;
      }
      let a = await readAssignment(db, params.assignmentId);
      if (!a) {
        try {
          const view = await session.authorized<HomeworkAssignmentView>(`/homework/assignments/${params.assignmentId}`);
          await storeViews(db, [view]);
          a = await readAssignment(db, params.assignmentId);
        } catch (err) {
          if (live) setDenied(t(err instanceof ApiFailure && err.code === 'NETWORK' ? 'homework.notOnDevice' : (errorKeys(err).form ?? 'errors.INTERNAL')));
        }
      }
      if (!live) return;
      setLoading(false);
      if (!a) return;
      if ((revise && a.status !== 'CONFIRMED') || (!revise && a.status !== 'DRAFT')) {
        setDenied(t('homework.notEditable'));
        return;
      }
      setAssignment(a);
      setAssignedDate(a.assignedDate);
      setDue(a.dueDate ?? '');
      setInstructions(a.instructions ?? '');
      setEntries(a.portions.filter((p) => !p.removed).map((p) => ({ key: p.id, form: formFromHomework(p, p.id, p.id), base: p })));
      setRemoved(a.portions.filter((p) => p.removed));
    })();
    return () => {
      live = false;
    };
    // Loaded once per screen.
  }, [sync.db]);

  const numbered = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of SECTION_LIST) entries.filter((e) => e.form.section === s).forEach((e, i) => out.set(e.key, i + 1));
    return out;
  }, [entries]);

  const ref: RangeReference | null = index && index.surahs.length ? { surahs: index.surahs, paras: index.paras, metadataWithdrawn: index.metadataWithdrawn } : null;

  /** The stored portions for the current form (active in section order, then the ones removed). */
  const build = (): LocalHomeworkPortion[] => {
    const ordered = SECTION_LIST.flatMap((s) => entries.filter((e) => e.form.section === s));
    const active = ordered.map((e) => toHomeworkPortion(e, numbered.get(e.key) ?? 1, index, () => sync.outbox!.newEntityId()));
    return [...active, ...removed.map((p) => ({ ...p, removed: true }))];
  };

  /** Checks the form; returns the portions, or null with every problem shown and every value kept. */
  const check = (forConfirm: boolean): LocalHomeworkPortion[] | null => {
    const portionIssues: FormIssue[] = [];
    const portions = build();
    const active = portions.filter((p) => !p.removed);
    entries.forEach((e) => {
      const n = numbered.get(e.key) ?? 1;
      const built = active.find((p) => p.id === (e.base?.id ?? '')) ?? null;
      // An untouched suggestion keeps the server's values; only the Teacher's own values are checked here.
      if (built && built.origin === 'SUGGESTED') return;
      portionIssues.push(...homeworkIssues(e.form, n, index));
    });
    const ctx: typeof contextError = {};
    if (active.length === 0) ctx.portions = t('homework.needsPortion');
    if (active.length > HOMEWORK_PORTIONS_MAX) ctx.portions = t('homework.tooMany', { max: HOMEWORK_PORTIONS_MAX });
    const dueText = due.trim();
    if (dueText !== '' || revise) {
      if (!isCalendarDate(dueText)) ctx.due = t('homework.dueError.INVALID');
      else if (dueDateIssue(assignedDate, dueText)) ctx.due = t('homework.dueError.DUE_BEFORE_ASSIGNED', { date: isolate(assignedDate) });
    }
    if (instructions.trim().length > HOMEWORK_INSTRUCTIONS_MAX) ctx.instructions = t('fields.TOO_LONG');
    if ((forConfirm || revise) && portionIssues.length === 0) {
      // F08-AC12: all-or-nothing — a portion without an amount ("Review units") confirms nothing.
      for (const issue of confirmIssues(active, ref)) {
        if (issue.portionId === null) continue;
        const e = entries.find((x) => (x.base?.id ?? '') === issue.portionId) ?? entries[active.findIndex((p) => p.id === issue.portionId)];
        if (!e) continue;
        portionIssues.push({ portionKey: e.key, section: e.form.section, portionNumber: numbered.get(e.key) ?? 1, field: e.form.section === 'SABAQ' ? 'assigned' : 'unit', messageKey: 'amount.REQUIRED' });
      }
    }
    setIssues(portionIssues);
    setContextError(ctx);
    return portionIssues.length || Object.keys(ctx).length ? null : portions;
  };

  const errorsFor = (e: Entry): SlotErrors => {
    const out: SlotErrors = {};
    const portion = portionTitle(t, e.form.section, numbered.get(e.key) ?? 1);
    for (const i of issues.filter((x) => x.portionKey === e.key)) {
      out[issueSlot(i)] ??= t('daily.portionError', { portion, message: t(`daily.fieldError.${i.messageKey}`, Object.fromEntries(Object.entries(i.params ?? {}).map(([k, v]) => [k, isolate(String(v))]))) });
    }
    return out;
  };

  const instructionsValue = () => (instructions.trim() === '' ? null : instructions.trim());

  async function saveDraft(): Promise<string | null> {
    if (!sync.outbox || !studentId || !classId) return null;
    const portions = check(false);
    if (!portions) return null;
    if (params.mode === 'new') {
      return saveNewAssignment(sync.outbox, {
        studentId,
        classId,
        studentName,
        sourceDailyRecordId: null,
        assignedDate,
        dueDate: due.trim() === '' ? null : due.trim(),
        instructions: instructionsValue(),
        portions,
        actor: { userId: me.id, name: me.displayName },
      });
    }
    if (!assignment) return null;
    await saveDraftEdits(sync.outbox, assignment.id, { ...(due.trim() !== '' ? { dueDate: due.trim() } : {}), instructions: instructionsValue(), portions });
    return assignment.id;
  }

  async function onSave() {
    setSaveError(null);
    setBusy(true);
    try {
      if (await saveDraft()) onDone();
    } catch {
      setSaveError(t('homework.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function onConfirmPress() {
    setSaveError(null);
    if (check(true)) setConfirming(true);
  }

  async function onConfirmAccept() {
    setConfirming(false);
    if (!sync.outbox) return;
    setBusy(true);
    try {
      const confirmedAt = new Date().toISOString();
      if (params.mode === 'new') {
        const id = await saveDraft();
        if (!id) return;
        await confirmDraft(sync.outbox, id, { confirmedAt });
      } else if (assignment) {
        const portions = check(true);
        if (!portions) return;
        await confirmDraft(sync.outbox, assignment.id, { confirmedAt, edits: { ...(due.trim() !== '' ? { dueDate: due.trim() } : {}), instructions: instructionsValue(), portions } });
      }
      onDone();
    } catch {
      setSaveError(t('homework.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    setRejecting(false);
    if (!sync.outbox || !assignment) return;
    try {
      await rejectDraft(sync.outbox, assignment.id);
      onDone();
    } catch {
      setSaveError(t('homework.saveFailed'));
    }
  }

  async function onRevise() {
    setSaveError(null);
    if (!assignment || !sync.db || !sync.outbox) return;
    const portions = check(true);
    if (!portions) return;
    const active = portions.filter((p) => !p.removed);
    const body: ReviseHomeworkRequest = {
      id: sync.outbox.newEntityId(),
      dueDate: due.trim(),
      instructions: instructionsValue(),
      portions: active.map((p) => ({
        id: sync.outbox!.newEntityId(),
        section: p.section,
        position: p.position,
        paraNumber: p.section === 'SABAQ' ? null : p.paraNumber,
        range: p.range,
        totalLines: p.section === 'SABAQ' ? p.totalLines : null,
        assigned: p.assigned,
        instructions: p.instructions,
        // The revised portion replaces the old one and keeps its source (FR-HW-014); an added one is new.
        revisesPortionId: assignment.portions.some((o) => o.id === p.id) ? p.id : null,
      })),
    };
    setBusy(true);
    try {
      await reviseHomework(session, sync.db, assignment.id, body);
      onDone();
    } catch (err) {
      setSaveError(t(err instanceof ApiFailure && err.code === 'NETWORK' ? 'homework.reviseOnline' : (errorKeys(err).form ?? 'errors.INTERNAL')));
    } finally {
      setBusy(false);
    }
  }

  const add = (section: Section) => {
    // One key for the entry and its form: issues are tagged with the form's key and shown by the entry's (review M2).
    setEntries((list) => [...list, newEditorEntry(nextKey(), section)]);
  };
  const update = (key: string, form: Entry['form']) => {
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, form } : e)));
    setIssues((list) => list.filter((i) => i.portionKey !== key));
  };
  const remove = (e: Entry) => {
    setEntries((list) => list.filter((x) => x.key !== e.key));
    // A stored portion is kept as removed (no hard delete); revision simply leaves it out.
    if (e.base && !revise) setRemoved((list) => [...list, e.base!]);
  };

  if (denied) {
    return (
      <AppScreen title={t(titleKey)} testID="hwEdit.screen">
        <Notice tone="error" testID="hwEdit.denied">{denied}</Notice>
      </AppScreen>
    );
  }
  if (loading || !sync.outbox) {
    return (
      <AppScreen title={t(titleKey)} testID="hwEdit.screen">
        <AppText color={colors.textSecondary} testID="hwEdit.loading">{t('common.loading')}</AppText>
      </AppScreen>
    );
  }

  const activeCount = entries.length;
  const offlineRevise = revise && !sync.online;

  return (
    <AppScreen title={t(titleKey)} testID="hwEdit.screen">
      {sync.enabled ? <SyncBanner banner={sync.banner} onPress={onSyncQueue} loadError={sync.loadError} /> : null}
      {!revise ? (
        <AppText role="cardTitle" color={colors.warning} testID="hwEdit.draftLabel">{`◇ ${t('homework.draftLabel')}`}</AppText>
      ) : (
        <Notice tone="info" testID="hwEdit.reviseHelp">{t('homework.reviseHelp')}</Notice>
      )}
      {offlineRevise ? <Notice tone="info" testID="hwEdit.reviseOffline">{t('homework.reviseOnline')}</Notice> : null}
      <Card>
        <AppText role="cardTitle" testID="hwEdit.student">{isolate(studentName)}</AppText>
        <AppText testID="hwEdit.assigned">{t('homework.assignedOn', { date: isolate(assignedDate) })}</AppText>
      </Card>

      {/* Due date: defaults to the next class day (FR-HW-004); never before the assigned date. */}
      <View style={{ gap: space[1] }}>
        <Field
          testID="hwEdit.due"
          label={t('homework.dueDate')}
          helper={due.trim() === '' ? t('homework.dueHelpEmpty') : t('homework.dueHelp')}
          value={due}
          onChangeText={(text) => {
            setDue(text);
            setContextError((e) => ({ ...e, due: undefined }));
          }}
          maxLength={10}
          autoCapitalize="none"
          error={contextError.due}
        />
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Button testID="hwEdit.due.prev" variant="secondary" label={t('attendance.prevDay')} disabled={!isCalendarDate(due.trim())} onPress={() => setDue((d) => addDays(d.trim(), -1))} />
          <Button testID="hwEdit.due.next" variant="secondary" label={t('attendance.nextDay')} disabled={!isCalendarDate(due.trim())} onPress={() => setDue((d) => addDays(d.trim(), 1))} />
        </View>
      </View>

      {SECTION_LIST.map((section) => {
        const slug = sectionSlug(section);
        const list = entries.filter((e) => e.form.section === section);
        return (
          <View key={section} style={{ gap: space[3] }}>
            <AppText role="sectionTitle" testID={`hwEdit.${slug}.section`}>{t(`sections.${section}`)}</AppText>
            {list.map((e) => {
              const n = numbered.get(e.key) ?? 1;
              const prefix = `hwEdit.${slug}.portion.${n}`;
              const b = e.base;
              return (
                <Card key={e.key}>
                  <AppText role="cardTitle" testID={`${prefix}.title`}>{portionTitle(t, section, n)}</AppText>
                  <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.origin.${b ? b.origin : 'TEACHER_ADDED'}`}>{t(`homework.origin.${b ? b.origin : 'TEACHER_ADDED'}`)}</AppText>
                  {b?.sourceReportDate ? <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.source`}>{t('homework.source', { date: isolate(b.sourceReportDate) })}</AppText> : null}
                  {b?.why ? (
                    <AppText role="helper" color={colors.textSecondary} testID={`${prefix}.why`}>{`${t('homework.whyTitle')}: ${portionText({ ...b, assigned: b.why.assigned })} → ${t(`portionStatus.${b.why.status}`)}`}</AppText>
                  ) : null}
                  {b?.needsReview && b.assigned === null ? <AppText role="helper" color={colors.warning} testID={`${prefix}.reviewUnits`}>{`⚠ ${t('homework.reviewUnits')}`}</AppText> : null}
                  {section === 'SABAQ' ? (
                    <SabaqFields form={e.form} onChange={(f) => update(e.key, f)} prefix={prefix} index={index} errors={errorsFor(e)} />
                  ) : (
                    <RevisionFields form={e.form} onChange={(f) => update(e.key, f)} prefix={prefix} errors={errorsFor(e)} sabqiDefault={null} />
                  )}
                  <Button testID={`${prefix}.remove`} variant="tertiary" label={t('homework.removePortion')} onPress={() => remove(e)} />
                </Card>
              );
            })}
            <Button testID={`hwEdit.${slug}.add`} variant="secondary" label={t('homework.addPortion', { section: t(`sections.${section}`) })} onPress={() => add(section)} />
          </View>
        );
      })}

      <Field
        testID="hwEdit.instructions"
        label={`${t('homework.instructions')} (${t('common.optional')})`}
        helper={`🔒 ${t('daily.privateToStaff')}`}
        value={instructions}
        onChangeText={setInstructions}
        multiline
        autoCapitalize="sentences"
        maxLength={HOMEWORK_INSTRUCTIONS_MAX}
        error={contextError.instructions}
      />

      {contextError.portions ? <Notice tone="error" testID="hwEdit.needsPortion">{contextError.portions}</Notice> : null}
      {issues.length ? <Notice tone="error" testID="hwEdit.errorSummary">{t('daily.errorsSummary', { count: isolate(String(issues.length)) })}</Notice> : null}
      {saveError ? <Notice tone="error" testID="hwEdit.saveError">{saveError}</Notice> : null}

      {revise ? (
        <Button testID="hwEdit.revise.submit" label={t('homework.submitRevision')} busy={busy} busyLabel={t('common.saving')} disabled={offlineRevise || activeCount === 0} onPress={() => void onRevise()} />
      ) : (
        <>
          <Button testID="hwEdit.confirm" label={t('homework.confirm')} busy={busy} busyLabel={t('common.saving')} disabled={activeCount === 0} onPress={onConfirmPress} />
          <Button testID="hwEdit.save" variant="secondary" label={t('homework.saveDraft')} disabled={busy} onPress={() => void onSave()} />
          {assignment ? <Button testID="hwEdit.reject" variant="tertiary" label={t('homework.reject')} onPress={() => setRejecting(true)} /> : null}
        </>
      )}

      <ConfirmSheet visible={confirming} title={t('homework.confirmTitle')} onCancel={() => setConfirming(false)} testID="hwEdit.confirmSheet">
        <AppText testID="hwEdit.confirmSheet.summary">
          {t('homework.confirmBody', { count: activeCount, name: isolate(studentName), due: due.trim() === '' ? t('homework.dueNextClass') : isolate(due.trim()) })}
        </AppText>
        {SECTION_LIST.flatMap((s) => entries.filter((e) => e.form.section === s)).map((e, i) => {
          const v = toHomeworkPortion(e, numbered.get(e.key) ?? 1, index, () => 'preview');
          return <AppText key={e.key} role="helper" testID={`hwEdit.confirmSheet.portion.${i + 1}`}>{`• ${portionText(v)}`}</AppText>;
        })}
        {!sync.online ? <AppText role="helper" color={colors.info}>{t('homework.confirmOffline')}</AppText> : null}
        <Button testID="hwEdit.confirmSheet.accept" label={t('homework.confirm')} onPress={() => void onConfirmAccept()} />
        <Button testID="hwEdit.confirmSheet.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setConfirming(false)} />
      </ConfirmSheet>

      <ConfirmSheet visible={rejecting} title={t('homework.rejectTitle')} onCancel={() => setRejecting(false)} testID="hwEdit.reject.sheet">
        <AppText>{t('homework.rejectBody')}</AppText>
        <Button testID="hwEdit.reject.confirm" variant="destructive" label={t('homework.rejectConfirm')} onPress={() => void onReject()} />
        <Button testID="hwEdit.reject.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setRejecting(false)} />
      </ConfirmSheet>
    </AppScreen>
  );
}
