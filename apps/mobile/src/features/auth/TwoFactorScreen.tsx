// Owner/Admin two-factor sign-in (US-072; design.md §4.2). No madrasa data is shown before this succeeds.
// Later sign-ins take an authenticator code or a recovery code (F01-AC31).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Field, Notice } from '../../components/ui.tsx';
import { colors } from '../../theme/tokens.ts';

export function TwoFactorScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!useRecovery && !/^\d{6}$/.test(code.trim())) {
      setError(t('fields.CODE_FORMAT'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await session.verifyTwoFactor(useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() });
    } catch (err) {
      setCode('');
      setError(t(errorKeys(err).form ?? 'errors.TWO_FACTOR_INVALID'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={t('twoFactor.title')} testID="twoFactor.screen">
      {error ? (
        <Notice tone="error" testID="twoFactor.error">
          {error}
        </Notice>
      ) : null}
      <AppText>{useRecovery ? t('twoFactor.recoveryCode') : t('twoFactor.intro')}</AppText>
      <Field
        testID="twoFactor.code"
        label={useRecovery ? t('twoFactor.recoveryCode') : t('twoFactor.code')}
        value={code}
        onChangeText={setCode}
        keyboardType={useRecovery ? 'default' : 'number-pad'}
        autoComplete={useRecovery ? 'off' : 'one-time-code'}
        textContentType="oneTimeCode"
        maxLength={useRecovery ? 16 : 6}
      />
      <Button testID="twoFactor.submit" label={t('twoFactor.submit')} busyLabel={t('common.loading')} busy={busy} onPress={submit} />
      <Button
        testID="twoFactor.switch"
        variant="tertiary"
        label={useRecovery ? t('twoFactor.useCode') : t('twoFactor.useRecovery')}
        onPress={() => {
          setUseRecovery((r) => !r);
          setCode('');
          setError(null);
        }}
      />
      <AppText role="helper" color={colors.textSecondary}>
        {t('twoFactor.lostDevice')}
      </AppText>
      <Button testID="twoFactor.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => void session.cancelTwoFactor()} />
    </AppScreen>
  );
}
