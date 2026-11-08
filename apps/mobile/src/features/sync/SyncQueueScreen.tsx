// Sync Queue (UI spec §2; F12-AC6, AC8, AC9; design.md §4.13). Local outbox items grouped by state, in outbox
// order (never device time); synced items stay listed for 24 hours (Q16). The Conflicts tab lists the server's
// open conflicts (online only).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ConflictSummary } from '@hifz/contracts';
import { isHeldByOpenConflict, nextSendable, type QueueState } from '@hifz/domain/sync';
import { errorKeys } from '../../api/errors.ts';
import { AppScreen, AppText, Button, Card, Notice } from '../../components/ui.tsx';
import { ConfirmSheet, SyncBanner, useFormatDateTime, useItemLabel } from '../../components/sync.tsx';
import { isolate } from '../../i18n/direction.ts';
import { DiscardNotAllowedError } from '../../sync/engine.ts';
import type { OutboxItem } from '../../sync/outbox.ts';
import { SYNCED_LISTED_MS } from '../../sync/retention.ts';
import { useSync } from '../../sync/SyncContext.tsx';
import { colors, radius, space, touch } from '../../theme/tokens.ts';
import { QueueItemCard } from './QueueItemCard.tsx';

const SECTIONS: readonly QueueState[] = ['ACTION_REQUIRED', 'FAILED', 'SYNCING', 'PENDING', 'SYNCED'];

