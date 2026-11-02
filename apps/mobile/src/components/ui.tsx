// Reusable UI built on the design tokens (design.md §2, §5). Direction follows the active locale; Urdu uses
// Noto Nastaliq with taller lines. Touch targets are at least 44 dp, 48 dp for primary actions.
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../i18n/LocaleContext.tsx';
import { NASTALIQ_LINE_HEIGHT_FACTOR, colors, inset, radius, space, touch, type } from '../theme/tokens.ts';

type TypeRole = keyof typeof type;

/**
 * Text in the active script and direction. `latin` is for machine strings (User IDs, codes, keys): always left to
 * right in the Latin font, even in Urdu.
 */
export function AppText({ role = 'body', color = colors.textPrimary, style, children, testID, accessibilityRole, latin = false }: {
  role?: TypeRole;
  color?: string;
  style?: TextStyle;
  children: ReactNode;
  testID?: string;
  accessibilityRole?: 'header' | 'text' | 'alert';
  latin?: boolean;
}) {
  const { locale, direction: localeDirection } = useLocale();
  const base = type[role];
  const urdu = locale === 'ur' && !latin;
  const direction = latin ? 'ltr' : localeDirection;
  return (
    <Text
      testID={testID}
      accessibilityRole={accessibilityRole}
      style={[
        base as TextStyle,
        {
          color,
          textAlign: direction === 'rtl' ? 'right' : 'left',
          writingDirection: direction,
          fontFamily: urdu ? 'NotoNastaliqUrdu_400Regular' : 'fontWeight' in base ? 'Inter_600SemiBold' : 'Inter_400Regular',
          ...(urdu ? { lineHeight: Math.round(base.fontSize * NASTALIQ_LINE_HEIGHT_FACTOR) } : {}),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Screen container: safe area, ivory canvas, scrolling, and the locale's layout direction. */
export function AppScreen({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  const { direction } = useLocale();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* With edge-to-edge, Android no longer resizes for the keyboard; keep fields and buttons above it. */}
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        testID={testID}
        contentContainerStyle={[styles.content, { direction }]}
        keyboardShouldPersistTaps="handled"
      >
        {title ? (
          <AppText role="screenTitle" color={colors.brandDeep} accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        {children}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** Primary, secondary, tertiary, or destructive button (design.md §5.1). Disabled while busy. */
export function Button({ label, busyLabel, onPress, variant = 'primary', busy = false, disabled = false, testID }: {
  label: string;
  busyLabel?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const inactive = busy || disabled;
  const filled = variant === 'primary' || variant === 'destructive';
  const background = variant === 'primary' ? colors.brandPrimary : variant === 'destructive' ? colors.danger : colors.surface;
  const foreground = filled ? colors.textOnPrimary : colors.brandPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'tertiary' ? styles.tertiary : { backgroundColor: background },
        variant === 'secondary' ? { borderWidth: 1, borderColor: colors.brandPrimary } : null,
        { minHeight: variant === 'primary' ? touch.preferred : touch.minimum, opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={foreground} style={{ marginEnd: space[2] }} /> : null}
      <AppText role="button" color={foreground} style={{ textAlign: 'center' }}>
        {busy && busyLabel ? busyLabel : label}
      </AppText>
    </Pressable>
  );
}

/** A labelled field with helper text and an inline error (design.md §5.2). Passwords get a show/hide control. */
export function Field({ label, value, onChangeText, error, helper, secure = false, testID, ...input }: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  helper?: string;
  secure?: boolean;
  testID: string;
} & Pick<TextInputProps, 'keyboardType' | 'autoComplete' | 'textContentType' | 'maxLength' | 'editable' | 'inputMode'>) {
  const { t } = useTranslation();
  const { direction } = useLocale();
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.field}>
      <AppText role="helper" color={colors.textSecondary}>
        {label}
      </AppText>
      <View style={[styles.inputRow, error ? { borderColor: colors.danger } : null]}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure && hidden}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { textAlign: direction === 'rtl' ? 'right' : 'left' }]}
          placeholderTextColor={colors.textSecondary}
          {...input}
        />
        {secure ? (
          <Pressable
            testID={`${testID}.toggle`}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('common.showPassword') : t('common.hidePassword')}
            onPress={() => setHidden((h) => !h)}
            style={styles.toggle}
          >
            <AppText role="helper" color={colors.brandPrimary}>
              {hidden ? t('common.showPassword') : t('common.hidePassword')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText role="helper" color={colors.danger} testID={`${testID}.error`} accessibilityRole="alert">
          {`⚠ ${error}`}
        </AppText>
      ) : helper ? (
        <AppText role="helper" color={colors.textSecondary}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

/** A status message with an icon and text, never color alone (design.md §6.3). */
export function Notice({ tone, children, testID }: { tone: 'error' | 'info' | 'success'; children: ReactNode; testID?: string }) {
  const color = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.info;
  const icon = tone === 'error' ? '⚠' : tone === 'success' ? '✓' : 'ℹ';
  // The testID sits on the message text itself, so tests can read and compare it (code review M3).
  const text = typeof children === 'string';
  return (
    <View
      testID={text ? undefined : testID}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderColor: color }]}
    >
      <AppText color={color}>{`${icon} `}</AppText>
      <View style={{ flex: 1 }}>
        {text ? (
          <AppText color={color} testID={testID}>
            {children}
          </AppText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: inset, gap: space[4] },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[3],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    paddingHorizontal: space[4],
  },
  tertiary: { backgroundColor: 'transparent' },
  field: { gap: space[1] },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    minHeight: touch.preferred,
  },
  input: { flex: 1, paddingHorizontal: space[3], fontSize: 16, color: colors.textPrimary, minHeight: touch.preferred },
  toggle: { minHeight: touch.minimum, minWidth: touch.minimum, justifyContent: 'center', paddingHorizontal: space[3] },
  notice: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.input,
    padding: space[3],
    backgroundColor: colors.surface,
  },
});
