// Sync visuals (design.md §4.13, §5.9; UI spec §0–§2). Status is always icon + text, never colour alone; the
// icon is decorative and the text carries the meaning. Tokens only; touch targets ≥ 44 dp (48 for primary).
import type { ReactNode } from 'react';
import { ActivityIndicator, AccessibilityInfo, BackHandler, Modal, Pressable, StyleSheet, View, findNodeHandle, Text } from 'react-native';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueueState } from '@hifz/domain/sync';
import { useLocale } from '../i18n/LocaleContext.tsx';
import { isolate } from '../i18n/direction.ts';
import type { Banner, BannerState } from '../sync/banner.ts';
import type { OutboxItem } from '../sync/outbox.ts';
import type { EntityRegistry } from '../sync/registry.ts';
import { colors, radius, space, touch } from '../theme/tokens.ts';
import { AppText, Notice } from './ui.tsx';

type IconKind = QueueState | 'OFFLINE' | 'SESSION_EXPIRED' | 'ACCESS_REVOKED' | 'UPGRADE_REQUIRED' | 'NOTHING' | 'LOCKED';

/** One map, so the glyphs can later become drawn icons without touching screens (UI spec §0). */
const ICONS: Record<IconKind, { glyph: string; color: string }> = {
  PENDING: { glyph: '◷', color: colors.neutral },
  SYNCING: { glyph: '↻', color: colors.info },
  SYNCED: { glyph: '✓', color: colors.success },
  FAILED: { glyph: '⚠', color: colors.danger },
  ACTION_REQUIRED: { glyph: '!', color: colors.warning },
  OFFLINE: { glyph: '⊘', color: colors.neutral },
  SESSION_EXPIRED: { glyph: 'ℹ', color: colors.info },
  ACCESS_REVOKED: { glyph: '🔒', color: colors.danger },
  LOCKED: { glyph: '🔒', color: colors.danger },
  UPGRADE_REQUIRED: { glyph: '⬆', color: colors.warning },
  NOTHING: { glyph: '○', color: colors.neutral },
};

export function stateColor(kind: IconKind): string {
  return ICONS[kind].color;
}

export function SyncStateIcon({ kind, spinning = false }: { kind: IconKind; spinning?: boolean }) {
  const icon = ICONS[kind];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>
      {spinning ? <ActivityIndicator size="small" color={icon.color} /> : <Text style={{ color: icon.color, fontSize: 18 }}>{icon.glyph}</Text>}
    </View>
  );
}

/** Date and time in the active language with Western digits (FR-I18N-009), isolated for mixed scripts. */
export function useFormatDateTime(): (iso: string | null, dateOnly?: boolean) => string {
  const { locale } = useLocale();
  return (iso, dateOnly = false) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    try {
      const options: Intl.DateTimeFormatOptions = dateOnly ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' };
      return isolate(new Intl.DateTimeFormat(`${locale}-u-nu-latn`, options).format(date));
    } catch {
      return isolate(date.toISOString().slice(0, dateOnly ? 10 : 16).replace('T', ' '));
    }
  };
}

/** The safe display label of a queue item: the entity's own label, or "{type} {first 8 of the ID}". */
export function useItemLabel(registry: EntityRegistry): (item: Pick<OutboxItem, 'entity' | 'entityId' | 'fields' | 'label'>) => string {
  const { t } = useTranslation();
  return (item) => {
    const own = registry.get(item.entity)?.label(item.fields) ?? item.label;
    if (own) return isolate(own);
    const type = t(`sync.entity.${item.entity}`, { defaultValue: t('sync.entity.unknown') });
    return t('sync.itemFallback', { type, shortId: isolate(item.entityId.slice(0, 8)) });
  };
}

const BANNER_TEXT: Record<BannerState, string> = {
  ACCESS_REVOKED: 'sync.banner.accessRevoked',
  UPGRADE_REQUIRED: 'sync.banner.upgradeRequired',
  SESSION_EXPIRED: 'sync.banner.sessionExpired',
  ACTION_REQUIRED: 'sync.banner.actionRequired',
  FAILED: 'sync.banner.failed',
  OFFLINE: 'sync.banner.offline',
  SYNCING: 'sync.banner.syncing',
  PENDING: 'sync.banner.waiting',
  SYNCED: 'sync.banner.synced',
  NOTHING: 'sync.banner.nothing',
};

