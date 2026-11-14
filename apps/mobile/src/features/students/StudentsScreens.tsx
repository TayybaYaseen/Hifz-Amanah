// Students (US-011, US-012; design.md §4.5 Student list, §4.6 Student profile, add/edit form). Online only.
// - Search, class and status filters, and 25-per-page loading all run on the server (F03-AC8, AC19).
// - Owner/Admin and a Teacher in assigned classes add and edit; only Owner/Admin deactivate, reactivate, and move
//   (DEC-B14). `canEdit`/`canManage` from the server only hide controls; the server refuses regardless.
// - The form asks only for what DEC-B56 allows: name and class required; roll number / External Student ID,
//   admission date, and private notes optional (F03-AC17).
// - Long and Urdu names wrap; the roll number tells same-name students apart (F03 edge cases).
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { ClassListResponse, ClassResponse, StudentListResponse, StudentResponse, StudentSummary } from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { colors } from '../../theme/tokens.ts';
import { Chip, ChipRow, StatusLabel, rowStyle } from '../roster/Chip.tsx';
import { StudentDailyRecords } from '../daily-entry/StudentDailyRecords.tsx';
import { NO_FILTERS, parseOptionalDate, rosterFieldMessages, studentListPath, studentsEmptyState, type StatusFilter, type StudentFilters } from '../roster/roster.ts';

const STATUS_FILTERS: StatusFilter[] = ['ACTIVE', 'INACTIVE', 'ALL'];

/** Classes in the caller's scope, for filters and pickers. */
function useClasses(status: 'ACTIVE' | 'ALL'): ClassResponse[] {
  const { session } = useSession();
  const [classes, setClasses] = useState<ClassResponse[]>([]);
  useFocusEffect(
    useCallback(() => {
      session
        .authorized<ClassListResponse>(`/classes?status=${status}`)
        .then((r) => setClasses(r.items))
        .catch(() => setClasses([]));
    }, [session, status]),
  );
  return classes;
}

