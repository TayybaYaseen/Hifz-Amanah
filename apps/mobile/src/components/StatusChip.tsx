// Portion status chip (design.md §5.5; F05 UI spec §3.6; FR-ATT-001…007). Icon + text + a 1 dp border in the tone
// colour, never colour alone. One glyph map, as in components/sync.tsx. ABSENT, NOT_ASSIGNED, and PENDING are neutral:
// never a failure colour (F05-AC5).
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PortionStatus } from '@hifz/domain/hifz';
import { colors, radius, space, type as typography } from '../theme/tokens.ts';
import { AppText } from './ui.tsx';

const STATUS_ICONS: Record<PortionStatus, { glyph: string; color: string }> = {
  COMPLETED: { glyph: '✓', color: colors.success },
  PARTIAL: { glyph: '◐', color: colors.warning },
  NOT_REMEMBERED: { glyph: '✗', color: colors.danger },
  ABSENT: { glyph: '○', color: colors.neutral },
  NOT_ASSIGNED: { glyph: '–', color: colors.neutral },
  PENDING: { glyph: '◷', color: colors.neutral },
};

export function StatusChip({ status, testID }: { status: PortionStatus; testID?: string }) {
  const { t } = useTranslation();
  const icon = STATUS_ICONS[status];
  const label = t(`portionStatus.${status}`);
  return (
    <View testID={testID} accessible accessibilityLabel={t('portionStatus.a11y', { status: label })} style={[styles.chip, { borderColor: icon.color }]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={{ color: icon.color, fontSize: typography.body.fontSize, lineHeight: typography.body.lineHeight }}>{icon.glyph}</Text>
      </View>
      <AppText role="helper" color={icon.color}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderWidth: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
});
