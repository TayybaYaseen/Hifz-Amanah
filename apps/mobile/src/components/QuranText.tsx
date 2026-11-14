// Quranic Arabic and Surah names, exactly as stored (FR-I18N-006, F11-AC8; ARCHITECTURE.md §14). The text is never
// translated, transliterated, normalized, or trimmed; it is shown in Noto Naskh Arabic, right to left, in every
// interface language.
import { Text, type TextStyle } from 'react-native';
import { quranTextContent } from '../i18n/quran.ts';
import { NASKH_LINE_HEIGHT_FACTOR, colors, type } from '../theme/tokens.ts';

export function QuranText({ text, role = 'body', color = colors.textPrimary, inline = false, testID }: {
  /** The stored value. */
  text: string;
  role?: keyof typeof type;
  color?: string;
  /** Nested inside an AppText sentence rather than on its own line. */
  inline?: boolean;
  testID?: string;
}) {
  const base = type[role];
  const style: TextStyle = {
    fontSize: base.fontSize,
    lineHeight: Math.round(base.fontSize * NASKH_LINE_HEIGHT_FACTOR),
    fontFamily: 'NotoNaskhArabic_400Regular',
    color,
    ...(inline ? {} : { writingDirection: 'rtl' }),
  };
  return (
    <Text testID={testID} style={style} accessibilityLanguage="ar">
      {quranTextContent(text, inline)}
    </Text>
  );
}
