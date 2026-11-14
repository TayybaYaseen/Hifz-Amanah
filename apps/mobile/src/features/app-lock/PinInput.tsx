// 6-digit PIN entry (UI spec §5.1): one hidden number-pad input and six visible boxes, always left to right
// (also in Urdu). Digits are never shown or read aloud; the screen reader hears how many were entered.
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '../../components/ui.tsx';
import { PIN_LENGTH } from '../../app-lock/lock.ts';
import { colors, radius, space, touch } from '../../theme/tokens.ts';

export function PinInput({ value, onChange, onComplete, label, testID, autoFocus = true, disabled = false }: {
  value: string;
  onChange: (pin: string) => void;
  onComplete?: (pin: string) => void;
  label: string;
  testID: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<TextInput>(null);
  useEffect(() => {
    if (autoFocus && !disabled) setTimeout(() => input.current?.focus(), 50);
  }, [autoFocus, disabled]);
  return (
    <View style={{ gap: space[2] }}>
      <AppText role="helper" color={colors.textSecondary}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="none"
        importantForAccessibility="no-hide-descendants"
        onPress={() => input.current?.focus()}
        style={styles.row}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.box, i === value.length ? { borderColor: colors.brandPrimary } : null]}>
            <AppText role="sectionTitle" latin>
              {i < value.length ? '•' : ''}
            </AppText>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={input}
        testID={testID}
        accessibilityLabel={t('appLock.unlock.pinLabel')}
        accessibilityValue={{ text: t('appLock.unlock.progress', { count: value.length }) }}
        value={value}
        editable={!disabled}
        onChangeText={(text) => {
          const digits = text.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);
          onChange(digits);
          if (digits.length === PIN_LENGTH) onComplete?.(digits);
        }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_LENGTH}
        autoComplete="off"
        importantForAutofill="no"
        caretHidden
        style={styles.hidden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', direction: 'ltr', gap: space[2], justifyContent: 'center' },
  box: {
    minWidth: touch.minimum,
    minHeight: touch.preferred,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Kept in the layout (focusable, testable) but invisible; the boxes above show the progress.
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
