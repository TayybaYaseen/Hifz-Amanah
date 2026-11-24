// F14 · Excel import and export (US-058…061; design.md §4.15, §13). Online only: the server validates, previews, and
// commits every import and builds every export; offline the screen says a connection is needed (out of scope offline).
//
// Import: choose type → template version → file → preview (counts and row/field issues, localized by the server in
// the user's language, NFR-XLS-003) → mode (add-new-only by default; update shows before/after per field) → explicit
// confirm → results (committed, failed, skipped; retry commits only the rows not yet committed).
// Export: student list, daily records (staff or student/guardian audience; private notes only on request, after a
// warning), or a class report. Files are saved to the app cache and handed to the Android share sheet.
// No import rule lives here (design §11 "UI components must not own business calculations"): view.ts only orders and
// counts what the server returned.
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import {
  TEMPLATE_VERSIONS,
  XLSX_CONTENT_TYPE,
  type ClassListResponse,
  type ExportAudience,
  type ImportJobView,
  type ImportMode,
  type ImportRowView,
  type ImportTemplate,
  type MeResponse,
  type ReportPeriodKind,
} from '@hifz/contracts';
import { calendarDateIn } from '@hifz/domain/roster';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { useLocale } from '../../i18n/LocaleContext.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, radius, space, touch } from '../../theme/tokens.ts';
import { confirmImport, downloadExport, downloadTemplate, fetchImportRows, setImportMode, uploadWorkbook, type ExportRequest } from './api.ts';
import { CLASSIFICATION_GLYPHS, canConfirm, countRows, rowsToReview, stepOf, weekOf } from './view.ts';

type Tab = 'import' | 'export';

function Choice<T extends string>({ options, value, onChange, testID }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID: string }) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable
          key={o.value}
          testID={`${testID}.${o.value}`}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)}
          style={[styles.choice, o.value === value ? styles.choiceOn : null]}
        >
          <AppText color={o.value === value ? colors.brandPrimary : colors.textPrimary}>{`${o.value === value ? '● ' : '○ '}${o.label}`}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

/** A server message when the error carries one (a localized workbook rejection), else the app's own text. */
function messageOf(err: unknown, t: (key: string) => string): { text: string; offline: boolean } {
  if (err instanceof ApiFailure && err.code === 'NETWORK') return { text: t('importExport.offline'), offline: true };
  if (err instanceof ApiFailure && err.code === 'WORKBOOK_REJECTED' && typeof err.details?.message === 'string') return { text: err.details.message, offline: false };
  return { text: t(errorKeys(err).form ?? 'errors.INTERNAL'), offline: false };
}

// The native file modules are imported statically (they need a development build made with F14, apps/mobile/README).
// A lazy import() made Metro load them as a separate bundle on first use, which reloaded a development build's JS
// while the share sheet was open.
async function share(bytes: ArrayBuffer, fileName: string, title: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(bytes));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: XLSX_CONTENT_TYPE, dialogTitle: title, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
}

export function ImportExportScreen({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('import');
  return (
    <AppScreen testID="importExport.screen">
      <Choice
        testID="importExport.tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'import', label: t('importExport.importTab') },
          { value: 'export', label: t('importExport.exportTab') },
        ]}
      />
      {tab === 'import' ? <ImportPanel /> : <ExportPanel me={me} />}
    </AppScreen>
  );
}

// ---------- Import ----------

