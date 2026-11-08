// One Sync Queue item (UI spec §2; F12-AC8): exactly one of the five states with icon + text, the item label,
// when it changed on this phone, and what happens next. Retry/Discard/Review per state; none when read-only.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isHeldByOpenConflict, type HoldReason } from '@hifz/domain/sync';
import { AppText, Button } from '../../components/ui.tsx';
import { SyncStateIcon, stateColor, useFormatDateTime } from '../../components/sync.tsx';
import { discardable, type OutboxItem } from '../../sync/outbox.ts';
import type { EntityRegistry } from '../../sync/registry.ts';
import { colors, radius, space } from '../../theme/tokens.ts';

export interface QueueItemProps {
  item: OutboxItem;
  label: string;
  registry: EntityRegistry;
  /** Why a PENDING item is not being sent, and the label of the record it waits for. */
  hold?: { reason: HoldReason; waitingFor: string | null } | undefined;
  /** Read-only (workspace locked): a lock chip instead of the state, no actions. */
  lockedView?: boolean;
  testIDPrefix?: string;
  onRetry?: () => void;
  onDiscard?: () => void;
  onReview?: () => void;
}

export function QueueItemCard({ item, label, registry, hold, lockedView = false, testIDPrefix = 'syncQueue.item', onRetry, onDiscard, onReview }: QueueItemProps) {
  const { t } = useTranslation();
  const formatTime = useFormatDateTime();
  const state = item.status.state;
  const id = `${testIDPrefix}.${item.opId}`;
  const type = t(`sync.entity.${item.entity}`, { defaultValue: t('sync.entity.unknown') });

  const reasonText = (() => {
    const failure = item.status.failure;
    if (!failure) return null;
    const handler = registry.get(item.entity);
    if (failure.code === 'VALIDATION' && failure.fields && Object.keys(failure.fields).length) {
      const names = Object.keys(failure.fields).map((f) => {
        const key = handler?.fieldLabelKey?.(f);
        return key ? t(key) : f;
      });
      return t('syncQueue.reasonFields', { fields: names.join(t('common.listSeparator')) });
    }
    return t('syncQueue.reason', { reason: t(`errors.${failure.code}`, { defaultValue: t('errors.INTERNAL') }) });
  })();

  const next = (() => {
    if (lockedView) return null;
    switch (state) {
      case 'PENDING':
        if (hold?.reason === 'WAITING_FOR_RECORD' || hold?.reason === 'WAITING_FOR_DEPENDENCY') {
          if (hold.waitingFor) return t('syncQueue.next.waitingFor', { label: hold.waitingFor });
        }
        if (item.status.nextAttemptAt && item.status.nextAttemptAt > Date.now()) {
          return t('syncQueue.next.retryAt', { time: formatTime(new Date(item.status.nextAttemptAt).toISOString()) });
        }
        return t('syncQueue.next.PENDING');
      case 'SYNCING':
        return t('syncQueue.next.SYNCING');
      case 'SYNCED':
        return t('syncQueue.next.SYNCED', { time: formatTime(item.syncedAt) });
      case 'FAILED':
        return t('syncQueue.next.FAILED');
      case 'ACTION_REQUIRED':
        // Held behind another change's open conflict on the same record (Q7): sent again once it is resolved.
        return isHeldByOpenConflict(item.status) ? t('syncQueue.next.heldByConflict') : t('syncQueue.next.ACTION_REQUIRED');
    }
  })();

  const stateText = lockedView ? t('workspaceLocked.itemState') : t(`sync.state.${state}`);
  const a11y = [label, stateText, reasonText, next].filter(Boolean).join('. ');

  return (
    <View testID={id} style={styles.card}>
      <View accessible accessibilityLabel={a11y} style={{ gap: space[1] }}>
        <View style={styles.row}>
          <SyncStateIcon kind={lockedView ? 'LOCKED' : state} />
          <AppText
            testID={lockedView ? `${id}.locked` : `${id}.state.${state}`}
            color={lockedView ? stateColor('LOCKED') : stateColor(state)}
            style={{ fontWeight: '600' }}
          >
            {stateText}
          </AppText>
          <AppText role="helper" color={colors.textSecondary}>
            {`· ${type}`}
          </AppText>
        </View>
        <AppText role="cardTitle">{label}</AppText>
        <AppText role="helper" color={colors.textSecondary}>
          {t('syncQueue.lastChanged', { time: formatTime(item.createdAt) })}
        </AppText>
        {reasonText && state !== 'SYNCED' ? (
          <AppText role="helper" color={state === 'FAILED' ? colors.danger : colors.textSecondary} testID={`${id}.reason`}>
            {reasonText}
          </AppText>
        ) : null}
        {next ? (
          <AppText role="helper" color={colors.textSecondary}>
            {next}
          </AppText>
        ) : null}
      </View>
      {lockedView ? null : (
        <View style={styles.actions}>
          {state === 'FAILED' && onRetry ? <Button testID={`${id}.retry`} variant="secondary" label={t('syncQueue.retry')} accessibilityLabel={t('syncQueue.retryA11y', { label })} onPress={onRetry} /> : null}
          {state === 'ACTION_REQUIRED' && onReview ? <Button testID={`${id}.review`} variant="secondary" label={t('syncQueue.review')} accessibilityLabel={t('syncQueue.reviewA11y', { label })} onPress={onReview} /> : null}
          {discardable(item) && onDiscard ? (
            <Button testID={`${id}.discard`} variant="tertiary" label={t('syncQueue.discard')} accessibilityLabel={t('syncQueue.discardA11y', { label })} onPress={onDiscard} />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[3],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
