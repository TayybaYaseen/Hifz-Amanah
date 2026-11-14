// Expo app config. Android-first (SRS §3.2); minimum Android 8.0 / API 26 (DEC-B52).
import type { ExpoConfig } from 'expo/config';

// Android application ID, decided 2026-11-08 (SRS §17 DEC-B55). It must never change after the first release.
const applicationId = 'com.hifzamanah.app';
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
    package: applicationId,
    // NFR-OFF-010, F12-AC20 (security review H1): no Google auto-backup of app data, so the SQLite workspaces
    // (student records, unsynced changes) and the device index are not copied to the cloud. Note: on Android 12+
    // this flag does not stop device-to-device transfer; that needs `dataExtractionRules` (not configured yet).
    allowBackup: false,
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
