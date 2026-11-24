// F15 · Settings → AI (US-064, US-065; F15-AC10…AC12, AC14, AC16; FR-AI-012, FR-AI-013; docs/handover/F15-ui-spec.md
// Screen 2). Owner/Admin only; any other role sees a read-only refusal and the server refuses them regardless.
// - Online only: nothing is queued offline; offline every input and Save are disabled.
// - The provider list is the server's (the AI vendor is Deferred, DEC-B45): no vendor is named here, and with an empty
//   list AI cannot be turned on and Save is disabled.
// - Limits: optional monthly request cap for the madrasa, requests per Teacher per day, and a monthly budget in USD
//   (at most 10, only lowered). Money goes to the server as integer micro-USD (aiSettingsForm.ts).
// - Five data-category switches, all on by default; names, contact details and notes are a fixed "never shared" row,
//   not a switch (F15-AC14, AC16).
// The form is controlled state on this screen, so a language switch keeps unsaved input.
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AiSettingsResponse, Role } from '@hifz/contracts';
import { ApiFailure } from '../../api/client.ts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice, isolate } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space, touch } from '../../theme/tokens.ts';
import { fetchAiSettings, saveAiSettings } from '../analytics/api.ts';
import { Chip, ChipRow } from '../roster/Chip.tsx';
import { firstErrorField, formOf, usageParams, validateAiForm, type AiFormError, type AiFormField, type AiSettingsForm } from './aiSettingsForm.ts';

const CATEGORIES = [
  { key: 'ATTENDANCE', id: 'attendance' },
  { key: 'PROGRESS', id: 'progress' },
  { key: 'MISTAKES', id: 'mistakes' },
  { key: 'QUALITY', id: 'quality' },
  { key: 'HOMEWORK', id: 'homework' },
] as const;

const SERVER_FIELDS: Record<string, { field: AiFormField; error: AiFormError }> = {
  monthlyRequestCap: { field: 'monthlyCap', error: 'POSITIVE' },
  teacherDailyCap: { field: 'teacherDaily', error: 'POSITIVE' },
  monthlyBudgetMicroUsd: { field: 'budget', error: 'BUDGET' },
};

/** One 48 dp row, announced as a switch with its label (and helper) read together; the switch sits on the end side. */
function SwitchRow({ label, helper, value, onChange, disabled, testID }: { label: string; helper?: string; value: boolean; onChange: (next: boolean) => void; disabled: boolean; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={helper ? `${label}. ${helper}` : label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.switchRow, disabled ? styles.off : null]}
    >
      <View style={styles.switchText}>
        <AppText>{label}</AppText>
        {helper ? <AppText role="helper" color={colors.textSecondary}>{helper}</AppText> : null}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
        <Switch value={value} disabled={disabled} trackColor={{ true: colors.brandPrimary, false: colors.border }} thumbColor={colors.surface} />
      </View>
    </Pressable>
  );
}

function FieldError({ error }: { error: AiFormError | undefined }) {
  const { t } = useTranslation();
  if (!error) return null;
  const key = error === 'BUDGET' ? 'aiSettings.error.budget' : 'aiSettings.error.positive';
  return (
    <View accessibilityLiveRegion="polite">
      <AppText role="helper" color={colors.danger} accessibilityRole="alert" testID={error === 'BUDGET' ? 'aiSettings.error.budget' : 'aiSettings.error.positive'}>
        {`⚠ ${t(key)}`}
      </AppText>
    </View>
  );
}

