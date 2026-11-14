// Shown when a stored session could not be checked at launch (no connection or a server error). The session and
// everything on the device are kept; Retry resumes it (design.md §8 "Offline"). F12: the count of changes waiting
// on this phone is shown, and sign-out warns first while any remain (F12-AC10).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, Button, Notice } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';

export function OfflineScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const sync = useSync();
  const [busy, setBusy] = useState(false);
  return (
    <AppScreen title={t('offline.title')} testID="offline.screen">
      <Notice tone="info" testID="offline.notice">
        {t('offline.body')}
      </Notice>
      {sync.unsynced > 0 ? (
        <Notice tone="info" testID="offline.pending">
          {t('offline.pending', { count: sync.unsynced })}
        </Notice>
      ) : null}
      <Button
        testID="offline.retry"
        label={t('common.retry')}
        busy={busy}
        onPress={() => {
          setBusy(true);
          void session.restore().finally(() => setBusy(false));
        }}
      />
      <Button testID="offline.signOut" variant="tertiary" label={t('more.signOut')} onPress={sync.requestSignOut} />
    </AppScreen>
  );
}
