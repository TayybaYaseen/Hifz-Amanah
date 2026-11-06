// App root: fonts, locale, session, navigation.
import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// Per-weight entry points, so only these four font files are bundled.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { NotoNastaliqUrdu_400Regular } from '@expo-google-fonts/noto-nastaliq-urdu/400Regular';
// Quranic text and Surah names (design.md §2.3, FR-PDF-004).
import { NotoNaskhArabic_400Regular } from '@expo-google-fonts/noto-naskh-arabic/400Regular';
import type { Locale } from '@hifz/contracts';
import { SessionProvider } from './auth/SessionContext.tsx';
import { initI18n } from './i18n/i18n.ts';
import { LocaleProvider, initialLocale, useLocale } from './i18n/LocaleContext.tsx';
import { RootNavigator } from './navigation/RootNavigator.tsx';

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, NotoNastaliqUrdu_400Regular, NotoNaskhArabic_400Regular });
  const [locale, setLocale] = useState<Locale | null>(null);

  useEffect(() => {
    void initialLocale().then((l) => {
      initI18n(l);
      setLocale(l);
    });
  }, []);

  // Fonts and the saved language load from the device in well under a second; nothing renders half-styled.
  if (!fontsLoaded || !locale) return null;

  return (
    <SafeAreaProvider>
      <LocaleProvider initial={locale}>
        <SessionProvider>
          <DirectedNavigation />
        </SessionProvider>
      </LocaleProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

/**
 * Navigation in the locale's direction, so headers and the back chevron mirror in Urdu and switch in place, without
 * the app reload that I18nManager.forceRTL would need (ADR-010, FR-I18N-005).
 */
function DirectedNavigation() {
  const { direction } = useLocale();
  return (
    <NavigationContainer direction={direction}>
      <RootNavigator />
    </NavigationContainer>
  );
}
