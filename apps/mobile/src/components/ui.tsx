// Reusable UI built on the design tokens (design.md §2, §5). Direction follows the active locale; Urdu uses
// Noto Nastaliq with taller lines. Touch targets are at least 44 dp, 48 dp for primary actions.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
          // Android aligns text to the start of the layout direction by itself (right in Urdu, left in English and
          // Roman Urdu). An explicit 'right' there is swapped for right-to-left script and pinned Urdu to the left.
          ...(Platform.OS === 'android' ? {} : { textAlign: direction === 'rtl' ? 'right' : 'left' }),
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

/**
 * Height of the open Android keyboard in dp, 0 when closed. With edge-to-edge the window is not resized for the
 * keyboard and React Native reports the keyboard's top (`screenY`) as the bottom of the screen, so
 * KeyboardAvoidingView sees no overlap. The reported `height` is right: it already excludes the navigation bar,
 * which the safe area pads.
 */
function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', (event) => setHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

/** Lets a Field ask its screen to scroll it above the keyboard when it gains focus. */
const RevealFocusedContext = createContext<() => void>(() => undefined);

/** Room above the focused input for its label when it is scrolled to the top of the visible area. */
const REVEAL_LABEL_DP = space[8];

/** Screen container: safe area, ivory canvas, scrolling, and the locale's layout direction. */
export function AppScreen({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  const { direction } = useLocale();
  const keyboardHeight = useAndroidKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);

  // While the keyboard is open and the form continues below the visible area, the focused field is scrolled, with
  // its label, to the top of that area, so it and as much of the rest of the form as fits (next fields, submit)
  // stay above the keyboard. A form that fits entirely does not move.
  const revealFocused = useCallback(() => {
    if (Platform.OS !== 'android' || keyboardHeight === 0) return;
    const input = TextInput.State.currentlyFocusedInput();
    const scroll = scrollRef.current;
    const viewport = scroll?.getNativeScrollRef();
    if (!input || !scroll || !viewport) return;
    const reveal = () =>
      viewport.measureInWindow((_sx, viewportTop, _sw, viewportHeight) => {
        input.measureInWindow((_ix, inputTop, _iw, inputHeight) => {
          const top = inputTop - viewportTop;
          const formContinuesBelow = contentHeight.current - scrollY.current > viewportHeight;
          const fieldHidden = top + inputHeight > viewportHeight;
          const toTop = top - REVEAL_LABEL_DP;
          if ((formContinuesBelow || fieldHidden) && toTop > 0) {
            scroll.scrollTo({ y: scrollY.current + toTop, animated: true });
          }
        });
      });
    // Only the screen that contains the focused input scrolls. Screens kept underneath in the stack get the same
    // keyboard events; measureLayout fails for an input outside this scroll view, so they stay where they were.
    input.measureLayout(viewport, reveal, () => undefined);
  }, [keyboardHeight]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* iOS resizes through KeyboardAvoidingView. On Android (edge-to-edge) the screen is padded by the keyboard's
          height instead, so the scroll area ends at the keyboard's top (see useAndroidKeyboardHeight). */}
      <KeyboardAvoidingView
        style={[styles.safe, Platform.OS === 'android' ? { paddingBottom: keyboardHeight } : null]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
      <RevealFocusedContext.Provider value={revealFocused}>
      <ScrollView
        ref={scrollRef}
        testID={testID}
        contentContainerStyle={[styles.content, { direction }]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={(_width, height) => {
          contentHeight.current = height;
        }}
        // The scroll area shrinks once the keyboard padding is applied; reveal the focused field after that layout.
        onLayout={revealFocused}
      >
        {title ? (
          <AppText role="screenTitle" color={colors.brandDeep} accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        {children}
      </ScrollView>
      </RevealFocusedContext.Provider>
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
  const revealFocused = useContext(RevealFocusedContext);
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
          onFocus={revealFocused}
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

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_COLORS: Record<StatusTone, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
  neutral: colors.neutral,
};

/**
 * A status shown with an icon and a text label, never color alone (F11-AC13, design.md §6.3). The icon is decorative;
 * screen readers read the label.
 */
export function StatusBadge({ tone, icon, label, testID }: { tone: StatusTone; icon: string; label: string; testID?: string }) {
  const color = TONE_COLORS[tone];
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={label} style={[styles.badge, { borderColor: color }]}>
      <AppText role="helper" color={color} latin>
        {icon}
      </AppText>
      <AppText role="helper" color={color}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    gap: space[1],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
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
