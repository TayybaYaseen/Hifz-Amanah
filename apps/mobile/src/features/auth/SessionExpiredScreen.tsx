// Session-expired prompt (F01-AC6; design.md §4.13, §8). Shown in place of every data screen once the server
// refuses the session. Nothing stored on the device is removed; signing in again resumes.
import { useTranslation } from 'react-i18next';
import { AppScreen, Button, Notice } from '../../components/ui.tsx';
import { useSession } from '../../auth/SessionContext.tsx';
import { SignInForm } from './SignInForm.tsx';

export function SessionExpiredScreen({ loginId }: { loginId: string | null }) {
  const { t } = useTranslation();
  const { session } = useSession();
  // TODO(F12): show the number of changes waiting to sync, and warn before signing out while any remain.
  return (
    <AppScreen title={t('sessionExpired.title')} testID="sessionExpired.screen">
      <Notice tone="info" testID="sessionExpired.notice">
        {t('sessionExpired.body')}
      </Notice>
      <SignInForm initialLoginId={loginId} />
      <Button testID="sessionExpired.signOut" variant="tertiary" label={t('more.signOut')} onPress={() => void session.signOut()} />
    </AppScreen>
  );
}
