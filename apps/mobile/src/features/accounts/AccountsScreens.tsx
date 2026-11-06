// Account management for Owner/Admin (US-003, US-004, US-005, F01-AC24, AC26, AC33; design.md §13 "design gap",
// built from FormField and §5.11 dialogs). Online only. The server decides every permission; the UI only hides
// actions that would certainly be refused.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  CREATABLE_ROLES,
  type AccountListResponse,
  type AccountResponse,
  type CreatableRole,
  type LoginIdSuggestionResponse,
  type MeResponse,
} from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { useLocale } from '../../i18n/LocaleContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { colors, radius, space, touch } from '../../theme/tokens.ts';

export function AccountsScreen({ onAdd, onOpen }: { onAdd: () => void; onOpen: (account: AccountResponse) => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [items, setItems] = useState<AccountResponse[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (next: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await session.authorized<AccountListResponse>(`/accounts?page=${next}`);
        setItems((prev) => (next === 1 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
        setPage(next);
      } catch (err) {
        setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
      } finally {
        setLoading(false);
      }
    },
    [session, t],
  );

  // Reload whenever the list comes back into view, e.g. after creating an account.
  useFocusEffect(
    useCallback(() => {
      void load(1);
    }, [load]),
  );

  return (
    <AppScreen title={t('accounts.title')} testID="accounts.screen">
      <Button testID="accounts.add" label={t('accounts.add')} onPress={onAdd} />
      {error ? (
        <>
          <Notice tone="error" testID="accounts.error">{error}</Notice>
          <Button testID="accounts.retry" variant="secondary" label={t('common.retry')} onPress={() => void load(1)} />
        </>
      ) : null}
      {!loading && !error && items.length === 0 ? <AppText color={colors.textSecondary}>{t('accounts.empty')}</AppText> : null}
      {items.map((account) => (
        <Pressable key={account.id} testID={`accounts.item.${account.loginId}`} accessibilityRole="button" onPress={() => onOpen(account)} style={styles.row}>
          <AppText role="cardTitle">{account.displayName}</AppText>
          <AppText color={colors.textSecondary} latin>
            {account.loginId}
          </AppText>
          <AppText role="helper" color={colors.textSecondary}>
            {`${t(`roles.${account.role}`)} · ${account.status === 'ACTIVE' ? t('accounts.active') : t('accounts.deactivated')}`}
          </AppText>
        </Pressable>
      ))}
      {loading ? <AppText color={colors.textSecondary}>{t('common.loading')}</AppText> : null}
      {!loading && items.length < total ? (
        <Button testID="accounts.loadMore" variant="secondary" label={t('accounts.loadMore')} onPress={() => void load(page + 1)} />
      ) : null}
    </AppScreen>
  );
}

export function AccountCreateScreen({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [prefix, setPrefix] = useState('');
  const [loginId, setLoginId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CreatableRole>('TEACHER');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // The User ID field starts with the madrasa-code prefix (FR-AUTH-013, F01-AC24).
  useEffect(() => {
    session
      .authorized<LoginIdSuggestionResponse>('/accounts/login-id-suggestion')
      .then(({ prefix: p }) => {
        setPrefix(p);
        setLoginId((current) => current || p);
      })
      .catch(() => undefined);
  }, [session]);

  const create = async () => {
    setBusy(true);
    setFormError(null);
    setFields({});
    try {
      await session.authorized<AccountResponse>('/accounts', {
        body: { loginId: loginId.trim(), displayName: displayName.trim(), email: email.trim() || null, role, password },
      });
      onCreated();
    } catch (err) {
      const keys = errorKeys(err);
      // "User ID already in use" belongs on the User ID field.
      if (keys.form === 'errors.LOGIN_ID_TAKEN') setFields({ loginId: t(keys.form) });
      else if (keys.form) setFormError(t(keys.form));
      else setFields(Object.fromEntries(Object.entries(keys.fields).map(([f, k]) => [f, t(k)])));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={t('accounts.createTitle')} testID="accountCreate.screen">
      {formError ? <Notice tone="error" testID="accountCreate.error">{formError}</Notice> : null}
      <View style={styles.roles} accessibilityRole="radiogroup" accessibilityLabel={t('accounts.role')}>
        {CREATABLE_ROLES.map((option) => (
          <Pressable
            key={option}
            testID={`accountCreate.role.${option}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: role === option }}
            onPress={() => setRole(option)}
            style={[styles.chip, role === option ? styles.chipOn : null]}
          >
            <AppText role="button" color={role === option ? colors.brandPrimary : colors.textPrimary}>
              {`${role === option ? '✓ ' : ''}${t(`roles.${option}`)}`}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Field
        testID="accountCreate.userId"
        label={t('accounts.loginId')}
        helper={t('accounts.loginIdHelp', { prefix })}
        value={loginId}
        onChangeText={setLoginId}
        error={fields.loginId}
        maxLength={32}
      />
      <Field testID="accountCreate.name" label={t('accounts.displayName')} value={displayName} onChangeText={setDisplayName} error={fields.displayName} maxLength={100} />
      <Field
        testID="accountCreate.email"
        label={t('accounts.email')}
        helper={t('accounts.emailHelp')}
        value={email}
        onChangeText={setEmail}
        error={fields.email}
        keyboardType="email-address"
        maxLength={254}
      />
      <Field
        testID="accountCreate.password"
        label={t('accounts.password')}
        helper={t('password.policy')}
        value={password}
        onChangeText={setPassword}
        error={fields.password}
        secure
        autoComplete="new-password"
        maxLength={128}
      />
      <Button testID="accountCreate.submit" label={t('accounts.create')} busyLabel={t('common.saving')} busy={busy} onPress={() => void create()} />
    </AppScreen>
  );
}

export function AccountDetailScreen({ me, account: initial }: { me: MeResponse; account: AccountResponse }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const { locale } = useLocale();
  const [account, setAccount] = useState(initial);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Mirrors SRS §17.1 so the screen does not offer actions the server will refuse; the server still decides.
  const canManage =
    account.id !== me.id &&
    (me.role === 'OWNER' ? account.role !== 'OWNER' : ['TEACHER', 'STUDENT', 'PARENT'].includes(account.role));
  const canResetTwoFactor = me.role === 'OWNER' && account.role === 'ADMIN';

  const act = async (action: () => Promise<string>) => {
    setBusy(true);
    setStatus(null);
    setFieldError(null);
    try {
      setStatus({ tone: 'success', text: await action() });
    } catch (err) {
      const keys = errorKeys(err);
      if (keys.fields.newPassword) setFieldError(t(keys.fields.newPassword));
      else setStatus({ tone: 'error', text: t(keys.form ?? 'errors.INTERNAL') });
    } finally {
      setBusy(false);
    }
  };

  // Consequential actions are summarized and confirmed in place (design.md §5.11).
  const [pending, setPending] = useState<{ message: string; action: () => void } | null>(null);
  const confirmThen = (message: string, action: () => void) => setPending({ message, action });

  return (
    <AppScreen title={account.displayName} testID="accountDetail.screen">
      {status ? <Notice tone={status.tone} testID={`accountDetail.status.${status.tone}`}>{status.text}</Notice> : null}
      {pending ? (
        <Card>
          <AppText testID="accountDetail.confirmMessage">{pending.message}</AppText>
          <Button
            testID="accountDetail.confirm"
            variant="destructive"
            label={t('accounts.confirm')}
            onPress={() => {
              setPending(null);
              pending.action();
            }}
          />
          <Button testID="accountDetail.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => setPending(null)} />
        </Card>
      ) : null}
      <Card>
        <AppText latin>{account.loginId}</AppText>
        <AppText>{`${t(`roles.${account.role}`)} · ${account.status === 'ACTIVE' ? t('accounts.active') : t('accounts.deactivated')}`}</AppText>
        {account.email ? <AppText color={colors.textSecondary}>{account.email}</AppText> : null}
        {account.lockedUntil ? (
          <AppText color={colors.warning} testID="accountDetail.locked">
            {`⚠ ${t('accounts.lockedUntil', {
              // The app's language, with Western digits in every locale (FR-I18N-009).
              time: new Date(account.lockedUntil).toLocaleTimeString(locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', { hour: '2-digit', minute: '2-digit' }),
            })}`}
          </AppText>
        ) : null}
        {account.twoFactorEnabled ? <AppText>{`✓ ${t('accounts.twoFactorOn')}`}</AppText> : null}
      </Card>
      {canManage && account.status === 'ACTIVE' ? (
        <>
          <Card>
            <Field
              testID="accountDetail.newPassword"
              label={t('accounts.newPassword')}
              helper={t('password.policy')}
              value={newPassword}
              onChangeText={setNewPassword}
              error={fieldError}
              secure
              autoComplete="new-password"
              maxLength={128}
            />
            <Button
              testID="accountDetail.resetPassword"
              variant="secondary"
              label={t('accounts.resetPassword')}
              busy={busy}
              onPress={() =>
                void act(async () => {
                  await session.authorized(`/accounts/${account.id}/password`, { body: { newPassword } });
                  setNewPassword('');
                  return t('accounts.passwordReset');
                })
              }
            />
          </Card>
          {canResetTwoFactor ? (
            <Button
              testID="accountDetail.resetTwoFactor"
              variant="secondary"
              label={t('accounts.resetTwoFactor')}
              disabled={busy}
              onPress={() =>
                confirmThen(t('accounts.resetTwoFactorConfirm', { name: account.displayName }), () =>
                  void act(async () => {
                    await session.authorized(`/accounts/${account.id}/two-factor/reset`, { body: {} });
                    setAccount({ ...account, twoFactorEnabled: false });
                    return t('accounts.resetTwoFactorDone');
                  }),
                )
              }
            />
          ) : null}
          <Button
            testID="accountDetail.deactivate"
            variant="destructive"
            label={t('accounts.deactivate')}
            disabled={busy}
            onPress={() =>
              confirmThen(t('accounts.deactivateConfirm', { name: account.displayName }), () =>
                void act(async () => {
                  setAccount(await session.authorized<AccountResponse>(`/accounts/${account.id}/deactivate`, { body: {} }));
                  return t('accounts.deactivatedDone');
                }),
              )
            }
          />
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[1],
    minHeight: touch.preferred,
  },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
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
