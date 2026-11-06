// Expo app config. Android-first (SRS §3.2); minimum Android 8.0 / API 26 (DEC-B52).
import type { ExpoConfig } from 'expo/config';

// DEFERRED: DEC-B55 — the Android application ID is not chosen yet. Builds read it from APP_ID.
const applicationId = process.env.APP_ID;
// Development builds talk to a local API over plain HTTP; release builds use HTTPS only (ARCHITECTURE.md §7.5).
const development = process.env.APP_VARIANT === 'development';
// A production build must point at an HTTPS API; it never falls back to the local development address.
if (process.env.APP_VARIANT === 'production' && !process.env.EXPO_PUBLIC_API_URL?.startsWith('https://')) {
  throw new Error('APP_VARIANT=production needs EXPO_PUBLIC_API_URL set to an https:// address');
}

const config: ExpoConfig = {
  name: 'HifzAmanah',
  slug: 'hifzamanah',
  version: '0.1.0',
  // Android only in MVP (ARCHITECTURE.md §3: no web portal). Metro on :8081 serves the Android bundle, not a web page.
  platforms: ['android'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#FAF8F0' },
  android: {
    ...(applicationId ? { package: applicationId } : {}),
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#FAF8F0' },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-secure-store',
    'expo-localization',
    'expo-font',
    ['expo-build-properties', { android: { minSdkVersion: 26, usesCleartextTraffic: development } }],
  ],
};

export default config;