export function StudentsScreen({ initialClassId, onAdd, onOpen }: { initialClassId: string | null; onAdd: () => void; onOpen: (student: StudentSummary) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const classes = useClasses('ALL');
  const [filters, setFilters] = useState<StudentFilters>({ ...NO_FILTERS, classId: initialClassId });
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<StudentSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (f: StudentFilters, after: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const page = await session.authorized<StudentListResponse>(studentListPath(f, after));
        setItems((prev) => (after ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (err) {
        setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
      } finally {
        setLoading(false);
      }
    },
    [session, t],
  );

  // Reload from the first page when the filters change or the list comes back into view (e.g. after an edit).
  useFocusEffect(
    useCallback(() => {
      void load(filters, null);
    }, [load, filters]),
  );

  // Search runs on the server, shortly after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const empty = !loading && !error ? studentsEmptyState(items.length, filters) : null;
  const clear = () => {
    setQuery('');
    setFilters(NO_FILTERS);
  };

  return (
    <AppScreen title={t('students.title')} testID="students.screen">
      <Button testID="students.add" label={t('students.add')} onPress={onAdd} />
      <Field testID="students.search" label={t('students.search')} value={query} onChangeText={setQuery} maxLength={100} />
      <ChipRow label={t('students.statusFilter')}>
        {STATUS_FILTERS.map((s) => (
          <Chip key={s} testID={`students.status.${s}`} label={t(`roster.filter.${s}`)} selected={filters.status === s} onPress={() => setFilters((f) => ({ ...f, status: s }))} />
        ))}
      </ChipRow>
      {classes.length > 1 ? (
        <ChipRow label={t('students.classFilter')}>
          <Chip testID="students.class.all" label={t('students.allClasses')} selected={filters.classId === null} onPress={() => setFilters((f) => ({ ...f, classId: null }))} />
          {classes.map((c) => (
            <Chip key={c.id} testID={`students.class.${c.name}`} label={c.name} selected={filters.classId === c.id} onPress={() => setFilters((f) => ({ ...f, classId: c.id }))} />
          ))}
        </ChipRow>
      ) : null}
      {error ? (
        <>
          <Notice tone="error" testID="students.error">{error}</Notice>
          <Button testID="students.retry" variant="secondary" label={t('common.retry')} onPress={() => void load(filters, null)} />
        </>
      ) : null}
      {empty === 'NONE' ? <AppText color={colors.textSecondary} testID="students.empty">{t('students.empty')}</AppText> : null}
      {empty === 'NO_MATCH' ? (
        <Card>
          <AppText testID="students.noMatch">{t('students.noMatch')}</AppText>
          <Button testID="students.clearFilters" variant="secondary" label={t('students.clearFilters')} onPress={clear} />
        </Card>
      ) : null}
      {items.map((s) => (
        <Pressable key={s.id} testID={`students.item.${s.externalStudentId ?? s.id}`} accessibilityRole="button" onPress={() => onOpen(s)} style={rowStyle.card}>
          <AppText role="cardTitle">{s.name}</AppText>
          {s.externalStudentId ? (
            <AppText role="helper" color={colors.textSecondary} latin>
              {s.externalStudentId}
            </AppText>
          ) : null}
          <AppText role="helper" color={colors.textSecondary}>
            {s.currentClass ? s.currentClass.name : t('students.noClass')}
          </AppText>
          {s.status === 'INACTIVE' ? <StatusLabel active={false} activeText={t('roster.active')} inactiveText={t('roster.inactive')} /> : null}
        </Pressable>
      ))}
      {loading ? <AppText color={colors.textSecondary} testID="students.loading">{t('common.loading')}</AppText> : null}
      {!loading && cursor ? <Button testID="students.loadMore" variant="secondary" label={t('students.loadMore')} onPress={() => void load(filters, cursor)} /> : null}
    </AppScreen>
  );
}

/** Add (with a class) or edit (profile fields only) a student. */
export function StudentFormScreen({ student, initialClassId, onSaved }: { student: StudentResponse | null; initialClassId: string | null; onSaved: (saved: StudentResponse) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const classes = useClasses('ACTIVE');
  const [name, setName] = useState(student?.name ?? '');
  const [classId, setClassId] = useState<string | null>(initialClassId);
  const [externalStudentId, setExternalStudentId] = useState(student?.externalStudentId ?? '');
  const [admissionDate, setAdmissionDate] = useState(student?.admissionDate ?? '');
  const [privateNotes, setPrivateNotes] = useState(student?.privateNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // A Teacher with one class gets it preselected.
  useEffect(() => {
    if (!student && classId === null && classes.length === 1) setClassId(classes[0]!.id);
  }, [classes, classId, student]);

  const save = async () => {
    setFormError(null);
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = t('fields.REQUIRED');
    if (!student && !classId) local.classId = t('fields.REQUIRED');
    const date = parseOptionalDate(admissionDate);
    if (!date.ok) local.admissionDate = t('students.dateFormat');
    setFields(local);
    if (Object.keys(local).length || !date.ok) return;
    setBusy(true);
    const profile = { name, externalStudentId: externalStudentId.trim() || null, admissionDate: date.value, privateNotes: privateNotes.trim() || null };
    try {
      const saved = student
        ? await session.authorized<StudentResponse>(`/students/${student.id}`, { method: 'PATCH', body: profile })
        : await session.authorized<StudentResponse>('/students', { body: { ...profile, classId } });
      onSaved(saved);
    } catch (err) {
      const keys = errorKeys(err);
      if (keys.form === 'errors.NOT_FOUND') setFields({ classId: t('students.classUnavailable') });
      else if (keys.form) setFormError(t(keys.form));
      else setFields(Object.fromEntries(Object.entries(rosterFieldMessages(keys.fields)).map(([f, k]) => [f, t(k)])));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={student ? t('students.editTitle') : t('students.addTitle')} testID="studentForm.screen">
      {formError ? <Notice tone="error" testID="studentForm.error">{formError}</Notice> : null}
      <Field testID="studentForm.name" label={t('students.name')} helper={t('common.required')} value={name} onChangeText={setName} error={fields.name} maxLength={200} autoCapitalize="words" />
      {!student ? (
        <>
          <AppText role="helper" color={colors.textSecondary}>{`${t('students.class')} · ${t('common.required')}`}</AppText>
          <ChipRow label={t('students.class')}>
            {classes.map((c) => (
              <Chip key={c.id} testID={`studentForm.class.${c.name}`} label={c.name} selected={classId === c.id} onPress={() => setClassId(c.id)} />
            ))}
          </ChipRow>
          {fields.classId ? <AppText role="helper" color={colors.danger} testID="studentForm.class.error">{`⚠ ${fields.classId}`}</AppText> : null}
        </>
      ) : null}
      <Field testID="studentForm.externalId" label={t('students.externalId')} helper={t('common.optional')} value={externalStudentId} onChangeText={setExternalStudentId} error={fields.externalStudentId} maxLength={50} />
      <Field
        testID="studentForm.admissionDate"
        label={t('students.admissionDate')}
        helper={`${t('common.optional')} · ${t('students.dateHelp')}`}
        placeholder="YYYY-MM-DD"
        value={admissionDate}
        onChangeText={setAdmissionDate}
        error={fields.admissionDate}
        maxLength={10}
        inputMode="numeric"
      />
      <Field
        testID="studentForm.privateNotes"
        label={t('students.privateNotes')}
        helper={`${t('common.optional')} · ${t('students.privateNotesHelp')}`}
        value={privateNotes}
        onChangeText={setPrivateNotes}
        error={fields.privateNotes}
        maxLength={2000}
        multiline
        autoCapitalize="sentences"
      />
      <Button testID="studentForm.save" label={t('common.save')} busyLabel={t('common.saving')} busy={busy} onPress={() => void save()} />
    </AppScreen>
  );
}

/** Student profile, Details tab: fields, enrollment history (F03-AC13), and actions. */
export function StudentProfileScreen({ studentId, onEdit, dailyEntry = null }: {
  studentId: string;
  onEdit: (student: StudentResponse) => void;
  /** F05: Teacher/Admin/Owner with a workspace record Daily Hifz and open daily records from the profile. */
  dailyEntry?: { onRecordHifz: (classId: string) => void; onOpenRecord: (recordId: string) => void } | null;
}) {
  const { t } = useTranslation();
  const { session } = useSession();
  const classes = useClasses('ACTIVE');
  const [student, setStudent] = useState<StudentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveClassId, setMoveClassId] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [moveFields, setMoveFields] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      setError(null);
      session
        .authorized<StudentResponse>(`/students/${studentId}`)
        .then(setStudent)
        .catch((err) => setError(t(errorKeys(err).form ?? 'errors.INTERNAL')));
    }, [session, studentId, t]),
  );

  const act = async (work: () => Promise<StudentResponse>, done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      setStudent(await work());
      setStatus({ tone: 'success', text: done });
      return true;
    } catch (err) {
      const keys = errorKeys(err);
      if (Object.keys(keys.fields).length) setMoveFields(Object.fromEntries(Object.entries(keys.fields).map(([f, k]) => [f, t(k)])));
      else setStatus({ tone: 'error', text: t(keys.form ?? 'errors.INTERNAL') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    const local: Record<string, string> = {};
    if (!moveClassId) local.classId = t('fields.REQUIRED');
    const date = parseOptionalDate(moveDate);
    if (!date.ok || date.value === null) local.startDate = t('students.dateFormat');
    setMoveFields(local);
    if (Object.keys(local).length || !date.ok || !student) return;
    const ok = await act(
      () => session.authorized<StudentResponse>(`/students/${student.id}/enrollments`, { body: { classId: moveClassId, startDate: date.value } }),
      t('students.moved'),
    );
    if (ok) setMoving(false);
  };

  if (error) {
    return (
      <AppScreen testID="studentProfile.screen">
        <Notice tone="error" testID="studentProfile.error">{error}</Notice>
      </AppScreen>
    );
  }
  if (!student) {
    return (
      <AppScreen testID="studentProfile.screen">
        <AppText color={colors.textSecondary}>{t('common.loading')}</AppText>
      </AppScreen>
    );
  }

  return (
    <AppScreen title={student.name} testID="studentProfile.screen">
      {status ? <Notice tone={status.tone} testID={`studentProfile.status.${status.tone}`}>{status.text}</Notice> : null}
      <Card>
        <StatusLabel active={student.status === 'ACTIVE'} activeText={t('roster.active')} inactiveText={t('roster.inactive')} testID="studentProfile.statusLabel" />
        {student.externalStudentId ? (
          <AppText latin testID="studentProfile.externalId">
            {student.externalStudentId}
          </AppText>
        ) : null}
        <AppText testID="studentProfile.class">{student.currentClass ? `${t('students.class')}: ${student.currentClass.name}` : t('students.noClass')}</AppText>
        {student.upcomingClass ? (
          <AppText color={colors.info}>{t('students.upcoming', { name: student.upcomingClass.name, date: student.upcomingClass.startDate })}</AppText>
        ) : null}
        {student.admissionDate ? <AppText color={colors.textSecondary}>{`${t('students.admissionDate')}: ${student.admissionDate}`}</AppText> : null}
      </Card>
      {student.privateNotes ? (
        <Card>
          <AppText role="cardTitle">{`🔒 ${t('students.privateNotes')}`}</AppText>
          <AppText role="helper" color={colors.textSecondary}>{t('students.privateNotesHelp')}</AppText>
          <AppText testID="studentProfile.privateNotes">{student.privateNotes}</AppText>
        </Card>
      ) : null}
      <Card>
        <AppText role="cardTitle">{t('students.history')}</AppText>
        {student.enrollments.map((e) => (
          <AppText key={e.id} testID={`studentProfile.enrollment.${e.className}`}>
            {`${e.className} · ${e.startDate} – ${e.endDate ?? t('students.present')}`}
          </AppText>
        ))}
      </Card>
      {dailyEntry && student.currentClass && student.status === 'ACTIVE' ? (
        <Button testID="studentProfile.recordHifz" label={t('students.recordHifz')} onPress={() => dailyEntry.onRecordHifz(student.currentClass!.id)} />
      ) : null}
      {dailyEntry ? <StudentDailyRecords studentId={student.id} onOpen={dailyEntry.onOpenRecord} /> : null}
      {student.canEdit ? <Button testID="studentProfile.edit" variant="secondary" label={t('students.edit')} disabled={busy} onPress={() => onEdit(student)} /> : null}
      {student.canManage ? (
        <>
          {moving ? (
            <Card>
              <AppText role="cardTitle">{t('students.moveTitle')}</AppText>
              <ChipRow label={t('students.class')}>
                {classes
                  .filter((c) => c.id !== student.currentClass?.id)
                  .map((c) => (
                    <Chip key={c.id} testID={`studentProfile.move.class.${c.name}`} label={c.name} selected={moveClassId === c.id} onPress={() => setMoveClassId(c.id)} />
                  ))}
              </ChipRow>
              {moveFields.classId ? <AppText role="helper" color={colors.danger}>{`⚠ ${moveFields.classId}`}</AppText> : null}
              <Field
                testID="studentProfile.move.date"
                label={t('students.moveFrom')}
                helper={t('students.moveHelp')}
                placeholder="YYYY-MM-DD"
                value={moveDate}
                onChangeText={setMoveDate}
                error={moveFields.startDate}
                maxLength={10}
                inputMode="numeric"
              />
              <Button testID="studentProfile.move.save" label={t('students.move')} busy={busy} onPress={() => void move()} />
              <Button testID="studentProfile.move.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setMoving(false)} />
            </Card>
          ) : (
            <Button testID="studentProfile.move" variant="secondary" label={t('students.move')} disabled={busy} onPress={() => setMoving(true)} />
          )}
          {confirmDeactivate ? (
            <Card>
              <AppText testID="studentProfile.confirmMessage">{t('students.deactivateConfirm', { name: student.name })}</AppText>
              <Button
                testID="studentProfile.confirm"
                variant="destructive"
                label={t('students.deactivate')}
                onPress={() => {
                  setConfirmDeactivate(false);
                  void act(() => session.authorized<StudentResponse>(`/students/${student.id}/deactivate`, { body: {} }), t('students.deactivated'));
                }}
              />
              <Button testID="studentProfile.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setConfirmDeactivate(false)} />
            </Card>
          ) : null}
          {student.status === 'ACTIVE' ? (
            <Button testID="studentProfile.deactivate" variant="destructive" label={t('students.deactivate')} disabled={busy} onPress={() => setConfirmDeactivate(true)} />
          ) : (
            <Button
              testID="studentProfile.reactivate"
              variant="secondary"
              label={t('students.reactivate')}
              disabled={busy}
              onPress={() => void act(() => session.authorized<StudentResponse>(`/students/${student.id}/reactivate`, { body: {} }), t('students.reactivated'))}
            />
          )}
        </>
      ) : null}
    </AppScreen>
  );
}
