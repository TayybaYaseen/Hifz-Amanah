// More menu (design.md §3.2). Accounts is shown to Owner/Admin only; the server enforces it regardless.
// Madrasa settings is shown to everyone: editable for Owner/Admin, read-only for other roles (F02-AC4).
// F03: Classes and Students for Owner/Admin/Teacher (a Teacher sees assigned classes only).
// F12: Sync queue for Teacher/Admin/Owner; sign-out warns first while changes wait to sync (F12-AC10).
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@hifz/contracts';
import { AppScreen, Button } from '../../components/ui.tsx';
import { useSync } from '../../sync/SyncContext.tsx';

export function MoreScreen({ me, onProfile, onAccounts, onWorkspace, onClasses, onStudents, onSyncQueue }: {
  me: MeResponse;
  onProfile: () => void;
  onAccounts: () => void;
  onWorkspace: () => void;
  onClasses: () => void;
  onStudents: () => void;
  onSyncQueue: () => void;
}) {
  const { t } = useTranslation();
  const sync = useSync();
  const staff = me.role === 'OWNER' || me.role === 'ADMIN';
  const roster = staff || me.role === 'TEACHER';
  return (
    <AppScreen testID="more.screen">
      <Button testID="more.profile" variant="secondary" label={t('more.profile')} onPress={onProfile} />
      {roster ? <Button testID="more.classes" variant="secondary" label={t('more.classes')} onPress={onClasses} /> : null}
      {roster ? <Button testID="more.students" variant="secondary" label={t('more.students')} onPress={onStudents} /> : null}
      <Button testID="more.workspace" variant="secondary" label={t('more.workspace')} onPress={onWorkspace} />
      {staff ? <Button testID="more.accounts" variant="secondary" label={t('more.accounts')} onPress={onAccounts} /> : null}
      {sync.enabled ? <Button testID="more.syncQueue" variant="secondary" label={t('more.syncQueue')} onPress={onSyncQueue} /> : null}
      <Button testID="settings.signOut" variant="destructive" label={t('more.signOut')} onPress={sync.requestSignOut} />
    </AppScreen>
  );
}
