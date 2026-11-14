// Session-expired prompt (F01-AC6; design.md §4.13, §8). Shown in place of every data screen once the server
// refuses the session. Nothing stored on the device is removed; signing in again resumes. F12: the count of
// changes waiting to sync is shown, and sign-out warns first while any remain (F12-AC10).
import { useTranslation } from 'react-i18next';
import { AppScreen, Button, Notice } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';
import { SignInForm } from './SignInForm.tsx';

export function SessionExpiredScreen({ loginId }: { loginId: string | null }) {
  const { t } = useTranslation();
  const sync = useSync();
  return (
    <AppScreen title={t('sessionExpired.title')} testID="sessionExpired.screen">
      <Notice tone="info" testID="sessionExpired.notice">
        {t('sessionExpired.body')}
      </Notice>
      {sync.unsynced > 0 ? (
        <Notice tone="info" testID="sessionExpired.pending">
          {t('sessionExpired.pending', { count: sync.unsynced })}
        </Notice>
      ) : null}
      <SignInForm initialLoginId={loginId} />
      <Button testID="sessionExpired.signOut" variant="tertiary" label={t('more.signOut')} onPress={sync.requestSignOut} />
    </AppScreen>
  );
}
