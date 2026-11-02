// More menu (design.md §3.2). Accounts is shown to Owner/Admin only; the server enforces it regardless.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@hifz/contracts';
import { useSession } from '../../auth/SessionContext.tsx';
import { AppScreen, Button } from '../../components/ui.tsx';

export function MoreScreen({ me, onProfile, onAccounts }: { me: MeResponse; onProfile: () => void; onAccounts: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const staff = me.role === 'OWNER' || me.role === 'ADMIN';
  return (
    <AppScreen testID="more.screen">
      <Button testID="more.profile" variant="secondary" label={t('more.profile')} onPress={onProfile} />
      {staff ? <Button testID="more.accounts" variant="secondary" label={t('more.accounts')} onPress={onAccounts} /> : null}
      {/* TODO(F12): warn before signing out while changes are waiting to sync (design.md §4.13). */}
      <Button
        testID="settings.signOut"
        variant="destructive"
        label={t('more.signOut')}
        busy={busy}
        onPress={() => {
          setBusy(true);
          void session.signOut();
        }}
      />
    </AppScreen>
  );
}
