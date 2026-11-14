// Workspace locked: access revoked (UI spec §6; F12-AC14, AC20). Replaces every data screen. Syncing has stopped,
// synced data was purged, and the unsent changes are listed read-only with the date they will be deleted.
// The only action is Sign out (through the revoked sign-out sheet when changes remain).
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppScreen, AppText, Button, Card, Notice } from '../../components/ui.tsx';
import { useFormatDateTime, useItemLabel } from '../../components/sync.tsx';
import { isolate } from '../../i18n/direction.ts';
import { DAY_MS, HELD_UNSYNCED_DAYS } from '../../sync/retention.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, space } from '../../theme/tokens.ts';
import { QueueItemCard } from './QueueItemCard.tsx';
import { Skeleton } from './SyncQueueScreen.tsx';

export function WorkspaceLockedScreen({ madrasa }: { madrasa: string | null }) {
  const { t } = useTranslation();
  const sync = useSync();
  const formatTime = useFormatDateTime();
  const itemLabel = useItemLabel(sync.registry);
  const unsent = sync.items.filter((i) => i.status.state !== 'SYNCED');
  const revokedAt = sync.meta?.revokedAt ?? null;
  const purgeDate = revokedAt ? new Date(Date.parse(revokedAt) + HELD_UNSYNCED_DAYS * DAY_MS).toISOString() : null;
  const name = madrasa ?? sync.workspace?.orgName ?? '';

  return (
    <AppScreen title={t('workspaceLocked.title')} testID="workspaceLocked.screen">
      <Notice tone="error">{`🔒 ${t('workspaceLocked.body', { madrasa: isolate(name) })}`}</Notice>
      {sync.loadError ? (
        <View style={{ gap: space[2] }}>
          <Notice tone="error">{t('syncQueue.loadError')}</Notice>
          <Button variant="secondary" label={t('common.retry')} onPress={sync.reload} />
        </View>
      ) : sync.enabled && !sync.ready ? (
        <Skeleton count={2} />
      ) : (
        <Card>
          <AppText role="cardTitle" testID="workspaceLocked.count">
            {t('workspaceLocked.unsentTitle', { count: unsent.length })}
          </AppText>
          {unsent.length === 0 ? (
            <AppText color={colors.textSecondary}>{t('workspaceLocked.none')}</AppText>
          ) : (
            <>
              {purgeDate ? <AppText color={colors.textSecondary}>{t('workspaceLocked.unsentBody', { date: formatTime(purgeDate, true) })}</AppText> : null}
              {unsent.map((item) => (
                <QueueItemCard
                  key={item.opId}
                  item={item}
                  label={itemLabel(item)}
                  registry={sync.registry}
                  lockedView
                  testIDPrefix="workspaceLocked.item"
                />
              ))}
            </>
          )}
        </Card>
      )}
      <AppText color={colors.textSecondary}>{t('workspaceLocked.contact')}</AppText>
      <Button testID="workspaceLocked.signOut" variant="destructive" label={t('more.signOut')} onPress={sync.requestSignOut} />
    </AppScreen>
  );
}