/** The workspace sync banner (design.md §5.9). Pressable opens the Sync Queue; a summary row on the queue itself. */
export function SyncBanner({ banner, onPress, loadError = false }: { banner: Banner | null; onPress?: () => void; loadError?: boolean }) {
  const { t } = useTranslation();
  const { direction } = useLocale();
  const formatTime = useFormatDateTime();
  if (loadError) {
    return (
      <Notice tone="error" testID="sync.banner">
        {t('syncQueue.loadError')}
      </Notice>
    );
  }
  // Loading: render nothing rather than a false "synced".
  if (!banner) return null;
  const line1 = t(BANNER_TEXT[banner.state], { count: banner.count });
  const showWaitingOnPhone =
    banner.state === 'UPGRADE_REQUIRED' || banner.state === 'SESSION_EXPIRED' || (banner.state === 'OFFLINE' && banner.count > 0);
  const line2 = showWaitingOnPhone
    ? t('sync.banner.waitingOnPhone', { count: banner.count })
    : banner.lastSuccessAt
      ? t('sync.banner.lastSynced', { time: formatTime(banner.lastSuccessAt) })
      : null;
  const content = (
    <>
      <SyncStateIcon kind={banner.state} spinning={banner.state === 'SYNCING'} />
      <View style={{ flex: 1, gap: space[1] }}>
        <AppText testID={`sync.banner.state.${banner.state}`} style={{ fontWeight: '600' }}>
          {line1}
        </AppText>
        {line2 ? (
          <AppText role="helper" color={colors.textSecondary} testID={showWaitingOnPhone ? 'sync.banner.count' : 'sync.banner.lastSynced'}>
            {line2}
          </AppText>
        ) : null}
      </View>
      {onPress ? (
        <AppText color={colors.textSecondary} style={{ fontSize: 20 }}>
          {direction === 'rtl' ? '‹' : '›'}
        </AppText>
      ) : null}
    </>
  );
  const style = [styles.banner, { borderStartColor: ICONS[banner.state].color }];
  if (!onPress) {
    return (
      <View testID="sync.banner" style={style} accessible accessibilityLabel={line2 ? `${line1}. ${line2}` : line1}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID="sync.banner"
      accessibilityRole="button"
      accessibilityLabel={line2 ? `${line1}. ${line2}` : line1}
      accessibilityHint={t('sync.banner.a11yHint')}
      accessibilityLiveRegion="polite"
      onPress={onPress}
      style={({ pressed }) => [...style, { opacity: pressed ? 0.85 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

/** "Saved on this device — waiting to sync" (F12-AC1): shown only after saveWithOp resolved; ◷, never ✓. */
export function SavedOnDeviceNotice() {
  const { t } = useTranslation();
  return (
    <View testID="sync.savedOnDevice" accessibilityLiveRegion="polite" style={[styles.saved, { borderColor: colors.info }]}>
      <SyncStateIcon kind="PENDING" />
      <AppText color={colors.info} style={{ flex: 1 }}>
        {t('sync.savedOnDevice')}
      </AppText>
    </View>
  );
}

/**
 * A modal bottom sheet for confirmations (UI spec §0 "Dialogs"): carries testIDs, RTL text, and stacked buttons,
 * which the Android Alert cannot. Hardware Back means Cancel; focus moves to the title when it opens.
 */
export function ConfirmSheet({ visible, title, onCancel, children, testID }: { visible: boolean; title: string; onCancel: () => void; children: ReactNode; testID?: string }) {
  const { direction } = useLocale();
  const titleRef = useRef<View>(null);
  useEffect(() => {
    if (!visible) return undefined;
    const handle = titleRef.current ? findNodeHandle(titleRef.current) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => back.remove();
  }, [visible, onCancel]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.scrim}>
        {/* No scrim token in design.md §2: the deep brand colour, dimmed. */}
        <Pressable accessible={false} style={[StyleSheet.absoluteFill, styles.dim]} onPress={onCancel} />
        <View testID={testID} accessibilityViewIsModal style={[styles.sheet, { direction }]}>
          <View ref={titleRef} accessible accessibilityRole="header">
            <AppText role="sectionTitle" color={colors.brandDeep}>
              {title}
            </AppText>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  icon: { minWidth: space[6], alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: touch.preferred,
    padding: space[3],
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderStartWidth: space[1],
    borderRadius: radius.card,
  },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderWidth: 1,
    borderRadius: radius.input,
    padding: space[3],
    backgroundColor: colors.surface,
  },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: colors.brandDeep, opacity: 0.4 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopStartRadius: radius.sheet,
    borderTopEndRadius: radius.sheet,
    padding: space[4],
    gap: space[3],
  },
});
