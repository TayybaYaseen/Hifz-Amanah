// Language selection (FR-AUTH-004). Labels are each language's own name, so they read the same in every locale.
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale } from '@hifz/contracts';
import { useLocale } from '../i18n/LocaleContext.tsx';
import { colors, radius, space, touch } from '../theme/tokens.ts';
import { AppText } from './ui.tsx';

export function LanguagePicker({ onChange }: { onChange?: (locale: Locale) => void }) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={t('language.label')}>
      <AppText role="helper" color={colors.textSecondary}>
        {t('language.label')}
      </AppText>
      <View style={styles.row}>
        {LOCALES.map((option) => {
          const selected = option === locale;
          return (
            <Pressable
              key={option}
              testID={`language.option.${option}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                setLocale(option);
                onChange?.(option);
              }}
              style={[styles.chip, selected ? styles.selected : null]}
            >
              <AppText role="button" color={selected ? colors.brandPrimary : colors.textPrimary}>
                {`${selected ? '✓ ' : ''}${t(`language.${option}`)}`}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[1] },
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
  selected: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceSelected },
});
