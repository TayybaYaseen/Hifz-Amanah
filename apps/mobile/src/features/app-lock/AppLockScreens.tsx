// App lock screens (UI spec §5; F12-AC18, NFR-OFF-011; plan Q12): setup (required for Owner/Admin, optional for
// Teacher, reset after re-authentication), unlock (PIN, optional fingerprint, 5 tries), and the locked-out
// sign-in (User ID + password online; two-factor follows for Owner/Admin). Nothing on the phone is purged here.
import { useEffect, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorKeys } from '../../api/errors.ts';
import { ApiFailure } from '../../api/client.ts';
import { useAppLock } from '../../app-lock/AppLockContext.tsx';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Field, Notice } from '../../components/ui.tsx';
import { ConfirmSheet } from '../../components/sync.tsx';
import { isolate } from '../../i18n/direction.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { PinInput } from './PinInput.tsx';

export function AppLockSetupScreen({ variant }: { variant: 'required' | 'optional' | 'reset' }) {
  const { t } = useTranslation();
  const lock = useAppLock();
  const [step, setStep] = useState<'enter' | 'confirm' | 'biometric'>('enter');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSkip = variant === 'optional' || (variant === 'reset' && lock.role === 'TEACHER');

  // Required setup has no way back.
  useEffect(() => {
    if (variant !== 'required') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [variant]);

  const onComplete = async (value: string) => {
    if (step === 'enter') {
      setFirst(value);
      setPin('');
      setError(null);
      setStep('confirm');
      return;
    }
    if (value !== first) {
      setError(t('appLock.setup.mismatch'));
      setFirst('');
      setPin('');
      setStep('enter');
      return;
    }
    if (lock.fingerprintAvailable) {
      setStep('biometric');
      return;
    }
    setBusy(true);
    await lock.setPin(value);
  };

  if (step === 'biometric') {
    return (
      <AppScreen title={t('appLock.biometric.title')} testID="appLock.setup.screen">
        <AppText>{t('appLock.biometric.body')}</AppText>
        <Button
          testID="appLock.biometric.enable"
          label={t('appLock.biometric.enable')}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            await lock.setPin(first);
            await lock.setBiometric(true);
          }}
        />
        <Button
          testID="appLock.biometric.skip"
          variant="secondary"
          label={t('appLock.setup.skip')}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            await lock.setPin(first);
          }}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={variant === 'reset' ? t('appLock.setup.newPinTitle') : t('appLock.setup.title')} testID="appLock.setup.screen">
      <AppText>{variant === 'required' ? t('appLock.setup.requiredIntro') : t('appLock.setup.optionalIntro')}</AppText>
      <AppText color={colors.textSecondary}>{t('appLock.setup.lockAfter')}</AppText>
      {error ? (
        <Notice tone="error" testID="appLock.setup.error">
          {error}
        </Notice>
      ) : null}
      <PinInput
        key={step}
        testID="appLock.setup.pin"
        label={step === 'enter' ? t('appLock.setup.enterPin') : t('appLock.setup.confirmPin')}
        value={pin}
        onChange={setPin}
        onComplete={(value) => void onComplete(value)}
        disabled={busy}
      />
      {canSkip ? <Button testID="appLock.setup.skip" variant="tertiary" label={t('appLock.setup.skip')} onPress={() => void lock.skipSetup()} /> : null}
    </AppScreen>
  );
}

