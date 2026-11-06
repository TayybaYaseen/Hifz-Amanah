# HifzAmanah mobile app

React Native + Expo SDK 54, Android-first (ARCHITECTURE.md §3.1). TypeScript strict, React Navigation, i18next
with ICU messages, `expo-secure-store` for the refresh token.

## Run

| Task | Command (from `apps/mobile`) |
|---|---|
| Metro dev server | `npm start` |
| Build and run on an emulator or device (needs the Android SDK and a JDK) | `APP_ID=<id> APP_VARIANT=development npm run android` |
| Bundle the JavaScript for Android, without a device (checks the whole app compiles) | `npm run bundle:android` |
| Typecheck | `npm run typecheck` (also part of the root `npm run typecheck`) |
| Unit tests (session, errors, catalogues, direction) | root `npm test` |

- **The app is Android only** (`platforms: ['android']`). Opening `http://localhost:8081` in a browser shows a JSON
  manifest: that is Metro's answer to an Android client, not an error. There is no web build.
- **`APP_ID`** is the Android application ID. **DEFERRED: DEC-B55.** Builds and Maestro flows take it from the
  environment until it is chosen.
- **`EXPO_PUBLIC_API_URL`** sets the API address. The default is `http://10.0.2.2:3000`: the host machine as seen from
  the Android emulator, where `npm run api:e2e-server` listens.
- **`APP_VARIANT=development`** allows plain HTTP for that local API. Release builds allow HTTPS only.

## Run in Expo Go on a phone

1. Install Expo Go from the Play Store. It must support Expo SDK 54; if it says the project is incompatible, use
   the debug build (`npm run android`) instead.
2. From the repository root, start the API: `npm run api:e2e-server`.
3. From `apps/mobile`, start Metro with the API address the phone can reach:
   - **USB** (with USB debugging on): `adb reverse tcp:3000 tcp:3000`, then
     `APP_VARIANT=development EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --go`
   - **Same Wi-Fi:** `APP_VARIANT=development EXPO_PUBLIC_API_URL=http://<PC LAN IP>:3000 npx expo start --go`
     (allow Node through the Windows firewall)
4. Scan the QR code in the terminal with Expo Go, or press `a` to open it on a USB-connected phone.
5. Sign in with a seeded test account, for example `teacher-a1` / `E2e-Test-Pass-1`.

## Structure

```text
src/
  api/          HTTP client and error-code mapping (plain TypeScript, unit-tested)
  auth/         SessionManager (plain TypeScript, unit-tested) and its React provider
  i18n/         locales (en, ur, ur-Latn), direction helpers, LocaleProvider
  theme/        design tokens (design.md §2)
  components/   AppScreen, AppText, Button, Field, Notice, Card, LanguagePicker
  features/     auth, home, profile, accounts
  navigation/   RootNavigator: what may be shown, from the session state
```

## Security

- The **refresh token** lives only in `expo-secure-store`. The **access token** lives only in memory.
- A 401 triggers one shared refresh. Parallel requests wait for it, so a rotated token is never replayed, which
  the server would treat as theft.
- If the refresh is refused, the app shows the **session-expired prompt** with the User ID kept.
- **Sign-out** sends the refresh token, so it works after the access token has expired. The device forgets its
  tokens even when it is offline.
- **Data screens exist only while signed in.** After sign-out or session expiry, Back cannot reach them.
- **Owner/Admin:** no madrasa data appears before two-factor sign-in succeeds, and on the first sign-in, not before
  the recovery codes are confirmed as saved.

## F01 status

- **Screens:**
  - Sign-in with a language picker
  - Forgot password
  - Two-factor setup and verification, with recovery codes
  - Session expired
  - Role home and More
  - My profile: email change needs the current password (DEC-B69); change password; new recovery codes
  - Accounts for Owner/Admin: list, create, set password, deactivate, reset an Admin's two-factor setup
- **Mobile E2E:** four of the five F01 Maestro flows are written and no longer pending. `session-expired.yaml`
  stays pending because it needs an unsynced daily entry (F05, F12).
- **Not run yet:** none of the flows has run. This machine has no Maestro CLI, Android SDK, or emulator, and the
  application ID is deferred.
- **Not yet built:**
  - App lock (NFR-OFF-011) and the unsynced-changes warning at sign-out arrive with F12.
  - Per-account separation of cached data on a shared device arrives with F12's local database.
  - TanStack Query arrives with the first cached server lists.
  - Component tests: screens are kept thin, and their logic is unit-tested in plain TypeScript. A React Native
    component-test setup is not configured yet.
- **Open items from the mobile code review (2026-11-02):** the Highs and Mediums are fixed and have regression
  tests: late responses after sign-out, refresh errors, the offline launch state, keyboard handling, readable
  notices, the account language, and the flow fixes. Still open:
  - If the app is killed on the recovery-codes screen, the codes are lost while two-factor is already on. This
    needs a server-side "codes acknowledged" step.
  - Screens that show the authenticator key or recovery codes are not yet protected from screenshots
    (`FLAG_SECURE`).
  - The native stack header (back arrow, title) does not mirror in Urdu.
  - Some catalogue messages are not shown yet (`reset.done`, `accounts.created`, `common.offline`).
  - A language chosen on the Sign-in screen is replaced by the account's saved language after sign-in.
