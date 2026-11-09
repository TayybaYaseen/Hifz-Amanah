# ADR-018 · Quran reference snapshot and offline SQLite cache

**Status:** **Accepted in direction, 2026-11-09** (DEC-B75 approves option A; DEC-B79 approves the licence-withdrawal
rule with clarifications). **This revised text awaits product-owner review before implementation. Nothing here is
built.** Implementation plan: [F06-snapshot-implementation-plan.md](../handover/F06-snapshot-implementation-plan.md).
**Feature:** F06 (US-025; F06-AC24, whose E2E test is pending). **Requirements:** FR-SAB-014 (DEC-B72, delivery
DEC-B75), FR-SAB-001, FR-SAB-008, FR-SAB-009, FR-SAB-011, FR-SAB-013, NFR-OFF. **Builds on:** ADR-017 (accepted),
ADR-015 (sync v1, **unchanged**), ADR-016 (RLS), AGENTS §7.

## 1. Context

Teachers record Sabaq, Sabqi, and Manzil offline. Picking a Surah/Ayat range, deriving its Para, validating it, and
pre-filling Total Lines need the madrasa's reference data: Surahs, Paras, and the active layout's Ayat lines. Today the
app reads these online (`GET /quran/surahs|paras|line-count`).

Reference data differs from F12 sync data:
- it is read-only on devices;
- it changes rarely (an Admin correction, a new dataset version, a licence change);
- it is the same for every staff member of a madrasa;
- it is licensed, so distribution must be controllable and withdrawable (FR-SAB-011).

## 2. Decision

1. **One versioned, checksummed snapshot per madrasa** (DEC-B75), served by two read-only routes and cached whole on
   Teacher and Admin devices in SQLite. The cache is replaced atomically, with no deltas.
2. **Independent of F12.** The snapshot has its own routes and its own version check. The sync protocol, the outbox,
   and the change log are untouched (ADR-015).
3. **The cache is disposable.** It can be deleted and fetched again at any time. Student records never reference it.
4. **Device and server answer identically.** The device calls the same `packages/domain` functions (`paraFor`,
   `validateAyahRange`, `countLines`) on the cache as the server does on Postgres, and the server re-validates on sync.
5. **Licence withdrawal** (DEC-B79): withdrawn data is excluded from every future snapshot; the server marks the
   affected snapshot versions revoked; a device deletes revoked cached data on its next successful online connection.
   An offline device cannot be wiped remotely, and nothing in the app or docs may claim otherwise.
6. **Verification boundary** (DEC-B78): the snapshot carries `layoutVerified`, which is true only when the madrasa's
   active layout is a production (non-synthetic) import with an approved, signed review. It reports the human
   reviewer's sign-off; it is not an automated proof that the layout matches the physical Mushaf.

## 3. Server

### 3.1 Routes

Owner, Admin, and Teacher (`quran.view`); Student and Parent get `403 FORBIDDEN`. The organization comes from the
session's membership only; the routes take no organization ID. Both run inside `withTenant` (ADR-016).

| Route | Purpose |
|---|---|
| `GET /quran/reference/version?format=1&have=<referenceVersion>` | Cheap check, called on every refresh trigger. `have` (optional) is the device's cached version; the answer says whether it is current, superseded, or **revoked** |
| `GET /quran/reference/snapshot?format=1` | The full snapshot. `If-None-Match: "<referenceVersion>"` equal to the current version gives `304` |

The exact request/response schemas are in the implementation plan §2 and will live in
`packages/contracts/src/quran-reference.ts` (Zod).

### 3.2 `referenceVersion`

- The snapshot body is the **canonical JSON** of its content (sorted keys, no insignificant whitespace, UTF-8, numbers
  as integers only). The body does not contain its own version.
- `referenceVersion = sha256(body)` as 64 lowercase hex characters. It is content-addressed: the same content gives
  the same version on every server instance, and any change (an Admin edit, a new import, a layout activation, a
  sign-off, a licence change) gives a new one.
- The `snapshotFormatVersion` is inside the body, so the same data in two formats has two versions.
- The device verifies `sha256(received body) == ETag == /version.referenceVersion` before applying anything.

To avoid rebuilding on every check, the server caches the built body keyed by a **stamp** computed in one query inside
the tenant transaction: the format, the max `updated_at` and row count of `quran_surahs` and `quran_paras`, the active
layout import id per edition, the import's review fields, and the latest licence-record id of every source behind the
active imports. A miss rebuilds the body (milliseconds at this size).

### 3.3 Payload (format 1)

