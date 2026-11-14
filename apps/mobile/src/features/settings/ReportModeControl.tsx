// F05 · The daily-report mode (US-019; F05-AC8, AC9; design.md §4.16; UI spec §6). Owner/Admin only: the screen
// renders this control only when the server says the caller may edit settings, and the server refuses a Teacher
// regardless (403). Its own Save calls PUT /organization/daily-report-mode; a switch to SINGLE that would leave a
// student with two records on a date is refused with 409 MODE_CONFLICTS and the list is shown (F05-AC8).
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DAILY_REPORT_MODES, type DailyReportMode, type DailyReportModeResponse, type ReportModeConflict } from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppText, Button, Notice, isolate } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { cacheReportMode } from '../daily-entry/local.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import { conflictsOf } from './reportMode.ts';

export function ReportModeControl({ saved, onSaved }: { saved: DailyReportMode; onSaved: (mode: DailyReportMode) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const [mode, setMode] = useState<DailyReportMode>(saved);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ReportModeConflict[] | null>(null);

  const save = async () => {
    setBusy(true);
    setDone(false);
    setError(null);
    setConflicts(null);
    try {
      const res = await session.authorized<DailyReportModeResponse>('/organization/daily-report-mode', { method: 'PUT', body: { mode } });
      setMode(res.mode);
      onSaved(res.mode);
      if (sync.db) await cacheReportMode(sync.db, res.mode).catch(() => undefined);
      setDone(true);
    } catch (err) {
      const list = conflictsOf(err);
      if (list) {
        setConflicts(list);
        // The madrasa keeps the saved mode; the selection goes back to it (UI spec §6).
        setMode(saved);
      } else {
        // Offline and other errors keep the selection (UI spec §6).
        setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space[2] }}>
      <AppText role="helper" color={colors.textSecondary} testID="workspace.reportMode">{t('workspace.reportMode')}</AppText>
      <AppText role="helper" color={colors.textSecondary}>{t('workspace.reportModeHelp')}</AppText>
      <ChipRow label={t('workspace.reportMode')}>
        {DAILY_REPORT_MODES.map((m) => (
          <Chip
            key={m}
            testID={`workspace.reportMode.${m}`}
            label={t(`reportMode.${m}`)}
            selected={mode === m}
            onPress={() => {
              setMode(m);
              setDone(false);
              setConflicts(null);
            }}
          />
        ))}
      </ChipRow>
      {done ? <Notice tone="success" testID="workspace.reportMode.saved">{t('workspace.reportModeSaved')}</Notice> : null}
      {error ? <Notice tone="error" testID="workspace.reportMode.error">{error}</Notice> : null}
      {conflicts ? (
        <View style={{ gap: space[1] }}>
          <Notice tone="error" testID="workspace.reportMode.conflicts">{t('workspace.reportModeConflicts')}</Notice>
          {conflicts.map((c, i) => (
            <AppText key={`${c.studentId}-${c.reportDate}`} testID={`workspace.reportMode.conflict.${i}`}>
              {t('workspace.reportModeConflict', {
                name: isolate(c.studentName),
                date: isolate(c.reportDate),
                sessions: c.sessionLabels.map((l) => isolate(l ?? t('workspace.noSessionLabel'))).join(t('common.listSeparator')),
              })}
            </AppText>
          ))}
        </View>
      ) : null}
      <Button testID="workspace.reportMode.save" variant="secondary" label={t('workspace.reportModeSave')} busy={busy} busyLabel={t('common.saving')} onPress={() => void save()} />
    </View>
  );
}
