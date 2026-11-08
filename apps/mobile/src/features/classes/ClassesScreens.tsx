// Classes (US-010; design.md §3.2 More → Classes, a design gap built from cards and FormField). Online only.
// Owner/Admin add, edit, deactivate, and reactivate classes and assign Teachers; a Teacher sees their assigned
// classes read-only (F03-AC3). The server decides every permission; `canManage` only hides refused controls.
import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { ClassListResponse, ClassResponse, StudentListResponse, TeacherOptionsResponse } from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { colors } from '../../theme/tokens.ts';
import { Chip, ChipRow, StatusLabel, rowStyle } from '../roster/Chip.tsx';
import { rosterFieldMessages, toggleId } from '../roster/roster.ts';

export function ClassesScreen({ canAdd, onAdd, onOpen }: { canAdd: boolean; onAdd: () => void; onOpen: (klass: ClassResponse) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [items, setItems] = useState<ClassResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems((await session.authorized<ClassListResponse>('/classes?status=ALL')).items);
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [session, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <AppScreen title={t('classes.title')} testID="classes.screen">
      {error ? (
        <>
          <Notice tone="error" testID="classes.error">{error}</Notice>
          <Button testID="classes.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
        </>
      ) : null}
      {items === null && !error ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {items !== null && items.length === 0 ? (
        // F03-AC5: "No classes yet" with an "Add class" action.
        <Card>
          <AppText role="cardTitle" testID="classes.empty">{t('classes.empty')}</AppText>
          {canAdd ? <AppText color={colors.textSecondary}>{t('classes.emptyHelp')}</AppText> : null}
        </Card>
      ) : null}
      {canAdd ? <Button testID="classes.add" label={t('classes.add')} onPress={onAdd} /> : null}
      {items?.map((klass) => (
        <Pressable key={klass.id} testID={`classes.item.${klass.name}`} accessibilityRole="button" onPress={() => onOpen(klass)} style={rowStyle.card}>
          <AppText role="cardTitle">{klass.name}</AppText>
          <StatusLabel active={klass.status === 'ACTIVE'} activeText={t('roster.active')} inactiveText={t('roster.inactive')} testID={`classes.item.${klass.name}.status`} />
          <AppText role="helper" color={colors.textSecondary}>
            {klass.teachers.length ? klass.teachers.map((x) => x.displayName).join(t('common.listSeparator')) : t('classes.noTeachers')}
          </AppText>
          <AppText role="helper" color={colors.textSecondary}>
            {t('classes.studentCount', { count: klass.activeStudentCount })}
          </AppText>
        </Pressable>
      ))}
    </AppScreen>
  );
}

/** Add or edit a class: name (required) and the assigned Teachers (F03-AC1, AC2, AC14). */
export function ClassFormScreen({ klass, onSaved }: { klass: ClassResponse | null; onSaved: (saved: ClassResponse) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [name, setName] = useState(klass?.name ?? '');
  const [teacherIds, setTeacherIds] = useState<string[]>(klass?.teachers.map((x) => x.userId) ?? []);
  const [options, setOptions] = useState<TeacherOptionsResponse['items'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      session
        .authorized<TeacherOptionsResponse>('/roster/teachers')
        .then((r) => setOptions(r.items))
        .catch((err) => setFormError(t(errorKeys(err).form ?? 'errors.INTERNAL')));
    }, [session, t]),
  );

  const save = async () => {
    setFields({});
    setFormError(null);
    // Checked here too so the error shows at once; the server checks it regardless (F03-AC2).
    if (!name.trim()) {
      setFields({ name: t('fields.REQUIRED') });
      return;
    }
    setBusy(true);
    try {
      const saved = klass
        ? await session.authorized<ClassResponse>(`/classes/${klass.id}`, { method: 'PATCH', body: { name, teacherIds } })
        : await session.authorized<ClassResponse>('/classes', { body: { name, teacherIds } });
      onSaved(saved);
    } catch (err) {
      const keys = errorKeys(err);
      if (keys.form) setFormError(t(keys.form));
      else setFields(Object.fromEntries(Object.entries(rosterFieldMessages(keys.fields)).map(([f, k]) => [f, t(k)])));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={klass ? t('classes.editTitle') : t('classes.addTitle')} testID="classForm.screen">
      {formError ? <Notice tone="error" testID="classForm.error">{formError}</Notice> : null}
      <Field testID="classForm.name" label={t('classes.name')} helper={t('common.required')} value={name} onChangeText={setName} error={fields.name} maxLength={100} autoCapitalize="words" />
      <AppText role="cardTitle">{t('classes.teachers')}</AppText>
      {options === null ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {options?.length === 0 ? <AppText color={colors.textSecondary}>{t('classes.noTeacherAccounts')}</AppText> : null}
      <ChipRow label={t('classes.teachers')}>
        {options?.map((o) => (
          <Chip key={o.userId} role="checkbox" testID={`classForm.teacher.${o.displayName}`} label={o.displayName} selected={teacherIds.includes(o.userId)} onPress={() => setTeacherIds((ids) => toggleId(ids, o.userId))} />
        ))}
      </ChipRow>
      {fields.teacherIds ? <AppText role="helper" color={colors.danger}>{`⚠ ${fields.teacherIds}`}</AppText> : null}
      <Button testID="classForm.save" label={t('common.save')} busyLabel={t('common.saving')} busy={busy} onPress={() => void save()} />
    </AppScreen>
  );
}

/** One class: details, its students, and Owner/Admin actions. Deactivation lists the active students first (F03 edge cases). */
export function ClassDetailScreen({ klass: initial, onEdit, onStudents }: { klass: ClassResponse; onEdit: (klass: ClassResponse) => void; onStudents: (klass: ClassResponse) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [klass, setKlass] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ students: string[]; more: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      session
        .authorized<ClassResponse>(`/classes/${initial.id}`)
        .then(setKlass)
        .catch(() => undefined);
    }, [session, initial.id]),
  );

  const act = async (path: string, done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      setKlass(await session.authorized<ClassResponse>(path, { body: {} }));
      setStatus({ tone: 'success', text: done });
    } catch (err) {
      const keys = errorKeys(err);
      setStatus({ tone: 'error', text: keys.fields.name === 'fields.TAKEN' ? t('classes.nameTaken') : t(keys.form ?? 'errors.INTERNAL') });
    } finally {
      setBusy(false);
    }
  };

  const askDeactivate = async () => {
    setBusy(true);
    try {
      const page = await session.authorized<StudentListResponse>(`/students?classId=${klass.id}&status=ACTIVE&limit=25`);
      setConfirm({ students: page.items.map((s) => s.name), more: page.nextCursor !== null });
    } catch (err) {
      setStatus({ tone: 'error', text: t(errorKeys(err).form ?? 'errors.INTERNAL') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={klass.name} testID="classDetail.screen">
      {status ? <Notice tone={status.tone} testID={`classDetail.status.${status.tone}`}>{status.text}</Notice> : null}
      <Card>
        <StatusLabel active={klass.status === 'ACTIVE'} activeText={t('roster.active')} inactiveText={t('roster.inactive')} testID="classDetail.statusLabel" />
        <AppText>{klass.teachers.length ? klass.teachers.map((x) => x.displayName).join(t('common.listSeparator')) : t('classes.noTeachers')}</AppText>
        <AppText color={colors.textSecondary}>{t('classes.studentCount', { count: klass.activeStudentCount })}</AppText>
      </Card>
      <Button testID="classDetail.students" variant="secondary" label={t('classes.viewStudents')} onPress={() => onStudents(klass)} />
      {confirm ? (
        <Card>
          <AppText testID="classDetail.confirmMessage">
            {confirm.students.length ? t('classes.deactivateWarning', { count: confirm.students.length }) : t('classes.deactivateConfirm')}
          </AppText>
          {confirm.students.map((n, i) => (
            <AppText key={`${n}-${i}`} role="helper">{`• ${n}`}</AppText>
          ))}
          {confirm.more ? <AppText role="helper" color={colors.textSecondary}>{t('classes.andMore')}</AppText> : null}
          <Button
            testID="classDetail.confirm"
            variant="destructive"
            label={t('classes.deactivate')}
            onPress={() => {
              setConfirm(null);
              void act(`/classes/${klass.id}/deactivate`, t('classes.deactivated'));
            }}
          />
          <Button testID="classDetail.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setConfirm(null)} />
        </Card>
      ) : null}
      {klass.canManage ? (
        <>
          <Button testID="classDetail.edit" variant="secondary" label={t('classes.edit')} disabled={busy} onPress={() => onEdit(klass)} />
          {klass.status === 'ACTIVE' ? (
            <Button testID="classDetail.deactivate" variant="destructive" label={t('classes.deactivate')} disabled={busy} onPress={() => void askDeactivate()} />
          ) : (
            <Button testID="classDetail.reactivate" variant="secondary" label={t('classes.reactivate')} disabled={busy} onPress={() => void act(`/classes/${klass.id}/reactivate`, t('classes.reactivated'))} />
          )}
        </>
      ) : null}
    </AppScreen>
  );
}