```json
{
  "snapshotFormatVersion": 1,
  "edition": { "code": "INDOPAK_16_LINE", "linesPerPage": 16, "publisher": null, "printingId": null, "pageCount": null },
  "layout": { "importId": null, "verified": false, "withdrawn": false },
  "metadataWithdrawn": false,
  "surahs": [[1, "<nameAr as stored>", "<nameTranslit as stored>", 0]],
  "paras": [[1, 1, 1, 0, 0]],
  "lines": [[1, 2, 1, 1, 2]],
  "attribution": []
}
```

The values are illustrative placeholders, not data. Compact rows keep the payload small:
- `surahs`: `[number, nameAr, nameTranslit, ayahCount]`; `nameAr` is byte-exact as stored (BR-15, AGENTS §8).
- `paras`: `[number, startSurah, startAyah, endSurah, endAyah]`.
- `lines`: **Ayat lines only** (DEC-B77), `[page, line, surah, ayahStart, ayahEnd]`. That is all `countLines` needs.
  Surah-heading and Bismillah lines, word positions, and source word IDs stay on the server, which minimises what is
  redistributed (FR-SAB-011).
- `attribution`: required credit text of the sources in use, if any (format to be fixed by OD-QR-9).
- No Quran text, no internal note, no student data, no user data.

### 3.4 Licence check at distribution time and revocation (DEC-B79)

A licence can be withdrawn after import, by a new licence record whose status is `REFUSED` or
`LICENSE_REVIEW_REQUIRED`. The snapshot builder therefore re-checks the **current** licence status of every source
behind the active imports on every build:
- **Layout source no longer cleared:** `lines` is empty, `layout.importId` is null, `layout.withdrawn` is true.
  Devices fall back to manual Total Lines (FR-SAB-008).
- **Metadata source no longer cleared:** `surahs` and `paras` exclude every row whose `import_id` belongs to an import
  using that source, and `metadataWithdrawn` is true. Whether an Admin-edited row (`source = ADMIN`) that still carries
  such an `import_id` is excluded is plan question **P1**; the proposal is to exclude it.

**Revoked versions.** Every snapshot the server serves is recorded in a manifest table (`quran_reference_snapshots`,
new migration 0011, plan §3) with the import ids and source ids it contains. When a licence record withdraws a source:
1. the licence command, in the same transaction as the new licence record, sets `revoked_at` and
   `revoked_reason = 'LICENCE_WITHDRAWN'` on every manifest row containing that source, and writes an audit event
   `quran.reference.revoked` per affected organization;
2. as a safety net, `/version` also treats a `have` version as revoked if any of its sources is not cleared now, and
   records the revocation then;
3. a revoked version is never served again (it cannot be: its content is no longer what the builder produces).

The answer to `/version?have=<revoked>` is `cached.status = "REVOKED"`. The device then deletes its cache (§4.5).
Student, Parent, and staff records are never changed by a revocation.

### 3.5 Size (estimate, to be measured)

- A 16-line, 548-page layout has at most 8,768 lines, fewer once heading lines are excluded. As compact rows that is
  about 0.15 MB of JSON, roughly 40–50 KB gzipped. Surahs and Paras add a few KB.
- This is an estimate. The real figure is measured on the approved dataset before release (ADR-017 §8.2).

## 4. Device (SQLite, Teacher/Admin only)

### 4.1 Local schema (workspace migration 4; the outbox is never touched)

```text
ref_meta(singleton=1, reference_version, snapshot_format_version, edition_code, layout_import_id, layout_verified,
         layout_withdrawn, metadata_withdrawn, fetched_at, checked_at, last_error_code NULL, last_error_at NULL,
         next_check_at, revoked_version NULL, revoked_at NULL)
ref_surahs(number PK, name_ar, name_translit, ayah_count)
ref_paras(number PK, start_surah, start_ayah, end_surah, end_ayah)
ref_layout_lines(page, line, surah, ayah_start, ayah_end, PRIMARY KEY (page, line))
ref_attribution(position PK, text)
```

The tables live in the per-account, per-organization workspace database (F12 §8.1). There are no foreign keys to or
from entity tables or the outbox.

### 4.2 Cache lifecycle

```text
 NONE ──fetch ok──▶ CURRENT ──/version: SUPERSEDED──▶ fetch ──▶ CURRENT (new version)
   ▲                  │  ▲
   │                  │  └── /version: CURRENT or 304 (only checked_at changes)
   │                  ├── /version: REVOKED ──▶ delete ref_* ──▶ NONE ──▶ fetch current
   │                  ├── 403 ACCESS_REVOKED ──▶ delete ref_* + F12 workspace lock
   │                  └── offline / 5xx / timeout ──▶ stays CURRENT (backoff)
   └── corrupt ref_meta, unreadable format, local cache migration ──▶ delete ref_* ──▶ NONE
```