function ImportPanel() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { locale } = useLocale();
  const [template, setTemplate] = useState<ImportTemplate>('Students');
  const [job, setJob] = useState<ImportJobView | null>(null);
  const [rows, setRows] = useState<ImportRowView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ text: string; offline: boolean } | null>(null);

  const step = stepOf(job);

  const run = async (what: string, work: () => Promise<void>) => {
    setBusy(what);
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem(messageOf(err, t));
    } finally {
      setBusy(null);
    }
  };

  const adopt = async (next: ImportJobView) => {
    setJob(next);
    setRows((await fetchImportRows(session, next.id, locale)).items);
  };

  const pick = () =>
    run('upload', async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: XLSX_CONTENT_TYPE, copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets[0]) return;
      const blob = await (await fetch(picked.assets[0].uri)).blob();
      await adopt(await uploadWorkbook(session, template, blob, locale));
    });

  const changeMode = (mode: ImportMode) => job && run('mode', async () => adopt(await setImportMode(session, job.id, mode, locale)));

  const confirm = () => {
    if (!job) return;
    Alert.alert(t('importExport.confirmTitle'), t('importExport.confirmBody', { count: job.counts.NEW + (job.mode === 'UPDATE' ? job.counts.PROPOSED_UPDATE : 0) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('importExport.confirm'), onPress: () => void run('confirm', async () => adopt(await confirmImport(session, job.id, job.mode, locale))) },
    ]);
  };

  const template_ = () =>
    run('template', async () => {
      await share(await downloadTemplate(session, template, locale), `${template}-v${TEMPLATE_VERSIONS[template]}.xlsx`, t('importExport.templateTitle'));
    });

  return (
    <View style={styles.panel}>
      {problem ? (
        <Notice tone="error" testID={problem.offline ? 'importExport.offline' : 'importExport.error'}>
          {problem.text}
        </Notice>
      ) : null}

      {step === 'choose' ? (
        <Card>
          <AppText role="cardTitle">{t('importExport.chooseType')}</AppText>
          <Choice
            testID="import.template"
            value={template}
            onChange={setTemplate}
            options={[
              { value: 'Students', label: t('importExport.templates.Students') },
              { value: 'DailyRecords', label: t('importExport.templates.DailyRecords') },
            ]}
          />
          <AppText testID="import.templateVersion">{t('importExport.expectedTemplate', { template, version: TEMPLATE_VERSIONS[template] })}</AppText>
          <AppText role="helper">{t('importExport.rules')}</AppText>
          <Button testID="import.downloadTemplate" variant="secondary" label={t('importExport.downloadTemplate')} busy={busy === 'template'} onPress={template_} />
          <Button testID="import.pickFile" label={t('importExport.pickFile')} busyLabel={t('importExport.checking')} busy={busy === 'upload'} onPress={pick} />
        </Card>
      ) : null}

      {job && step !== 'choose' ? (
        <Card>
          <AppText role="cardTitle" testID="import.jobTitle">
            {t('importExport.previewTitle', { template: job.template, rows: job.rowCount })}
          </AppText>
          {countRows(job).map((c) => (
            <AppText key={c.classification} testID={`import.count.${c.classification}`}>{`${CLASSIFICATION_GLYPHS[c.classification]} ${t(`importExport.classes.${c.classification}`)}: ${c.count}`}</AppText>
          ))}
          {job.ignoredColumns.length > 0 ? (
            <Notice tone="info" testID="import.ignoredColumns">
              {t('importExport.ignoredColumns', { columns: job.ignoredColumns.join(', ') })}
            </Notice>
          ) : null}
          {step === 'preview' ? (
            <>
              <AppText role="cardTitle">{t('importExport.mode')}</AppText>
              <Choice
                testID="import.mode"
                value={job.mode}
                onChange={(m) => void changeMode(m)}
                options={[
                  { value: 'ADD_ONLY', label: t('importExport.modes.ADD_ONLY') },
                  { value: 'UPDATE', label: t('importExport.modes.UPDATE') },
                ]}
              />
              <AppText role="helper">{t(job.mode === 'UPDATE' ? 'importExport.modeHelp.UPDATE' : 'importExport.modeHelp.ADD_ONLY')}</AppText>
            </>
          ) : (
            <View testID="import.results">
              <AppText testID="import.result.COMMITTED">{`✓ ${t('importExport.results.COMMITTED')}: ${job.resultCounts?.COMMITTED ?? 0}`}</AppText>
              <AppText testID="import.result.FAILED">{`✗ ${t('importExport.results.FAILED')}: ${job.resultCounts?.FAILED ?? 0}`}</AppText>
              <AppText testID="import.result.SKIPPED">{`– ${t('importExport.results.SKIPPED')}: ${job.resultCounts?.SKIPPED ?? 0}`}</AppText>
            </View>
          )}
          {canConfirm(job) ? (
            <Button
              testID="import.confirm"
              label={job.status === 'PARTIALLY_FAILED' ? t('importExport.retry') : t('importExport.confirm')}
              busyLabel={t('importExport.importing')}
              busy={busy === 'confirm'}
              disabled={busy !== null}
              onPress={confirm}
            />
          ) : null}
          <Button
            testID="import.another"
            variant="secondary"
            label={t('importExport.another')}
            onPress={() => {
              setJob(null);
              setRows([]);
              setProblem(null);
            }}
          />
        </Card>
      ) : null}

      {job ? <RowList rows={rowsToReview(rows)} /> : null}
    </View>
  );
}

