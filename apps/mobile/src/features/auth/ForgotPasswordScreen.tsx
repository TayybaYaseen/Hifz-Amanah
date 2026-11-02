// Forgot password (US-002; design.md §4.2): User ID → neutral confirmation → code from email + new password.
// The confirmation never says whether the User ID exists or has an email (F01-AC8).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Field, Notice } from '../../components/ui.tsx';
import { colors } from '../../theme/tokens.ts';

export function ForgotPasswordScreen({ initialLoginId, onDone }: { initialLoginId: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [loginId, setLoginId] = useState(initialLoginId ?? '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fail = (err: unknown) => {
    const keys = errorKeys(err);
    setFormError(keys.form ? t(keys.form) : null);
    setFieldErrors(Object.fromEntries(Object.entries(keys.fields).map(([f, k]) => [f, t(k)])));
  };

  const send = async () => {
    if (!loginId.trim()) {
      setFieldErrors({ loginId: t('fields.REQUIRED') });
      return;
    }
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await session.requestPasswordReset(loginId);
      setStep('confirm');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      setFieldErrors({ otp: t('fields.CODE_FORMAT') });
      return;
    }
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await session.confirmPasswordReset(loginId, otp, newPassword);
      onDone();
    } catch (err) {
      setOtp('');
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={t('reset.title')} testID="reset.screen">
      {formError ? (
        <Notice tone="error" testID="reset.error">
          {formError}
        </Notice>
      ) : null}
      {step === 'request' ? (
        <>
          <AppText>{t('reset.intro')}</AppText>
          <Field
            testID="reset.userId"
            label={t('signIn.userId')}
            value={loginId}
            onChangeText={setLoginId}
            error={fieldErrors.loginId}
            autoComplete="username"
            maxLength={64}
          />
          <Button testID="reset.send" label={t('reset.send')} busyLabel={t('reset.sending')} busy={busy} onPress={send} />
        </>
      ) : (
        <>
          <Notice tone="info" testID="reset.sent">
            {t('reset.sent')}
          </Notice>
          <AppText role="helper" color={colors.textSecondary}>
            {t('reset.noEmail')}
          </AppText>
          <Field
            testID="reset.otp"
            label={t('reset.code')}
            helper={t('reset.expiry')}
            value={otp}
            onChangeText={setOtp}
            error={fieldErrors.otp}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Field
            testID="reset.newPassword"
            label={t('reset.newPassword')}
            helper={t('password.policy')}
            value={newPassword}
            onChangeText={setNewPassword}
            error={fieldErrors.newPassword}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={128}
          />
          <Button testID="reset.submit" label={t('reset.submit')} busyLabel={t('common.saving')} busy={busy} onPress={confirm} />
          <Button testID="reset.resend" variant="tertiary" label={t('reset.resend')} disabled={busy} onPress={send} />
        </>
      )}
      <Button testID="reset.back" variant="tertiary" label={t('common.back')} onPress={onDone} />
    </AppScreen>
  );
}
