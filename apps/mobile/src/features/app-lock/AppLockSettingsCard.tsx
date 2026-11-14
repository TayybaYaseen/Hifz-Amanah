// App lock on My profile (UI spec §5.4; design.md §4.16). Owner/Admin: always on, no "Turn off". Teacher: turn
// on or off (with the current PIN). Everyone: change PIN and the fingerprint shortcut.
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLock } from '../../app-lock/AppLockContext.tsx';
import { lockRequiredFor } from '../../app-lock/lock.ts';
import { AppText, Button, Card, Notice } from '../../components/ui.tsx';
import { colors, space, touch } from '../../theme/tokens.ts';
import { PinInput } from './PinInput.tsx';

type Flow = null | 'turnOn' | 'turnOff' | 'change';
type Step = 'current' | 'new' | 'confirm';

export function AppLockSettingsCard() {
  const { t } = useTranslation();
  const lock = useAppLock();
  const [flow, setFlow] = useState<Flow>(null);
  const [step, setStep] = useState<Step>('new');
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  if (!lock.role || !lock.status) return null;
  const status = lock.status;
  const required = lockRequiredFor(lock.role);

  const start = (next: Flow) => {
    setFlow(next);
    setStep(next === 'turnOn' ? 'new' : 'current');
    setPin('');
    setFirst('');
    setMessage(null);
  };

  const onComplete = async (value: string) => {
    setPin('');
    if (step === 'current') {
      const result = flow === 'turnOff' ? await lock.disable(value) : await lock.checkPin(value);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.lockedOut ? t('appLock.lockedOut.body') : t('appLock.unlock.wrongPin', { count: result.remaining }) });
        if (result.lockedOut) setFlow(null);
        return;
      }
      if (flow === 'turnOff') {
        setFlow(null);
        setMessage({ tone: 'success', text: t('appLock.settings.turnedOff') });
        return;
      }
      setStep('new');
      return;
    }
    if (step === 'new') {
      setFirst(value);
      setStep('confirm');
      return;
    }
    if (value !== first) {
      setMessage({ tone: 'error', text: t('appLock.setup.mismatch') });
      setStep('new');
      return;
    }
    await lock.setPin(value);
    setFlow(null);
    setMessage({ tone: 'success', text: flow === 'change' ? t('appLock.settings.pinChanged') : t('appLock.setup.done') });
  };

  const label = step === 'current' ? t('appLock.settings.currentPin') : step === 'new' ? t('appLock.setup.enterPin') : t('appLock.setup.confirmPin');

  return (
    <Card>
      <View testID="profile.appLock" style={{ gap: space[2] }}>
        <AppText role="cardTitle" accessibilityRole="header">
          {t('appLock.settings.title')}
        </AppText>
        <AppText color={colors.textSecondary}>
          {status.configured ? (status.biometric ? t('appLock.settings.onBiometric') : t('appLock.settings.on')) : t('appLock.settings.off')}
        </AppText>
        {required ? (
          <AppText role="helper" color={colors.textSecondary}>
            {t('appLock.settings.required')}
          </AppText>
        ) : null}
      </View>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {flow ? (
        <>
          <PinInput key={`${flow}.${step}`} testID="profile.appLock.pin" label={label} value={pin} onChange={setPin} onComplete={(v) => void onComplete(v)} />
          <Button variant="tertiary" label={t('common.cancel')} onPress={() => setFlow(null)} />
        </>
      ) : status.configured ? (
        <>
          <Button testID="profile.appLock.changePin" variant="secondary" label={t('appLock.settings.changePin')} onPress={() => start('change')} />
          {!required ? <Button testID="profile.appLock.turnOff" variant="tertiary" label={t('appLock.settings.turnOff')} onPress={() => start('turnOff')} /> : null}
          <Pressable
            testID="profile.appLock.fingerprint"
            accessibilityRole="switch"
            accessibilityState={{ checked: status.biometric, disabled: !lock.fingerprintAvailable }}
            disabled={!lock.fingerprintAvailable}
            onPress={() => void lock.setBiometric(!status.biometric)}
            style={{ minHeight: touch.preferred, flexDirection: 'row', alignItems: 'center', gap: space[3] }}
          >
            <AppText style={{ flex: 1 }}>{t('appLock.unlock.useFingerprint')}</AppText>
            <Switch value={status.biometric} disabled={!lock.fingerprintAvailable} onValueChange={(v) => void lock.setBiometric(v)} />
          </Pressable>
          {!lock.fingerprintAvailable ? (
            <AppText role="helper" color={colors.textSecondary}>
              {t('appLock.settings.noFingerprint')}
            </AppText>
          ) : null}
        </>
      ) : (
        <Button testID="profile.appLock.turnOn" variant="secondary" label={t('appLock.settings.turnOn')} onPress={() => start('turnOn')} />
      )}
    </Card>
  );
}
