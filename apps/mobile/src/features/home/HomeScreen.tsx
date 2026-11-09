// Role home (F01-AC1, AC17). F01 shows who is signed in and in which madrasa; the operational cards of
// design.md §4.4 (classes, entries, homework) arrive with their features. No invented metrics are shown.
// F12: Teacher/Admin/Owner see the sync banner (design.md §5.9) and, once, the changes kept from a previous
// sign-in (plan Q14). Students and Parents are online-only and never see sync UI.
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@hifz/contracts';
import { AppScreen, AppText, Button, Card, Notice } from '../../components/ui.tsx';
import { SyncBanner } from '../../components/sync.tsx';
import { isolate } from '../../i18n/direction.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors } from '../../theme/tokens.ts';

export function HomeScreen({ me, onMore, onSyncQueue, onAttendance }: { me: MeResponse; onMore: () => void; onSyncQueue: () => void; onAttendance: () => void }) {
  const { t } = useTranslation();
  const sync = useSync();
  return (
    <AppScreen testID="home.screen">
      {sync.enabled || sync.loadError ? <SyncBanner banner={sync.banner} onPress={onSyncQueue} loadError={sync.loadError} /> : null}
      {sync.restoredCount ? (
        <Notice tone="info" testID="sync.restored">
          {t('sync.restored', { count: sync.restoredCount })}
        </Notice>
      ) : null}
      <Card>
        <AppText role="screenTitle" color={colors.brandDeep} accessibilityRole="header" testID="home.greeting">
          {t('home.greeting', { name: me.displayName })}
        </AppText>
        <AppText color={colors.textSecondary} testID={`home.role.${me.role}`}>
          {/* The madrasa name may be in Arabic or Latin script; isolate it so the line reads right in every locale. */}
          {t('home.workspace', { role: t(`roles.${me.role}`), madrasa: isolate(me.organization.name) })}
        </AppText>
      </Card>
      {/* F04: Bulk Entry, for the roles that record attendance (Teacher, Admin, Owner). */}
      {sync.enabled ? <Button testID="nav.attendance" label={t('home.attendance')} onPress={onAttendance} /> : null}
      <Button testID="nav.more" variant="secondary" label={t('home.more')} onPress={onMore} />
    </AppScreen>
  );
}