**Initial sync (background).**
1. After a successful online sign-in and the F12 bootstrap, `ReferenceSync.ensure()` runs. It never blocks sign-in,
   navigation, or Daily Entry.
2. With no cache: `GET /version`, then `GET /snapshot`.
3. **Verify** before applying: decompress, `sha256(body)` equals the ETag and the `/version` answer; the format is
   supported; the body passes the Zod schema; row-level sanity (Surah numbers 1–114 unique, Para numbers unique, line
   keys unique, `ayahEnd ≥ ayahStart`). Any failure discards the download.
4. **Swap atomically** in one SQLite transaction: delete the `ref_*` rows, insert the new rows, write `ref_meta`. A
   crash rolls back to the previous state.
5. **UI states** (design.md §8): while fetching, "Preparing Quran references…"; on failure, the empty state "No Quran
   reference data yet" with **Retry**. Daily Entry stays usable: Para is still accepted, and Total Lines is entered by
   hand (FR-SAB-008 fallback).

**Refresh triggers** (each calls `/version?have=`; a single-flight guard prevents overlap):
- app start, or return to foreground, while online;
- connectivity regained;
- after each successful F12 sync cycle (timing only, no protocol coupling);
- at least every 24 hours while the app runs;
- **Settings → Quran references → Refresh**.

`/version` answers `CURRENT` → only `checked_at` changes. `SUPERSEDED` or `UNKNOWN` → fetch the snapshot (with
`If-None-Match`) and repeat steps 3–4; the old cache stays usable until the new one is verified. `REVOKED` → §4.5.

**Rejected alternative:** row-level deltas through F12's change log. It would couple licensed reference data to the
sync protocol, need tombstones for re-imports, and save almost nothing at this size.

### 4.3 Offline availability

- The pickers, `paraFor`, `validateAyahRange`, and `countLines` run on `ref_*` through the same `packages/domain`
  functions as the server, so results match for the same `referenceVersion` (F06-AC24).
- A portion records the `layoutImportId` its Total Lines came from, and whether the count came from the layout or was
  entered by hand (FR-SAB-008). These are F05 entity fields; F12 is not changed.
- Settings shows the cache's age and state ("Quran references updated 3 days ago", "Line layout not available").

### 4.4 Failure handling

| Failure | Behaviour |
|---|---|
| No network, timeout, 5xx | Keep the current cache. Retry with backoff (1 min, doubling to 1 h; reset on success) and record `last_error_code`. With no cache, the empty state with Retry |
| Checksum, schema, or sanity mismatch | Discard the download; keep the current cache. Record `CHECKSUM_MISMATCH` or `SCHEMA_INVALID`; retry once, then back off. Never apply a partial or unverified snapshot |
| `426 UPGRADE_REQUIRED` | Keep the current cache if its format is still readable; show the app-update prompt (as F12 does) |
| `401 SESSION_EXPIRED` | Keep the cache; check again after the next sign-in |
| App killed mid-swap | The SQLite transaction rolls back; the previous snapshot remains |
| Local cache corrupted (`ref_meta` missing or unreadable) | Treat as no cache: delete the `ref_*` rows and fetch again |

### 4.5 Revocation on the device

| Trigger | Behaviour |
|---|---|
| `/version` says `cached.status = REVOKED` (licence withdrawn, DEC-B79) | In one transaction: delete **all** `ref_*` rows and record `revoked_version` and `revoked_at` in `ref_meta`. Then fetch the current snapshot, which no longer contains the withdrawn data. Show a neutral notice in Settings ("Quran references were updated by your madrasa"); no record changes |
| `403 ACCESS_REVOKED` on any call (membership revoked) | Delete the `ref_*` rows and lock the workspace as F12 does |
| Sign-out, workspace purge (F12 retention) | The `ref_*` tables go with the workspace database |

**What this does not do.** A device that stays offline keeps its cached copy until it next connects successfully (or
is signed out, or the app is uninstalled). The server cannot reach it. The docs, the UI, and any licence answer must
say "removed on the next successful online connection", never "wiped remotely" or "deleted immediately".

### 4.6 Data integrity

- **No record depends on the cache.** Records store canonical values: Para number, Surah, Ayat, the confirmed Total
  Lines with its source, and the layout import id (ADR-017 §3.10). A refresh or a revocation never changes a record.
- **Server authority.** Every portion is re-validated on sync against the server's current metadata (FR-SAB-009). A
  device-validated range that a later Admin correction made invalid is `REJECTED VALIDATION`, so it is
  action-required and never silently accepted. Existing records that no longer fit are listed for review and never
  changed (DEC-B32).

