# HifzAmanah mobile app

React Native + Expo SDK 54, Android-first (ARCHITECTURE.md §3.1). TypeScript strict, React Navigation, i18next
with ICU messages, `expo-secure-store` for the refresh token and the app-lock PIN hash. F12 adds the on-device
database and sync: `expo-sqlite`, `@react-native-community/netinfo` (connectivity), `expo-local-authentication`
(fingerprint shortcut for the app lock), and `expo-crypto` (secure random IDs, PIN hashing).

> **Native rebuild needed.** These are native modules: a development build (`npm run android`) made before F12 must
> be rebuilt before it can run the current JavaScript.

## Run

| Task | Command (from `apps/mobile`) |
|---|---|
| Metro dev server | `npm start` |
| Build and run on an emulator or device (needs the Android SDK and a JDK) | `APP_ID=<id> APP_VARIANT=development npm run android` |
| Bundle the JavaScript for Android, without a device (checks the whole app compiles) | `npm run bundle:android` |
| Typecheck | `npm run typecheck` (also part of the root `npm run typecheck`) |
| Unit tests (session, errors, catalogues, direction, local DB, outbox, sync engine, retention, app lock) | root `npm test` |

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
  components/   AppScreen, AppText, Button, Field, Notice, Card, LanguagePicker, sync banner
  features/     auth, home, profile, accounts, sync (Sync Queue, Conflict Review, sign-out warning,
                workspace locked), app-lock (set PIN, unlock, settings card)
  navigation/   RootNavigator: what may be shown, from the session state
  local-db/     SQL driver interface (driver.ts), expo-sqlite adapter (expoDriver.ts), versioned local migrations
                (migrations.ts); testing/nodeDriver.ts is the node:sqlite adapter for unit tests only
  sync/         outbox, sync engine (push/pull, backoff, conflicts), entity registry, retention and purge,
                workspace state, device index, SyncContext provider
  app-lock/     PIN and lock rules (lock.ts, plain TypeScript) and AppLockContext
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

## Offline data and sync (F12)

Rules and protocol: ARCHITECTURE.md §8 and [ADR-015](../../docs/adr/ADR-015-sync-protocol-idempotency-conflicts.md).
Teacher, Admin, and Owner only; Student and Parent stay online-only and read-only.

- **One SQLite file per account and organization** (`hifz-ws-<user>-<org>.db`), so people sharing a phone never see
  each other's cached data. A separate device index (`hifz-device.db`) lists the workspaces on the phone, their
  state (`ACTIVE`, `HELD` after "Sign out anyway", `LOCKED_REVOKED`), and the per-install device ID. It holds no
  student data.
- **Save path (NFR-OFF-002, F12-AC1):** the entity write and its outbox row are one SQLite transaction; "Saved on
  this device" shows only after it commits. "Synced" shows only after the server answers `APPLIED` (F12-AC9).
- **Local migrations (NFR-OFF-009, F12-AC16):** versioned and append-only, each in one transaction with its
  `PRAGMA user_version` bump. They never rewrite or delete `outbox` rows, only add columns. The unit tests run
  every migration over a populated outbox.
- **No entity tables yet.** Attendance (F04), daily records (F05), and homework (F08) add their tables as new local
  migrations and register them in `sync/registry.ts`. Until then the real app queues nothing; the engine is
  exercised with a test-only probe entity (`sync/testing/probe.ts`).
- **Revocation and sign-out:** `403 ACCESS_REVOKED` locks the workspace and purges synced rows; unsynced operations
  stay visible but locked and are purged on sign-out or 30 days later (F12-AC20). "Sign out anyway" purges the
  synced cache and keeps unsynced operations locked to that account for up to 30 days (decision Q14). Purged rows
  are overwritten (`PRAGMA secure_delete`, WAL truncated).
- **Unit tests** use Node's built-in `node:sqlite` behind the same driver interface, so the outbox, engine,
  migrations, and retention run in Vitest without a device. `nodeDriver.ts` is never imported by app code.
- The SQL driver is a small hand-written interface over `expo-sqlite`; Drizzle (named in the approved stack) is not
  used yet.

### App lock (F12-AC18, NFR-OFF-011; decision Q12)

- A 6-digit PIN is required as the base; fingerprint (Android Class 3 "strong" biometrics only) is an optional
  shortcut. Required for Owner/Admin at their first sign-in on the device; optional for Teacher. Locks after
  5 minutes in the background and on a cold start with a stored session.
- After 5 wrong PINs, or "Forgot PIN", the user signs in again online with User ID + password.
- **PIN storage threat model.** Only a salted hash is stored, in `expo-secure-store` (Android Keystore-backed):
  SHA-256 iterated 1,000 times over a random per-account salt. A 6-digit PIN has only 10⁶ values, so the hash alone
  would not resist offline guessing if it ever left secure storage. The protection relies on the Keystore keeping it
  on the device and on the 5-try lockout (the wrong-try counter fails closed). It does not replace encrypting the
  database (open item D1 below).

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
  - (Built in F12: app lock, the unsynced-changes warning at sign-out, and per-account cached data.)
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

## F12 status

- **Built:** local DB and migrations, outbox, sync engine, sync banner, Sync Queue, Conflict Review, sign-out
  warning, workspace-locked screen, app lock. Strings in `en`, `ur`, `ur-Latn`.
- **Mobile E2E:** the five `e2e/mobile/f12-sync` flows stay pending. They need real entities (F04, F05, F08), a device
  or emulator, and the application ID (DEC-B55). None has run.
- **Open items** (details in `docs/handover/F12-plan.md` §12):
  - The device database is not encrypted (SQLCipher, D1). Sync and PIN screens have no `FLAG_SECURE` (D2). The
    revoked, offline, and session-expired screens are not behind the app lock (D3).
  - **Backups:** `android.allowBackup` is `false` (`app.config.ts`), so Google auto-backup does not copy the
    workspaces. On Android 12+ this flag does not stop device-to-device transfer; that needs `dataExtractionRules`,
    which is not configured yet.
  - After an app restart while offline, staff cannot reach their work screens (offline cold start).
  - A reactivated account stays locked on the device until it signs out.