export function SyncQueueScreen({ onReview }: { onReview: (conflictId: string) => void }) {
  const { t } = useTranslation();
  const sync = useSync();
  const [tab, setTab] = useState<'phone' | 'conflicts'>('phone');
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState<OutboxItem | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const itemLabel = useItemLabel(sync.registry);

  const blockedReason = !sync.online ? t('signOutWarning.offlineHelp') : sync.upgradeRequired ? t('sync.upgrade.title') : null;

  const { grouped, holds } = useMemo(() => {
    const now = Date.now();
    const visible = sync.items.filter(
      (i) => i.status.state !== 'SYNCED' || (i.syncedAt !== null && now - Date.parse(i.syncedAt) < SYNCED_LISTED_MS),
    );
    const plan = nextSendable(
      sync.items.map((i) => ({ opId: i.opId, seq: i.seq, state: i.status.state, dependsOn: i.dependsOn, nextAttemptAt: i.status.nextAttemptAt })),
      { nowMs: now },
    );
    const byId = new Map(sync.items.map((i) => [i.opId, i]));
    const holdMap = new Map(
      plan.held.map((h) => {
        const dep = h.blockedBy[0] ? byId.get(h.blockedBy[0]) : undefined;
        return [h.op.opId, { reason: h.reason, waitingFor: dep ? itemLabel(dep) : null }] as const;
      }),
    );
    const groups = new Map<QueueState, OutboxItem[]>();
    for (const state of SECTIONS) groups.set(state, []);
    for (const item of visible) groups.get(item.status.state)!.push(item);
    // Synced: newest first. Everything else stays in outbox order.
    groups.get('SYNCED')!.sort((a, b) => (b.syncedAt ?? '').localeCompare(a.syncedAt ?? ''));
    return { grouped: groups, holds: holdMap };
  }, [sync.items, itemLabel]);

  const total = [...grouped.values()].reduce((n, list) => n + list.length, 0);

  const syncNow = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await sync.syncNow();
    } finally {
      setBusy(false);
    }
  };

  const confirmDiscard = async () => {
    if (!discarding) return;
    try {
      await sync.discard(discarding.opId);
      setNotice({ tone: 'success', text: t('syncQueue.discarded') });
    } catch (err) {
      setNotice({
        tone: 'error',
        text:
          err instanceof DiscardNotAllowedError && err.reason === 'DEPENDENTS'
            ? t('syncQueue.discardBlocked', { count: err.dependents })
            : err instanceof DiscardNotAllowedError && err.reason === 'MAYBE_SENT'
              ? t('syncQueue.discardMaybeSent')
              : t('errors.INTERNAL'),
      });
    } finally {
      setDiscarding(null);
    }
  };

  const discardDependents = discarding ? sync.items.filter((i) => i.status.state !== 'SYNCED' && i.dependsOn.includes(discarding.opId)).length : 0;

  return (
    <AppScreen testID="syncQueue.screen">
      <Card>
        <SyncBanner banner={sync.banner} loadError={sync.loadError} />
        <AppText testID="syncQueue.summary" color={colors.textSecondary}>
          {t('syncQueue.summary', { pending: sync.counts.PENDING + sync.counts.SYNCING, failed: sync.counts.FAILED, actionRequired: sync.counts.ACTION_REQUIRED })}
        </AppText>
        <Button
          testID="syncQueue.syncNow"
          label={t('sync.syncNow')}
          busyLabel={t('sync.syncingNow')}
          busy={busy || sync.engine.running}
          disabled={blockedReason !== null || sync.locked}
          onPress={() => void syncNow()}
        />
        {blockedReason ? (
          <AppText role="helper" color={colors.textSecondary}>
            {blockedReason}
          </AppText>
        ) : null}
      </Card>

      {sync.upgradeRequired ? (
        <Notice tone="error" testID="sync.upgrade.notice">
          {`${t('sync.upgrade.title')}. ${t('errors.UPGRADE_REQUIRED')} ${t('sync.upgrade.howTo')} ${t('sync.upgrade.keepWorking')}`}
        </Notice>
      ) : null}
      {!sync.online ? (
        <Notice tone="info" testID="syncQueue.offline">
          {t('syncQueue.offlineNotice')}
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone={notice.tone} testID="syncQueue.notice">
          {notice.text}
        </Notice>
      ) : null}

      <View accessibilityRole="tablist" style={styles.tabs}>
        {(['phone', 'conflicts'] as const).map((key) => (
          <Pressable
            key={key}
            testID={`syncQueue.tab.${key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key ? { backgroundColor: colors.surfaceSelected, borderColor: colors.brandPrimary } : null]}
          >
            <AppText color={tab === key ? colors.brandPrimary : colors.textSecondary} style={{ fontWeight: tab === key ? '600' : '400' }}>
              {`${tab === key ? '● ' : '○ '}${key === 'phone' ? t('syncQueue.tabPhone') : t('syncQueue.tabConflicts')}`}
            </AppText>
          </Pressable>
        ))}
      </View>

      {tab === 'phone' ? (
        sync.loadError ? (
          <View testID="syncQueue.error" style={{ gap: space[3] }}>
            <Notice tone="error">{t('syncQueue.loadError')}</Notice>
            <Button variant="secondary" label={t('common.retry')} onPress={sync.reload} />
          </View>
        ) : !sync.ready ? (
          <Skeleton count={3} />
        ) : total === 0 ? (
          <Card>
            <View testID="syncQueue.empty" style={{ gap: space[2] }}>
              <AppText role="cardTitle">{t('syncQueue.emptyTitle')}</AppText>
              <AppText color={colors.textSecondary}>{t('syncQueue.emptyBody')}</AppText>
            </View>
          </Card>
        ) : (
          SECTIONS.map((state) => {
            const list = grouped.get(state)!;
            if (list.length === 0) return null;
            const heading = state === 'SYNCED' ? t('syncQueue.section.syncedRecent') : t(`sync.state.${state}`);
            return (
              <View key={state} style={{ gap: space[2] }} testID={`syncQueue.section.${state}`}>
                <AppText role="sectionTitle" accessibilityRole="header">
                  {t('syncQueue.sectionCount', { label: heading, count: list.length })}
                </AppText>
                {list.map((item) => (
                  <QueueItemCard
                    key={item.opId}
                    item={item}
                    label={itemLabel(item)}
                    registry={sync.registry}
                    hold={holds.get(item.opId)}
                    onRetry={() => void sync.retry(item.opId)}
                    onDiscard={() => setDiscarding(item)}
                    onReview={(() => {
                      // Its own conflict, or (held, Q7) the conflict this phone caused on the same record. A held
                      // item behind someone else's conflict has no Review here.
                      const id = item.status.conflictId ?? (isHeldByOpenConflict(item.status) ? conflictOnRow(sync.items, item) : null);
                      return id ? () => onReview(id) : undefined;
                    })()}
                  />
                ))}
              </View>
            );
          })
        )
      ) : (
        <ConflictsTab onReview={onReview} />
      )}

      <ConfirmSheet visible={discarding !== null} title={t('syncQueue.discardTitle')} onCancel={() => setDiscarding(null)} testID="syncQueue.discard.sheet">
        {discarding ? (
          <>
            {discardDependents > 0 ? (
              <Notice tone="error">{t('syncQueue.discardBlocked', { count: discardDependents })}</Notice>
            ) : (
              <AppText>{t('syncQueue.discardBody', { label: itemLabel(discarding) })}</AppText>
            )}
            {discardDependents > 0 ? null : (
              <Button testID="syncQueue.discard.confirm" variant="destructive" label={t('syncQueue.discardConfirm')} onPress={() => void confirmDiscard()} />
            )}
            <Button testID="syncQueue.discard.cancel" variant="secondary" label={t('common.cancel')} onPress={() => setDiscarding(null)} />
          </>
        ) : null}
      </ConfirmSheet>
    </AppScreen>
  );
}

/** The open conflict this phone's own change caused on the same record as the given item, if any. */
function conflictOnRow(items: readonly OutboxItem[], item: OutboxItem): string | null {
  const owner = items.find(
    (i) => i.entity === item.entity && i.entityId === item.entityId && i.status.state === 'ACTION_REQUIRED' && i.status.conflictId !== null,
  );
  return owner?.status.conflictId ?? null;
}

function ConflictsTab({ onReview }: { onReview: (conflictId: string) => void }) {
  const { t } = useTranslation();
  const sync = useSync();
  const formatTime = useFormatDateTime();
  const [items, setItems] = useState<ConflictSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      setItems((await sync.conflicts.listConflicts()).items);
    } catch (err) {
      setError(t(errorKeys(err).form ?? 'errors.INTERNAL'));
    }
    // sync.conflicts is recreated per render, but the API it wraps is stable.
  }, [t]);

  useEffect(() => {
    if (sync.online) void load();
  }, [sync.online, load]);

  if (!sync.online) return <Notice tone="info">{t('syncQueue.conflictsOffline')}</Notice>;
  if (error) {
    return (
      <View style={{ gap: space[3] }}>
        <Notice tone="error" testID="syncQueue.conflicts.error">
          {error}
        </Notice>
        <Button variant="secondary" label={t('common.retry')} onPress={() => void load()} />
      </View>
    );
  }
  if (!items) return <Skeleton count={2} />;
  if (items.length === 0) return <Notice tone="info">{t('syncQueue.conflictsEmpty')}</Notice>;
  return (
    <View style={{ gap: space[2] }}>
      {items.map((c) => (
        <Card key={c.id}>
          <View testID={`syncQueue.conflict.${c.id}`} style={{ gap: space[1] }}>
            <AppText role="helper" color={colors.warning}>
              {`! ${t(`sync.entity.${c.entity}`, { defaultValue: t('sync.entity.unknown') })}`}
            </AppText>
            <AppText role="cardTitle">{isolate(c.label)}</AppText>
            <AppText role="helper" color={colors.textSecondary}>
              {t('syncQueue.conflictCausedBy', { user: isolate(c.causedBy.displayName), time: formatTime(c.createdAt) })}
            </AppText>
          </View>
          <Button variant="secondary" label={t('syncQueue.review')} accessibilityLabel={t('syncQueue.reviewA11y', { label: isolate(c.label) })} onPress={() => onReview(c.id)} />
        </Card>
      ))}
    </View>
  );
}

export function Skeleton({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <View accessible accessibilityLabel={t('common.loading')} style={{ gap: space[2] }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skeleton} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space[2] },
  tab: {
    flex: 1,
    minHeight: touch.preferred,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space[3],
  },
  skeleton: { height: space[8] * 3, borderRadius: radius.card, backgroundColor: colors.border },
});