### 4.7 Backward compatibility

- The server serves format N and N−1 during a release overlap. The client asks for the highest format it supports and
  ignores unknown fields.
- **Cache-schema changes:** a workspace migration drops and recreates the `ref_*` tables, and the app refetches. This
  is safe because the cache is disposable; the migration never touches the outbox (tested with pending operations).
- **Dataset format changes** (seed format 2 → 3) do not affect devices; only the server's builder changes.
- **No F12 protocol change.** Older app versions without the cache keep working online as today.

## 5. Security and privacy

- **Access:** staff roles only; the organization comes from the session (AGENTS §6). It runs inside `withTenant`, with
  a cross-tenant probe test (AC-SEC). `have` is a hash, checked against this organization's manifest only; a version
  from another organization answers `UNKNOWN`, never revealing that it exists elsewhere.
- **No content beyond what is needed:** no internal notes, student data, Quran text, or word-level data.
- **Rate limit:** a light per-user limit on `/snapshot` (refreshes are at most a few per day).
- **Android backup is off** (`allowBackup: false`, F12-AC20), so the cache is not copied to cloud backups.
- **Audit:** `quran.reference.revoked` per organization when a licence change revokes versions. Serving a snapshot is
  not audited (it is a read), but the manifest records which versions were built and when.

## 6. Legal and retention implications of already-downloaded data (DEC-B79)

These are facts about the design, recorded for the licence negotiation (OD-QR-3). **They are not legal advice and
need legal review before any licence is accepted.**

1. **Copies on devices.** Every staff device that synced holds a copy of the Ayat-line layout and the metadata in its
   app sandbox. A licence withdrawal removes that copy only when the device next connects successfully. A device that
   never reconnects keeps it until sign-out or uninstall. The licence terms should therefore expressly permit device
   caching and accept removal "on next connection".
2. **No cloud backup copies** (Android auto-backup is disabled). Copies taken outside the app (rooted devices,
   screenshots) cannot be controlled by any app.
3. **Server copies.** Withdrawn layout and metadata rows stay in Postgres (history tables have no deletes, AGENTS
   §12), unused and no longer distributed. Whether a licensor can require their deletion, and how that interacts with
   audit retention, is plan question **P2**.
4. **Derived values in records.** Stored records keep canonical numbers: Surah and Ayat numbers, Para numbers, and a
   confirmed Total Lines count with its layout import id. These are the madrasa's records, never recalculated or
   deleted by a withdrawal (FR-SAB-008). Whether line counts derived from a withdrawn layout may be retained is part of
   the legal review (P2).
5. **Evidence kept.** The manifest (which versions contained which sources, when they were built and revoked), the
   licence records, and the audit events show what was distributed and when distribution stopped.
6. **Optional limit on offline exposure.** A maximum cache age after which an offline device stops using the snapshot
   would bound how long withdrawn data stays usable offline, at the cost of offline line counts on devices that stay
   offline longer. It is **not** part of this design; plan question **P3**.

## 7. Testing

The detailed test plan is in the implementation plan §6. In short:

| Level | Tests |
|---|---|
| Unit (domain/contracts) | Canonical JSON and SHA-256 stable; compact rows round-trip; device and server `countLines`/`paraFor`/`validateAyahRange` agree on the same synthetic snapshot; the withdrawal filter |
| Integration (API) | `/version` and `/snapshot`; `304`; the version changes after an Admin edit, an import, a sign-off, and a licence change; `REVOKED` after withdrawal; Student/Parent 403; cross-tenant; `426`; no internal note or Quran text in the payload |
| Mobile unit | Verify-then-swap and rollback; checksum mismatch keeps the old cache; revocation deletes it; `ACCESS_REVOKED`; the workspace migration with pending outbox ops; backoff; single flight |
| E2E | F06-AC24 (API: device-side domain functions on the snapshot match the server) and a Maestro offline flow |

## 8. Consequences

- **Positive:** offline pickers and line counts; no F12 change; licensed data stays controllable and withdrawable; a
  small, verifiable payload; evidence of what was distributed.
- **Negative:** a second, small synchronization mechanism, a server manifest table, a workspace migration, and a
  Settings element.
- **Residual risk:** an offline device keeps withdrawn data until it reconnects (§6). Readiness risk S3 is addressed
  by requiring licence terms that cover device caching (OD-QR-3) and by the revocation rule (§3.4).

## 9. Open points for the product owner

The plan questions P1–P4 ([implementation plan §8](../handover/F06-snapshot-implementation-plan.md)) and OD-QR-9
(attribution text and where it is shown).
