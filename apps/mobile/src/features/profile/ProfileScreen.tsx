// My profile (US-071, US-072; design.md §4.16). User ID, role, and madrasa are read-only text. Display name and
// email are editable; changing the email asks for the current password (DEC-B69). Changing the password needs the
// current one and signs out other devices (F01-AC28). Owners/Admins can get new recovery codes (F01-AC32).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TWO_FACTOR_ROLES, type Locale, type MeResponse, type RecoveryCodesResponse } from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { LanguagePicker } from '../../components/LanguagePicker.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { colors } from '../../theme/tokens.ts';
import { RecoveryCodesView } from '../auth/TwoFactorSetupScreen.tsx';

type Status = { tone: 'error' | 'success'; text: string } | null;

function useForm() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setStatus(null);
    setFields({});
    try {
      setStatus({ tone: 'success', text: await action() });
      return true;
    } catch (err) {
      const keys = errorKeys(err);
      if (keys.form) setStatus({ tone: 'error', text: t(keys.form) });
      setFields(Object.fromEntries(Object.entries(keys.fields).map(([f, k]) => [f, t(k)])));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, status, fields, run };
}

export function ProfileScreen({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const { session } = useSession();

  const [displayName, setDisplayName] = useState(me.displayName);
  const [email, setEmail] = useState(me.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const details = useForm();
  const emailChanged = (email.trim() || null) !== me.email;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const password = useForm();

  const [authCode, setAuthCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const security = useForm();

  const saveDetails = () =>
    details.run(async () => {
      const body: Record<string, unknown> = {};
      if (displayName.trim() !== me.displayName) body.displayName = displayName.trim();
      if (emailChanged) {
        body.email = email.trim() || null;
        body.currentPassword = emailPassword;
      }
      if (Object.keys(body).length) {
        await session.authorized('/me', { method: 'PATCH', body });
        await session.reloadMe();
      }
      setEmailPassword('');
      return t('profile.saved');
    });

  const changePassword = async () => {
    const ok = await password.run(async () => {
      await session.authorized('/me/password', { body: { currentPassword, newPassword } });
      return t('profile.passwordChanged');
    });
    setCurrentPassword('');
    if (ok) setNewPassword('');
  };

  const regenerate = async () => {
    await security.run(async () => {
      const result = await session.authorized<RecoveryCodesResponse>('/me/two-factor/recovery-codes', { body: { code: authCode.trim() } });
      setCodes(result.recoveryCodes);
      return t('profile.newCodes');
    });
    setAuthCode('');
  };

  // The language choice is also kept on the account, so it follows the user to other devices (FR-AUTH-005).
  const saveLocale = (preferredLocale: Locale) => {
    void session.authorized('/me', { method: 'PATCH', body: { preferredLocale } }).catch(() => undefined);
  };

  return (
    <AppScreen title={t('profile.title')} testID="profile.screen">
      <Card>
        <ReadOnly label={t('profile.userId')} value={me.loginId} testID="profile.userId" ltr />
        <ReadOnly label={t('profile.role')} value={t(`roles.${me.role}`)} testID="profile.role" />
        <ReadOnly label={t('profile.madrasa')} value={me.organization.name} testID="profile.madrasa" />
        <AppText role="helper" color={colors.textSecondary}>
          {t('profile.readOnlyNote')}
        </AppText>
      </Card>

      <Card>
        {details.status ? <Notice tone={details.status.tone} testID={`profile.status.${details.status.tone}`}>{details.status.text}</Notice> : null}
        <Field testID="profile.displayName" label={t('profile.displayName')} value={displayName} onChangeText={setDisplayName} error={details.fields.displayName} maxLength={100} />
        <Field
          testID="profile.email"
          label={`${t('profile.email')} (${t('common.optional')})`}
          value={email}
          onChangeText={setEmail}
          error={details.fields.email}
          keyboardType="email-address"
          autoComplete="email"
          maxLength={254}
        />
        {emailChanged ? (
          <Field
            testID="profile.emailPassword"
            label={t('profile.currentPassword')}
            helper={t('profile.emailNeedsPassword')}
            value={emailPassword}
            onChangeText={setEmailPassword}
            error={details.fields.currentPassword}
            secure
            autoComplete="password"
            maxLength={128}
          />
        ) : null}
        <Button testID="profile.save" label={t('profile.save')} busyLabel={t('common.saving')} busy={details.busy} onPress={() => void saveDetails()} />
      </Card>

      <Card>
        <AppText role="cardTitle">{t('profile.changePasswordTitle')}</AppText>
        {password.status ? <Notice tone={password.status.tone} testID={`profile.passwordStatus.${password.status.tone}`}>{password.status.text}</Notice> : null}
        <Field
          testID="profile.currentPassword"
          label={t('profile.currentPassword')}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          error={password.fields.currentPassword}
          secure
          autoComplete="password"
          maxLength={128}
        />
        <Field
          testID="profile.newPassword"
          label={t('profile.newPassword')}
          helper={t('password.policy')}
          value={newPassword}
          onChangeText={setNewPassword}
          error={password.fields.newPassword}
          secure
          autoComplete="new-password"
          maxLength={128}
        />
        <Button testID="profile.changePassword" variant="secondary" label={t('profile.changePassword')} busyLabel={t('common.saving')} busy={password.busy} onPress={() => void changePassword()} />
      </Card>

      {TWO_FACTOR_ROLES.includes(me.role) ? (
        <Card>
          <AppText role="cardTitle">{t('profile.securityTitle')}</AppText>
          <AppText>{`✓ ${t('profile.twoFactorOn')}`}</AppText>
          {security.status ? <Notice tone={security.status.tone} testID={`profile.securityStatus.${security.status.tone}`}>{security.status.text}</Notice> : null}
          {codes ? (
            <RecoveryCodesView title={t('profile.newCodes')} codes={codes} onDone={() => setCodes(null)} />
          ) : (
            <>
              <AppText role="helper" color={colors.textSecondary}>
                {t('profile.regenerateHelp')}
              </AppText>
              <Field testID="profile.authCode" label={t('profile.authCode')} value={authCode} onChangeText={setAuthCode} keyboardType="number-pad" maxLength={6} />
              <Button testID="profile.regenerate" variant="secondary" label={t('profile.regenerate')} busy={security.busy} onPress={() => void regenerate()} />
            </>
          )}
        </Card>
      ) : null}

      <LanguagePicker onChange={saveLocale} />
    </AppScreen>
  );
}

function ReadOnly({ label, value, testID, ltr = false }: { label: string; value: string; testID: string; ltr?: boolean }) {
  return (
    <>
      <AppText role="helper" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText testID={testID} latin={ltr}>
        {value}
      </AppText>
    </>
  );
}
