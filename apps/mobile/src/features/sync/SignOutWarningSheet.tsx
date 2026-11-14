// Sign-out warning (UI spec §4; F12-AC10, AC20; plan Q14). Every sign-out entry point calls
// useSync().requestSignOut(); this sheet opens when changes are not yet on the server. It states the count in text
// and the risk plainly, and offers "Sync now", "Cancel", and "Sign out anyway". The app never signs out on its own
// after syncing. The revoked variant deletes the locked unsent changes (F12-AC20).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Notice } from '../../components/ui.tsx';
import { ConfirmSheet } from '../../components/sync.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';

export function SignOutWarningSheet({ onOpenQueue, onSignInToSync }: { onOpenQueue: () => void; onSignInToSync?: () => void }) {
  const { t } = useTranslation();
  const sync = useSync();
  const sheet = sync.signOutSheet;
  const [syncing, setSyncing] = useState(false);
  const [afterSync, setAfterSync] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sheet) {
      setAfterSync(false);
      setSyncing(false);
      setBusy(false);
    }
  }, [sheet]);

  if (!sheet) return null;
  const revoked = sheet.variant === 'revoked';
  const close = () => sync.closeSignOutSheet();

  const syncNow = async () => {
    setSyncing(true);
    try {
      await sync.syncNow();
    } finally {
      setSyncing(false);
    }
    setAfterSync(true);
  };

  // After "Sync now", the live count decides what to show.
  const resolvedAfter = !afterSync ? null : sync.unsynced === 0 ? 'allSynced' : 'partial';

  // What happens to the workspace is decided at sign-out from the live count (review M3, workspace.signOutAction).
  const signOut = async () => {
    setBusy(true);
    await sync.signOutNow();
  };

  return (
    <ConfirmSheet visible title={revoked ? t('signOutWarning.titleRevoked') : t('signOutWarning.title')} onCancel={close} testID="signOutWarning.sheet">
      <AppText testID="signOutWarning.count" role="sectionTitle" color={colors.warning}>
        {`⚠ ${t('signOutWarning.count', { count: sync.unsynced })}`}
      </AppText>
      {revoked ? (
        <>
          <AppText>{t('signOutWarning.bodyRevoked')}</AppText>
          <Button testID="signOutWarning.cancel" variant="secondary" label={t('common.cancel')} onPress={close} />
          <Button
            testID="signOutWarning.confirmRevoked"
            variant="destructive"
            label={t('signOutWarning.confirmRevoked')}
            busy={busy}
            onPress={() => void signOut()}
          />
        </>
      ) : resolvedAfter === 'allSynced' ? (
        <>
          <Notice tone="success" testID="signOutWarning.allSynced">
            {t('signOutWarning.allSynced')}
          </Notice>
          <Button testID="signOutWarning.signOut" label={t('more.signOut')} busy={busy} onPress={() => void signOut()} />
          <Button testID="signOutWarning.cancel" variant="secondary" label={t('common.cancel')} onPress={close} />
        </>
      ) : (
        <>
          <AppText>{t('signOutWarning.body')}</AppText>
          <AppText color={colors.textSecondary}>{t('signOutWarning.advice')}</AppText>
          {resolvedAfter === 'partial' ? (
            <View style={{ gap: space[2] }}>
              <Notice tone="error">{t('signOutWarning.partial')}</Notice>
              <Button
                testID="signOutWarning.openQueue"
                variant="secondary"
                label={t('signOutWarning.openQueue')}
                onPress={() => {
                  close();
                  onOpenQueue();
                }}
              />
            </View>
          ) : null}
          {sheet.variant === 'expired' ? (
            <Button
              testID="signOutWarning.syncNow"
              label={t('signOutWarning.signInToSync')}
              onPress={() => {
                close();
                onSignInToSync?.();
              }}
            />
          ) : (
            <View style={{ gap: space[1] }}>
              <Button
                testID="signOutWarning.syncNow"
                label={t('sync.syncNow')}
                busyLabel={t('sync.syncingNow')}
                busy={syncing}
                disabled={!sync.online || sync.upgradeRequired}
                onPress={() => void syncNow()}
              />
              {!sync.online ? (
                <AppText role="helper" color={colors.textSecondary}>
                  {t('signOutWarning.offlineHelp')}
                </AppText>
              ) : null}
            </View>
          )}
          <Button testID="signOutWarning.cancel" variant="secondary" label={t('common.cancel')} onPress={close} />
          <Button
            testID="signOutWarning.signOutAnyway"
            variant="destructive"
            label={t('signOutWarning.signOutAnyway')}
            busy={busy}
            onPress={() => void signOut()}
          />
        </>
      )}
    </ConfirmSheet>
  );
}
