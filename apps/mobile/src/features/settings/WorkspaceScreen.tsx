// Settings → Madrasa (US-007; F02-AC1…AC4; design.md §4.16 "Workspace", §13 design gap built from FormField).
// Online only: changes need the network. Owner/Admin edit the name, timezone, and week start; every other role sees
// the same values as plain text with no edit controls (F02-AC4). The server decides every permission.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WEEK_DAYS, type OrganizationSettingsResponse, type WeekDay } from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { colors, radius, space, touch } from '../../theme/tokens.ts';

export function WorkspaceScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [settings, setSettings] = useState<OrganizationSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [weekStart, setWeekStart] = useState<WeekDay>('MONDAY');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const adopt = (next: OrganizationSettingsResponse) => {
    setSettings(next);
    setName(next.name);
    setTimezone(next.timezone);
    setWeekStart(next.weekStart);
  };

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      adopt(await session.authorized<OrganizationSettingsResponse>('/organization'));
    } catch (err) {
      setLoadError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  }, [session, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    setFields({});
    try {
      // Only what the form edits; the madrasa is always the signed-in one (FR-SEC-009).
      adopt(await session.authorized<OrganizationSettingsResponse>('/organization', { method: 'PATCH', body: { name, timezone: timezone.trim(), weekStart } }));
      setStatus({ tone: 'success', text: t('workspace.saved') });
    } catch (err) {
      // Input is kept after an error so nothing typed is lost (design.md §5.2).
      const keys = errorKeys(err);
      if (keys.form) setStatus({ tone: 'error', text: t(keys.form) });
      else setFields(Object.fromEntries(Object.entries(keys.fields).map(([f, k]) => [f, t(k)])));
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <AppScreen title={t('workspace.title')} testID="workspace.screen">
        {loadError ? (
          <>
            <Notice tone="error" testID="workspace.error">{loadError}</Notice>
            <Button testID="workspace.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
          </>
        ) : (
          <AppText color={colors.textSecondary}>{t('common.loading')}</AppText>
        )}
      </AppScreen>
    );
  }

  const reportMode = <AppText testID="workspace.reportMode">{`${t('workspace.reportMode')}: ${t(`reportMode.${settings.dailyReportMode}`)}`}</AppText>;

  if (!settings.canEdit) {
    return (
      <AppScreen title={t('workspace.title')} testID="workspace.screen">
        <Card>
          <AppText role="cardTitle" testID="workspace.name">{settings.name}</AppText>
          <AppText testID="workspace.timezone">
            {`${t('workspace.timezone')}: `}
            <AppText latin>{settings.timezone}</AppText>
          </AppText>
          <AppText testID="workspace.weekStart">{`${t('workspace.weekStart')}: ${t(`weekDays.${settings.weekStart}`)}`}</AppText>
          {reportMode}
        </Card>
        <AppText role="helper" color={colors.textSecondary} testID="workspace.readOnly">
          {t('workspace.readOnlyNote')}
        </AppText>
      </AppScreen>
    );
  }

  return (
    <AppScreen title={t('workspace.title')} testID="workspace.screen">
      {status ? <Notice tone={status.tone} testID={`workspace.status.${status.tone}`}>{status.text}</Notice> : null}
      <Field testID="workspace.nameInput" label={t('workspace.name')} value={name} onChangeText={setName} error={fields.name} maxLength={100} />
      <Field
        testID="workspace.timezoneInput"
        label={t('workspace.timezone')}
        helper={t('workspace.timezoneHelp')}
        value={timezone}
        onChangeText={setTimezone}
        error={fields.timezone}
        maxLength={64}
      />
      <AppText role="helper" color={colors.textSecondary}>
        {t('workspace.weekStart')}
      </AppText>
      <View style={styles.days} accessibilityRole="radiogroup" accessibilityLabel={t('workspace.weekStart')}>
        {WEEK_DAYS.map((day) => (
          <Pressable
            key={day}
            testID={`workspace.weekStart.${day}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: weekStart === day }}
            onPress={() => setWeekStart(day)}
            style={[styles.chip, weekStart === day ? styles.chipOn : null]}
          >
            <AppText role="button" color={weekStart === day ? colors.brandPrimary : colors.textPrimary}>
              {`${weekStart === day ? '✓ ' : ''}${t(`weekDays.${day}`)}`}
            </AppText>
          </Pressable>
        ))}
      </View>
      {fields.weekStart ? <AppText color={colors.danger}>{fields.weekStart}</AppText> : null}
      <AppText role="helper" color={colors.textSecondary}>
        {t('workspace.weekStartHelp')}
      </AppText>
      {reportMode}
      <Button testID="workspace.save" label={t('common.save')} busyLabel={t('common.saving')} busy={busy} onPress={() => void save()} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: touch.minimum,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceSelected },
});
