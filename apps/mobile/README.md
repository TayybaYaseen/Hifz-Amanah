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
| Build and run on an emulator or device (needs the Android SDK and a JDK) | `APP_VARIANT=development npm run android` |
| Bundle the JavaScript for Android, without a device (checks the whole app compiles) | `npm run bundle:android` |
| Typecheck | `npm run typecheck` (also part of the root `npm run typecheck`) |
| Unit tests (session, errors, catalogues, direction, local DB, outbox, sync engine, retention, app lock) | root `npm test` |

- **The app is Android only** (`platforms: ['android']`). Opening `http://localhost:8081` in a browser shows a JSON
  manifest: that is Metro's answer to an Android client, not an error. There is no web build.
- The Android application ID is **`com.hifzamanah.app`** (SRS §17 DEC-B55, decided 2026-11-08), set in `app.config.ts`. It must
  never change after the first Play release.
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
  every migration over a populated outbox. v1: `outbox`, `sync_meta`, `conflicts`, `discards`. v2: `outbox.sent_count`,
  `sync_meta.last_server_time`, `discards.reason`, `deferred_changes`. v3: `row_sync_marks`,
  `sync_meta.refetch_requested` / `refetch_done`, `conflicts.last_checked_at`.
- **Saving edits:** a CREATE or COMMAND uses `outbox.saveWithOp`; every edit of an existing row **must** use
  `outbox.saveWithUpdate` (or `enqueueUpdate` inside a transaction). It derives the base version (the row's
  acknowledged `row_version`, or 1 with a dependency on the unsynced CREATE) and adds a dependency on the row's latest
  unsynced operation. F04, F05, and F08 never build `baseVersion` themselves.
- **Send order:** outbox `seq` order, dependencies first, and at most one operation per row at a time. A later edit
  waits for the earlier edit of the same row ("Waiting: an earlier change to this record must sync first").
- **Retry and discard:** Retry re-queues a `FAILED` change under a new `op_id` with its original `seq`, and is
  refused when a newer change of the same record has already synced (the user can discard it instead). Discarding an
  acknowledged edit makes the next pull start from a fresh snapshot, so the server's values come back.
- **Conflicts:** each open conflict is re-checked with the server at most once every 5 minutes, at most 50 per run,
  least recently checked first. A conflict that is no longer reachable turns its item into `FAILED` (`NOT_FOUND`).
- **No entity tables yet.** Attendance (F04), daily records (F05), and homework (F08) add their tables as new local
  migrations and register them in `sync/registry.ts`. Until then the real app queues nothing; the engine is
  exercised with a test-only probe entity (`sync/testing/probe.ts`).
- **Revocation and sign-out:** sign-out first refuses new saves, stops the sync engine, and waits for the run and saves
  in flight before it counts unsynced changes. `403 ACCESS_REVOKED` locks the workspace and purges synced rows; unsynced operations
  stay visible but locked and are purged on sign-out or 30 days later (F12-AC20). "Sign out anyway" purges the
  synced cache and keeps unsynced operations locked to that account for up to 30 days (decision Q14). Purged rows
  are overwritten (`PRAGMA secure_delete`, WAL truncated).
- **Unit tests** use Node's built-in `node:sqlite` behind the same driver interface, so the outbox, engine,
  migrations, and retention run in Vitest without a device. `nodeDriver.ts` is never imported by app code.
- The SQL driver is a small hand-written interface over `expo-sqlite`; Drizzle (named in the approved stack) is not
  used yet.

### Quran reference cache (F06, ADR-018)

Code: [`src/features/quran`](src/features/quran) (`referenceCache.ts`, `referenceSync.ts`, `referenceView.ts`,
`rangeCheck.ts`, `QuranReferenceContext.tsx`, `QuranReferenceScreen.tsx`). Owner, Admin, and Teacher only, in the
workspace database; Student and Parent never download it. F12 code, the outbox, and the sync protocol are not changed.

- **Workspace migration 5** (4 is F04 attendance) adds `ref_meta`, `ref_surahs`, `ref_paras`, `ref_layout_lines`, and
  `ref_attribution`. Nothing references them, so the cache is disposable. The existing F12 migration test replays
  every migration, including this one, over a populated outbox.
- **First sync** runs in the background after an online sign-in and never blocks sign-in or entry. **Refresh** runs
  on start, foreground, connectivity regained, after each F12 sync cycle, once a day, and from the Refresh button.
  Each check calls `GET /quran/reference/version?have=` and downloads only when the copy is not current.
- **Before activation** the download must have format 1, pass the strict Zod schema and row sanity checks, and its
  canonical bytes must hash (SHA-256, `expo-crypto`) to the announced version. Then the whole cache is replaced in one
  SQLite transaction. A failed, malformed, interrupted, or killed download leaves the last valid snapshot in place.
  Failures back off from 1 minute to 1 hour; Refresh ignores the backoff.
- **Revocation (DEC-B79):** a `REVOKED` answer deletes the cached rows at once and then fetches the current snapshot.
  `403 ACCESS_REVOKED`, or F12 locking the workspace, deletes them too. An offline device keeps its copy until its next
  successful check; nothing can reach it sooner.
- **No maximum age (P3):** an old snapshot stays usable offline. The status card shows the version, last download,
  update available, revoked, unavailable, and every failure, always as icon and text.
- **More → Quran references on this device** shows the status and the reusable `RangeFields`: offline Para,
  field errors, and the Total Lines pre-fill (or manual entry, always allowed). It is the isolated F06 host until F05
  Daily Entry exists (plan P4); F05 reuses `RangeFields` and `checkRange`.

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
  or emulator. None has run.
- **Open items** (details in `docs/handover/F12-plan.md` §12):
  - The device database is not encrypted (SQLCipher, D1). Sync and PIN screens have no `FLAG_SECURE` (D2). The
    revoked, offline, and session-expired screens are not behind the app lock (D3).
  - **Backups:** `android.allowBackup` is `false` (`app.config.ts`), so Google auto-backup does not copy the
    workspaces. On Android 12+ this flag does not stop device-to-device transfer; that needs `dataExtractionRules`,
    which is not configured yet.
  - After an app restart while offline, staff cannot reach their work screens (offline cold start).
  - A reactivated account stays locked on the device until it signs out.