export function AppLockScreen({ loginId }: { loginId: string }) {
  const { t } = useTranslation();
  const lock = useAppLock();
  const sync = useSync();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [forgot, setForgot] = useState(false);
  const prompted = useRef(false);

  // Back never passes the lock: it sends the app to the background.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  const fingerprint = async () => {
    const ok = await lock.unlockWithFingerprint({ promptMessage: t('appLock.biometric.prompt'), cancelLabel: t('appLock.biometric.usePin') });
    if (!ok) setMessage(t('appLock.biometric.failed'));
  };

  useEffect(() => {
    if (lock.status?.biometric && !prompted.current) {
      prompted.current = true;
      void fingerprint();
    }
  }, [lock.status?.biometric]);

  const submit = async (value: string) => {
    setChecking(true);
    const result = await lock.unlockWithPin(value);
    setChecking(false);
    setPin('');
    if (result.ok || result.lockedOut) return;
    setMessage(result.remaining === 1 ? t('appLock.unlock.lastTry') : t('appLock.unlock.wrongPin', { count: result.remaining }));
  };

  return (
    <AppScreen testID="appLock.unlock.screen">
      <AppText role="screenTitle" color={colors.brandPrimary}>
        {t('common.appName')}
      </AppText>
      <AppText role="sectionTitle" accessibilityRole="header">
        {t('appLock.unlock.title')}
      </AppText>
      <AppText color={colors.textSecondary}>{t('appLock.unlock.account', { loginId: isolate(loginId) })}</AppText>
      {message ? (
        <Notice tone="error" testID="appLock.unlock.error">
          {message}
        </Notice>
      ) : null}
      <PinInput testID="appLock.unlock.pin" label={t('appLock.unlock.enterPin')} value={pin} onChange={setPin} onComplete={(v) => void submit(v)} disabled={checking} />
      {lock.status?.biometric ? (
        <Button testID="appLock.unlock.fingerprint" variant="secondary" label={t('appLock.unlock.useFingerprint')} onPress={() => void fingerprint()} />
      ) : null}
      <Button testID="appLock.unlock.forgot" variant="tertiary" label={t('appLock.unlock.forgot')} onPress={() => setForgot(true)} />
      <Button testID="appLock.unlock.signOut" variant="tertiary" label={t('more.signOut')} onPress={sync.requestSignOut} />
      <ConfirmSheet visible={forgot} title={t('appLock.forgot.title')} onCancel={() => setForgot(false)}>
        <AppText>{t('appLock.forgot.body')}</AppText>
        <Button
          testID="appLock.forgot.confirm"
          label={t('appLock.forgot.confirm')}
          onPress={() => {
            setForgot(false);
            void lock.forgotPin();
          }}
        />
        <Button variant="secondary" label={t('common.cancel')} onPress={() => setForgot(false)} />
      </ConfirmSheet>
    </AppScreen>
  );
}

export function AppLockSignInScreen({ loginId, forgot }: { loginId: string; forgot: boolean }) {
  const { t } = useTranslation();
  const lock = useAppLock();
  const sync = useSync();
  const { session } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password) {
      setError(t('fields.REQUIRED'));
      return;
    }
    setBusy(true);
    setError(null);
    lock.expectReauth();
    try {
      await session.signIn(loginId, password);
    } catch (err) {
      setPassword('');
      setError(err instanceof ApiFailure && err.code === 'NETWORK' ? t('appLock.lockedOut.offline') : t(errorKeys(err).form ?? 'errors.INVALID_CREDENTIALS'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={t('appLock.lockedOut.title')} testID="appLock.lockedOut.screen">
      <Notice tone="info">{forgot ? t('appLock.lockedOut.forgotBody') : t('appLock.lockedOut.body')}</Notice>
      {!sync.online ? <Notice tone="info">{t('appLock.lockedOut.offline')}</Notice> : null}
      {error ? (
        <Notice tone="error" testID="signin.error">
          {error}
        </Notice>
      ) : null}
      <View style={{ gap: space[1] }}>
        <AppText role="helper" color={colors.textSecondary}>
          {t('signIn.userId')}
        </AppText>
        <AppText latin testID="appLock.lockedOut.userId">
          {loginId}
        </AppText>
      </View>
      <Field
        testID="signin.password"
        label={t('signIn.password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="password"
        textContentType="password"
        maxLength={128}
      />
      <Button testID="signin.submit" label={t('signIn.submit')} busyLabel={t('signIn.submitting')} busy={busy} onPress={() => void submit()} />
      <Button testID="appLock.lockedOut.signOut" variant="tertiary" label={t('more.signOut')} onPress={sync.requestSignOut} />
    </AppScreen>
  );
}
