// Selectable chip for roster filters and pickers (design.md §5). Selection is shown with a ✓ and text, never color
// alone (design.md §6.3); the touch target is at least 44 dp.
import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { AppText } from '../../components/ui.tsx';
import { colors, radius, space, touch } from '../../theme/tokens.ts';

export function Chip({ label, selected, onPress, testID, role = 'radio', disabled = false }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  role?: 'radio' | 'checkbox';
  /** Not selectable (e.g. quality for a no-quality status, F05-AC5); reported to screen readers. */
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected, disabled } : { checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipOn : null, disabled ? styles.chipOff : null]}
    >
      <AppText role="button" color={selected ? colors.brandPrimary : colors.textPrimary}>
        {`${selected ? '✓ ' : ''}${label}`}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.row} accessibilityLabel={label}>
      {children}
    </View>
  );
}

/** Active/Inactive as a text label with an icon (design.md §13 US-010). */
export function StatusLabel({ active, activeText, inactiveText, testID }: { active: boolean; activeText: string; inactiveText: string; testID?: string }) {
  return (
    <AppText role="helper" color={active ? colors.success : colors.neutral} testID={testID}>
      {active ? `● ${activeText}` : `○ ${inactiveText}`}
    </AppText>
  );
}

export const rowStyle = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[1],
    minHeight: touch.preferred,
  },
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: touch.minimum,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceSelected },
  chipOff: { opacity: 0.5 },
});
