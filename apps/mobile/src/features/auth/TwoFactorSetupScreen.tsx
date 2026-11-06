// First Owner/Admin sign-in: set up an authenticator (QR code plus a manual key), then see 10 recovery codes and
// confirm they are saved before any madrasa data is shown (F01-AC30; design.md §4.2).
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import type { TwoFactorSetupResponse } from '@hifz/contracts';
import { errorKeys } from '../../api/errors.ts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, AppText, Button, Card, Field, Notice } from '../../components/ui.tsx';
import { colors, radius, space, touch } from '../../theme/tokens.ts';

export function TwoFactorSetupScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setSetup(await session.startTwoFactorSetup());
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
  };

  // Runs once per challenge; the session manager owns the challenge token.
  useEffect(() => {
    void load();
  }, []);

  const confirm = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('fields.CODE_FORMAT'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await session.confirmTwoFactorSetup(code.trim());
    } catch (err) {
      setCode('');
      setError(t(errorKeys(err).form ?? 'errors.TWO_FACTOR_INVALID'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title={t('twoFactorSetup.title')} testID="twoFactorSetup.screen">
      <AppText>{t('twoFactorSetup.intro')}</AppText>
      {error ? (
        <Notice tone="error" testID="twoFactorSetup.error">
          {error}
        </Notice>
      ) : null}
      {setup ? (
        <>
          <Card>
            <AppText>{t('twoFactorSetup.scan')}</AppText>
            <View style={styles.qr} accessible accessibilityLabel={t('twoFactorSetup.qrLabel')}>
              <QRCode value={setup.otpauthUri} size={200} />
            </View>
            <AppText role="helper" color={colors.textSecondary}>
              {t('twoFactorSetup.key')}
            </AppText>
            {/* The key is Latin base32: always left to right, whatever the UI direction. */}
            <AppText testID="twoFactorSetup.key" latin style={{ letterSpacing: 1 }}>
              {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
            </AppText>
            <Button
              testID="twoFactorSetup.copyKey"
              variant="secondary"
              label={t('common.copy')}
              onPress={() => void Clipboard.setStringAsync(setup.secret)}
            />
          </Card>
          <AppText>{t('twoFactorSetup.enterCode')}</AppText>
          <Field
            testID="twoFactorSetup.code"
            label={t('twoFactor.code')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button testID="twoFactorSetup.submit" label={t('twoFactorSetup.submit')} busyLabel={t('common.loading')} busy={busy} onPress={confirm} />
        </>
      ) : error ? (
        <Button testID="twoFactorSetup.retry" variant="secondary" label={t('common.retry')} onPress={() => void load()} />
      ) : (
        <AppText color={colors.textSecondary}>{t('common.loading')}</AppText>
      )}
      <Button testID="twoFactorSetup.cancel" variant="tertiary" label={t('common.cancel')} onPress={() => void session.cancelTwoFactor()} />
    </AppScreen>
  );
}

/** Shows recovery codes once. `onDone` is offered only after the user confirms they saved them. */
export function RecoveryCodesView({ title, codes, onDone }: { title: string; codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <AppText role="sectionTitle">{title}</AppText>
      <AppText>{t('twoFactorSetup.codesIntro')}</AppText>
      <Card>
        {codes.map((code, i) => (
          <AppText key={code} testID={`recoveryCodes.code.${i}`} latin style={{ fontSize: 18, lineHeight: 26 }}>
            {`${i + 1}. ${code}`}
          </AppText>
        ))}
      </Card>
      <Button
        testID="recoveryCodes.copy"
        variant="secondary"
        label={t('twoFactorSetup.copyCodes')}
        onPress={() => void Clipboard.setStringAsync(codes.join('\n'))}
      />
      <Pressable
        testID="recoveryCodes.saved"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: saved }}
        onPress={() => setSaved((s) => !s)}
        style={styles.check}
      >
        <View style={[styles.box, saved ? styles.boxOn : null]}>
          <AppText color={colors.textOnPrimary}>{saved ? '✓' : ' '}</AppText>
        </View>
        <AppText style={{ flex: 1 }}>{t('twoFactorSetup.saved')}</AppText>
      </Pressable>
      <Button testID="recoveryCodes.continue" label={t('common.continue')} disabled={!saved} onPress={onDone} />
    </>
  );
}

export function RecoveryCodesScreen({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const { session } = useSession();
  return (
    <AppScreen testID="recoveryCodes.screen">
      <RecoveryCodesView title={t('twoFactorSetup.codesTitle')} codes={codes} onDone={() => void session.acknowledgeRecoveryCodes()} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  qr: { alignItems: 'center', padding: space[4], backgroundColor: colors.surface },
  check: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touch.preferred },
  box: {
    width: 28,
    height: 28,
    borderRadius: radius.input / 2,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.brandPrimary },
});