function RowList({ rows }: { rows: ImportRowView[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <View testID="import.rows" style={styles.panel}>
      {rows.map((r) => (
        <Card key={r.rowNo}>
          <AppText role="cardTitle" testID={`import.row.${r.rowNo}`}>{`${CLASSIFICATION_GLYPHS[r.classification]} ${t('importExport.row', { row: r.rowNo })} · ${t(`importExport.classes.${r.classification}`)}`}</AppText>
          {[...r.issues, ...r.resultIssues].map((i, n) => (
            <AppText key={n} role="helper" color={i.severity === 'ERROR' ? colors.danger : colors.textSecondary} testID={`import.row.${r.rowNo}.issue.${n}`}>
              {i.column ? `${i.column}: ${i.message}` : i.message}
            </AppText>
          ))}
          {r.changes.map((c) => (
            <AppText key={c.column} role="helper" testID={`import.row.${r.rowNo}.change.${c.column}`}>
              {t('importExport.change', { column: c.column, before: c.before ?? '—', after: c.after ?? '—' })}
            </AppText>
          ))}
        </Card>
      ))}
    </View>
  );
}

// ---------- Export ----------

type ExportKind = ExportRequest['kind'];

function ExportPanel({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const { locale } = useLocale();
  const sync = useSync();
  const today = calendarDateIn(new Date(), sync.meta?.orgTimeZone ?? 'Asia/Karachi');
  const week = weekOf(today);
  const [kind, setKind] = useState<ExportKind>('daily-records');
  const [from, setFrom] = useState(week.from);
  const [to, setTo] = useState(week.to);
  const [audience, setAudience] = useState<ExportAudience>('STAFF');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [period, setPeriod] = useState<ReportPeriodKind>('WEEK');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'error' | 'success'; text: string; offline?: boolean } | null>(null);

  useEffect(() => {
    if (kind !== 'report' || classes.length > 0) return;
    session
      .authorized<ClassListResponse>('/classes')
      .then((res) => {
        const active = res.items.filter((c) => c.status === 'ACTIVE').map((c) => ({ id: c.id, name: c.name }));
        setClasses(active);
        setClassId((current) => current ?? active[0]?.id ?? null);
      })
      .catch((err: unknown) => setStatus({ tone: 'error', ...messageOf(err, t) }));
  }, [kind, classes.length, session, t]);

  const request = (): ExportRequest | null => {
    if (kind === 'students') return { kind, includeNotes };
    if (kind === 'daily-records') return { kind, from, to, audience, includeNotes: audience === 'STAFF' && includeNotes };
    return classId ? { kind, classId, period, date: today } : null;
  };

  const run = async () => {
    const req = request();
    if (!req) return;
    setBusy(true);
    setStatus(null);
    try {
      const bytes = await downloadExport(session, req, locale);
      await share(bytes, `${req.kind}-${today}.xlsx`, t('importExport.exportTitle'));
      setStatus({ tone: 'success', text: t('importExport.exported') });
    } catch (err) {
      setStatus({ tone: 'error', ...messageOf(err, t) });
    } finally {
      setBusy(false);
    }
  };

  // Private staff notes are included only after a warning (design §4.15 "Warn before including staff-private notes").
  const toggleNotes = () => {
    if (includeNotes) return setIncludeNotes(false);
    Alert.alert(t('importExport.notesWarningTitle'), t('importExport.notesWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('importExport.includeNotes'), onPress: () => setIncludeNotes(true) },
    ]);
  };

  const staffAudience = kind === 'students' || (kind === 'daily-records' && audience === 'STAFF');
  return (
    <View style={styles.panel}>
      {status ? (
        <Notice tone={status.tone} testID={status.offline ? 'importExport.offline' : `export.${status.tone}`}>
          {status.text}
        </Notice>
      ) : null}
      <Card>
        <AppText role="cardTitle">{t('importExport.exportWhat')}</AppText>
        <Choice
          testID="export.kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'students', label: t('importExport.exports.students') },
            { value: 'daily-records', label: t('importExport.exports.dailyRecords') },
            { value: 'report', label: t('importExport.exports.report') },
          ]}
        />
        {kind === 'daily-records' ? (
          <>
            <Field testID="export.from" label={t('importExport.from')} value={from} onChangeText={setFrom} autoCapitalize="none" />
            <Field testID="export.to" label={t('importExport.to')} value={to} onChangeText={setTo} autoCapitalize="none" />
            <Choice
              testID="export.audience"
              value={audience}
              onChange={setAudience}
              options={[
                { value: 'STAFF', label: t('importExport.audiences.STAFF') },
                { value: 'FAMILY', label: t('importExport.audiences.FAMILY') },
              ]}
            />
            {audience === 'FAMILY' ? <AppText role="helper" testID="export.familyNote">{t('importExport.familyNote')}</AppText> : null}
          </>
        ) : null}
        {kind === 'report' ? (
          <>
            <Choice testID="export.class" value={classId ?? ''} onChange={(v) => setClassId(v)} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
            <Choice
              testID="export.period"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'WEEK', label: t('importExport.periods.WEEK') },
                { value: 'MONTH', label: t('importExport.periods.MONTH') },
              ]}
            />
          </>
        ) : null}
        {staffAudience && me.role !== 'STUDENT' && me.role !== 'PARENT' ? (
          <Pressable testID="export.includeNotes" accessibilityRole="checkbox" accessibilityState={{ checked: includeNotes }} onPress={toggleNotes} style={styles.choice}>
            <AppText>{`${includeNotes ? '☑' : '☐'} ${t('importExport.includeNotes')}`}</AppText>
          </Pressable>
        ) : null}
        <Button testID="export.run" label={t('importExport.export')} busyLabel={t('importExport.exporting')} busy={busy} disabled={kind === 'report' && !classId} onPress={() => void run()} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space[3] },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginVertical: space[2] },
  choice: {
    minHeight: touch.preferred,
    justifyContent: 'center',
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceOn: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceSelected },
});