export function AiSettingsScreen({ role }: { role: Role }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [form, setForm] = useState<AiSettingsForm | null>(null);
  const [load, setLoad] = useState<'loading' | 'loaded' | 'offline' | 'error' | 'revoked'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AiFormField, AiFormError>>>({});
  const [status, setStatus] = useState<{ tone: 'error' | 'success'; text: string; testID: string } | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);

  const adopt = (next: AiSettingsResponse) => {
    setSettings(next);
    setForm(formOf(next));
    setErrors({});
    setStale(false);
  };

  const revoke = () => {
    setSettings(null);
    setForm(null);
    setLoad('revoked');
  };

  const reload = useCallback(async () => {
    if (!canEdit) return;
    setLoadError(null);
    try {
      const res = await fetchAiSettings(session);
      setSettings(res);
      setForm(formOf(res));
      setErrors({});
      setStale(false);
      setLoad('loaded');
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'NETWORK') setLoad('offline');
      else if (err instanceof ApiFailure && err.code === 'FORBIDDEN') {
        setSettings(null);
        setForm(null);
        setLoad('revoked');
      } else {
        setLoadError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
        setLoad('error');
      }
    }
  }, [canEdit, session, t]);

  // Loads once, and again when the connection comes back before anything was loaded. Nothing is read offline.
  const revoked = load === 'revoked';
  useEffect(() => {
    if (!canEdit || settings || revoked) return;
    if (!sync.online) {
      setLoad('offline');
      return;
    }
    setLoad('loading');
    void reload();
  }, [canEdit, settings, revoked, sync.online, reload]);

  if (!canEdit) {
    return (
      <AppScreen title={t('aiSettings.title')} testID="aiSettings.screen">
        <AppText role="helper" color={colors.textSecondary} testID="aiSettings.readOnly">{t('aiSettings.readOnly')}</AppText>
      </AppScreen>
    );
  }

  const offlineNotice = !sync.online || load === 'offline' ? <Notice tone="info" testID="aiSettings.offline">{t('aiSettings.offline')}</Notice> : null;

  if (load === 'revoked') {
    return (
      <AppScreen title={t('aiSettings.title')} testID="aiSettings.screen">
        <Notice tone="error" testID="aiSettings.revoked">{t('aiSettings.revoked')}</Notice>
      </AppScreen>
    );
  }

  if (!settings || !form) {
    return (
      <AppScreen title={t('aiSettings.title')} testID="aiSettings.screen">
        {offlineNotice}
        {load === 'error' && loadError ? (
          <>
            <Notice tone="error" testID="aiSettings.error">{loadError}</Notice>
            <Button testID="aiSettings.retry" variant="secondary" label={t('common.retry')} onPress={() => void reload()} />
          </>
        ) : null}
        {load === 'loading' ? <AppText color={colors.textSecondary} testID="aiSettings.loading">{t('aiSettings.loading')}</AppText> : null}
      </AppScreen>
    );
  }

  const offline = !sync.online;
  const noProviders = settings.supportedProviders.length === 0;
  const inactive = offline || busy;
  const update = (patch: Partial<AiSettingsForm>) => {
    setStatus(null);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  const save = async () => {
    setStatus(null);
    const checked = validateAiForm(form, settings.monthlyBudgetMicroUsd);
    setErrors(checked.errors);
    if (!checked.request) {
      const first = firstErrorField(checked.errors);
      if (first) AccessibilityInfo.announceForAccessibility(t(checked.errors[first] === 'BUDGET' ? 'aiSettings.error.budget' : 'aiSettings.error.positive'));
      return;
    }
    setBusy(true);
    try {
      adopt(await saveAiSettings(session, checked.request));
      setStatus({ tone: 'success', text: t('aiSettings.saved'), testID: 'aiSettings.saved' });
    } catch (err) {
      // The form stays filled after any failure (design.md §5.2).
      if (err instanceof ApiFailure && err.code === 'FORBIDDEN') revoke();
      else if (err instanceof ApiFailure && err.code === 'CONFLICT_STALE') setStale(true);
      else if (err instanceof ApiFailure && err.code === 'NETWORK') setStatus({ tone: 'error', text: t('aiSettings.offline'), testID: 'aiSettings.error' });
      else if (err instanceof ApiFailure && err.code === 'VALIDATION' && Object.keys(err.fields).some((f) => SERVER_FIELDS[f])) {
        const next: Partial<Record<AiFormField, AiFormError>> = {};
        for (const f of Object.keys(err.fields)) {
          const m = SERVER_FIELDS[f];
          if (m) next[m.field] = m.error;
        }
        setErrors(next);
      } else setStatus({ tone: 'error', text: t(errorKeys(err).form ?? 'errors.VALIDATION'), testID: 'aiSettings.error' });
    } finally {
      setBusy(false);
    }
  };

  const usage = usageParams(settings);

  return (
    <AppScreen title={t('aiSettings.title')} testID="aiSettings.screen">
      {offlineNotice}
      {status ? <Notice tone={status.tone} testID={status.testID}>{status.text}</Notice> : null}
      {stale ? (
        <>
          <Notice tone="error" testID="aiSettings.stale">{t('aiSettings.error.stale')}</Notice>
          <Button testID="aiSettings.reload" variant="secondary" label={t('aiSettings.reload')} onPress={() => void reload()} />
        </>
      ) : null}
      <AppText color={colors.textSecondary}>{t('aiSettings.intro')}</AppText>

      {/* Status: AI cannot be on without a provider (UpdateAiSettingsRequest refinement). */}
      <Card>
        <SwitchRow
          testID="aiSettings.enabled"
          label={t('aiSettings.enabled')}
          value={form.enabled && form.provider !== null}
          disabled={inactive || form.provider === null}
          onChange={(enabled) => update({ enabled })}
        />
      </Card>

      <Card>
        <AppText role="cardTitle" accessibilityRole="header">{t('aiSettings.provider')}</AppText>
        {noProviders ? (
          <>
            <Notice tone="info" testID="aiSettings.noProvider">{t('aiSettings.noProvider')}</Notice>
            <AppText role="helper" color={colors.textSecondary}>{t('aiSettings.noProviderHelp')}</AppText>
          </>
        ) : (
          <ChipRow label={t('aiSettings.provider')}>
            {settings.supportedProviders.map((p) => (
              <Chip key={p.id} testID={`aiSettings.provider.${p.id}`} label={p.label} selected={form.provider === p.id} disabled={inactive} onPress={() => update({ provider: p.id })} />
            ))}
          </ChipRow>
        )}
      </Card>

      <Card>
        <AppText role="cardTitle" accessibilityRole="header">{t('aiSettings.limits')}</AppText>
        <Field testID="aiSettings.limit.monthly" label={t('aiSettings.limitMonthly')} value={form.monthlyCap} onChangeText={(monthlyCap) => update({ monthlyCap })} keyboardType="number-pad" editable={!inactive} maxLength={9} />
        <FieldError error={errors.monthlyCap} />
        <Field testID="aiSettings.limit.teacherDaily" label={t('aiSettings.limitTeacherDaily')} value={form.teacherDaily} onChangeText={(teacherDaily) => update({ teacherDaily })} keyboardType="number-pad" editable={!inactive} maxLength={9} />
        <FieldError error={errors.teacherDaily} />
        <Field testID="aiSettings.budget" label={t('aiSettings.budget')} helper={t('aiSettings.budgetHelp')} value={form.budget} onChangeText={(budget) => update({ budget })} keyboardType="decimal-pad" editable={!inactive} maxLength={12} />
        <FieldError error={errors.budget} />
      </Card>

      <Card>
        <AppText role="cardTitle" accessibilityRole="header">{t('aiSettings.sharing')}</AppText>
        {CATEGORIES.map((c) => (
          <SwitchRow
            key={c.key}
            testID={`aiSettings.category.${c.id}`}
            label={t(`aiSettings.category.${c.id}`)}
            value={form.categories[c.key]}
            disabled={inactive}
            onChange={(on) => update({ categories: { ...form.categories, [c.key]: on } })}
          />
        ))}
        {/* Fixed, not a switch (FR-AI-013). */}
        <View testID="aiSettings.neverShared" accessible accessibilityLabel={t('aiSettings.neverShared')} style={styles.fixedRow}>
          <AppText>{'🔒'}</AppText>
          <AppText style={styles.switchText}>{t('aiSettings.neverShared')}</AppText>
        </View>
      </Card>

      <Card>
        <AppText testID="aiSettings.usage">{t(usage.key, Object.fromEntries(Object.entries(usage.params).map(([k, v]) => [k, isolate(v)])))}</AppText>
      </Card>

      <Button testID="aiSettings.save" variant="secondary" label={t('aiSettings.save')} busyLabel={t('common.saving')} busy={busy} disabled={offline || noProviders} onPress={() => void save()} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  switchRow: { minHeight: touch.preferred, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  switchText: { flex: 1 },
  off: { opacity: 0.6 },
  fixedRow: { minHeight: touch.preferred, flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
