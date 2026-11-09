# ADR-018 · Quran reference snapshot and offline SQLite cache

**Status:** **Proposed, 2026-11-09. Not approved and not implemented.** It depends on OD-QR-7 (proposal:
[F06-decision-proposal-OD-QR-7-10-11.md](../handover/F06-decision-proposal-OD-QR-7-10-11.md)). Nothing here is built.
**Feature:** F06 (US-025; F06-AC24, whose E2E test is pending). **Requirements:** FR-SAB-014 (approved, DEC-B72),
FR-SAB-001, FR-SAB-008, FR-SAB-009, FR-SAB-011, NFR-OFF. **Builds on:** ADR-017 (accepted), ADR-015 (sync v1,
**unchanged**), ADR-016 (RLS), AGENTS §7.

## 1. Context

Teachers record Sabaq, Sabqi, and Manzil offline. Picking a Surah/Ayat range, deriving its Para, validating it, and
pre-filling Total Lines need the madrasa's reference data: Surahs, Paras, and the active layout's Ayat lines. Today the
app reads these online (`GET /quran/surahs|paras|line-count`).

Reference data differs from F12 sync data:
- it is read-only on devices;
- it changes rarely (an Admin correction, a new dataset version);
- it is the same for every staff member of a madrasa;
- it is licensed, so distribution must be controllable (FR-SAB-011).

## 2. Decision (proposed)

1. **One versioned, checksummed snapshot per madrasa**, served by two read-only routes and cached whole on Teacher and
   Admin devices in SQLite. It replaces the cache atomically, with no deltas.
2. **Independent of F12.** The snapshot has its own routes and its own version check. The sync protocol, the outbox,
   and the change log are untouched (ADR-015).
3. **The cache is disposable.** It can be deleted and fetched again at any time. Student records never reference it.
4. **Device and server answer identically.** The device calls the same `packages/domain` functions (`paraFor`,
   `validateAyahRange`, `countLines`) on the cache as the server does on Postgres, and the server re-validates on sync.

## 3. Server

### 3.1 Routes (Owner, Admin, Teacher; Student and Parent get 403; organization from the membership)

| Route | Result |
|---|---|
| `GET /quran/reference/version` | `200 { referenceVersion, snapshotFormatVersion, sha256, bytes }`. Cheap; called on every refresh check |
| `GET /quran/reference/snapshot?format=1` | `200` gzip JSON body with headers `ETag: "<referenceVersion>"` and `X-Content-SHA256: <sha256 of the uncompressed canonical JSON>`. `If-None-Match` equal to the current version gives `304`. A `format` newer than the server supports gives `400`; older than the minimum gives `426 UPGRADE_REQUIRED` |

Both routes run inside `withTenant` (ADR-016). An ID belonging to another organization is never accepted: the
organization comes from the session only.

### 3.2 `referenceVersion`

`referenceVersion = sha256(canonicalJson(snapshot content))`, which is content-addressed. The same content always
gives the same version on every server instance, and any change (an Admin edit, a new import, a layout activation)
gives a new one.

To avoid rebuilding the snapshot on every check, the server keeps a small cache keyed by a **stamp**:
`(snapshotFormatVersion, max(quran_surahs.updated_at, row_version sum), max(quran_paras…), the active layout import id,
the latest licence-record id of the active imports' sources)`. The stamp is computed inside the tenant transaction with
one query. A miss rebuilds the snapshot, about the size of the layout, in milliseconds.

### 3.3 Payload (format 1)

```json
{
  "snapshotFormatVersion": 1,
  "referenceVersion": "<sha256>",
  "edition": { "code": "INDOPAK_16_LINE", "linesPerPage": 16, "publisher": null, "printingId": null, "layoutVerified": false },
  "layoutImportId": "<uuid or null>",
  "surahs": [{ "number": 1, "nameAr": "<as stored>", "nameTranslit": "<as stored>", "ayahCount": 0 }],
  "paras": [{ "number": 1, "start": [1, 1], "end": [0, 0] }],
  "lines": [[1, 2, "A", 1, 1, 2]],
  "attribution": ["<required credit text, if any (OD-QR-9)>"]
}
```

The values above are illustrative placeholders, not data.
- `lines` holds **Ayat lines only**, as compact rows `[page, line, type, surah, ayahStart, ayahEnd]`. That is all
  `countLines` needs. Headings, Bismillah lines, word positions, and source word IDs stay on the server. This minimises
  what is redistributed (FR-SAB-011) and keeps the cache small.
- There is no Quran text, no internal note, and no student data. `nameAr` is byte-exact (BR-15).

### 3.4 Licence check at distribution time (new rule, proposed)

The loader checks licences at import. A licence can be **withdrawn later**, by a new `REFUSED` record. So the snapshot
builder re-checks the current licence status of every source behind the active imports:
- If a **layout** source is no longer cleared, `lines` is sent empty and `layoutImportId` null. Devices then fall back to
  manual Total Lines (FR-SAB-008).
- If a **metadata** source is no longer cleared, the snapshot carries only Admin-entered rows (`source = ADMIN`) and
  flags `metadataWithdrawn: true`.

Records are never touched. *This needs product-owner confirmation as part of OD-QR-7.*

### 3.5 Size (estimate, to be measured)

- A 16-line, 548-page layout has at most 548 × 16 = 8,768 lines, fewer once heading lines are excluded. As compact rows
  that is about 0.2 MB of JSON, roughly 50 KB gzipped.
- Surahs and Paras add a few KB.
- This is an estimate. The real figure is measured on the approved dataset before release (ADR-017 §8.2).

## 4. Device (SQLite, Teacher/Admin only)

### 4.1 Local schema (a new local migration; the outbox is never touched)

```text
ref_meta(singleton=1, reference_version, snapshot_format_version, sha256, edition_code, layout_import_id,
         layout_verified, fetched_at, checked_at, last_error_code NULL, last_error_at NULL, next_check_at)
ref_surahs(number PK, name_ar, name_translit, ayah_count)
ref_paras(number PK, start_surah, start_ayah, end_surah, end_ayah)
ref_layout_lines(page, line, surah, ayah_start, ayah_end, PRIMARY KEY (page, line))
ref_attribution(position PK, text)
```

The tables live in the per-account, per-organization database (F12 §8.1). Nothing references them: there are no foreign
keys to or from entity tables or the outbox.

### 4.2 Initial synchronization

1. After a successful online sign-in and the F12 bootstrap, `ReferenceSync.ensure()` runs. It does not block sign-in.
2. With no cache: `GET /version`, then `GET /snapshot`.
3. **Verify:** gunzip, recompute the SHA-256 over the canonical JSON, and compare it with `X-Content-SHA256` and
   `/version`. Check `snapshotFormatVersion` is supported, and validate the shape (Zod schema from
   `packages/contracts`).
4. **Swap atomically** in one SQLite transaction: delete the `ref_*` rows, insert the new rows, and write `ref_meta`. A
   crash rolls back to the previous state.
5. **UI states** (design.md §8):
   - while fetching: "Preparing Quran references…";
   - on failure: the existing empty state, "No Quran reference data yet", with **Retry**.

   Daily Entry stays usable. Para is still accepted, and Total Lines can be entered by hand (FR-SAB-008 fallback).

### 4.3 Incremental updates (full replace, conditional)

- **When to check:**
  - app start or return to foreground while online;
  - after each successful F12 sync cycle (timing only, no protocol coupling);
  - at least every 24 hours;
  - **Settings → Quran references → Refresh**.
- **How:** `GET /snapshot` with `If-None-Match: "<cached version>"`. A `304` updates only `checked_at`; a `200` repeats
  steps 3–4. No deltas: the snapshot is small, and a full replace cannot drift.
- **Rejected alternative:** row-level deltas through F12's change log. It would couple licensed reference data to the
  sync protocol, add tombstones for re-imports, and save almost nothing at this size.

### 4.4 Offline availability

- The pickers, `paraFor`, `validateAyahRange`, and `countLines` run on `ref_*` through the same `packages/domain`
  functions as the server, so results match for the same `referenceVersion` (F06-AC24).
- A portion records the `layoutImportId` its Total Lines came from, and whether the count came from the layout or was
  entered by hand (FR-SAB-008). These are F05 entity fields; F12 is not changed.
- The cache's age is shown in Settings ("Quran references updated 3 days ago").

### 4.5 Failed synchronization and recovery

| Failure | Behaviour |
|---|---|
| No network or timeout | Keep the current cache. Retry with exponential backoff (1 min, then doubling to 1 h) and record `last_error_code`. With no cache yet, show the empty state with Retry |
| Checksum or schema mismatch | Discard the download and keep the current cache. Record `CHECKSUM_MISMATCH`; retry once, then back off. Never apply a partial or unverified snapshot |
| `426` (format too old) | Keep the current cache usable if its format is still readable, and show the app-update prompt (as F12 does) |
| `403 ACCESS_REVOKED` | **Delete** the `ref_*` rows (licensed data must not stay on a revoked device; readiness risk S10) and lock the workspace as F12 does |
| `401 SESSION_EXPIRED` | Keep the cache; refresh after the next sign-in |
| App killed mid-swap | The SQLite transaction rolls back; the previous snapshot remains |
| Local cache corrupted (e.g. `ref_meta` missing) | Treat as no cache: delete the `ref_*` rows and fetch again |

### 4.6 Data integrity

- **No record depends on the cache.** Records store canonical values: Para number, Surah, Ayat, the confirmed Total
  Lines with its source, and the layout import id (ADR-017 §3.10). A refresh never changes a record.
- **Server authority.** Every portion is re-validated on sync against the server's current metadata (FR-SAB-009). If an
  Admin correction made a device-validated range invalid, the operation is `REJECTED VALIDATION`, so it is
  action-required and never silently accepted. Existing records that no longer fit are listed for review and never
  changed (DEC-B32).
- **Integrity checks:** SHA-256 end to end, a schema check before the swap, and a single-transaction swap.

### 4.7 Backward compatibility

- `snapshotFormatVersion` lets the server serve format N and N−1 during a release overlap. The client asks for the
  highest format it supports and ignores unknown fields.
- **Cache-schema changes:** a local migration drops and recreates the `ref_*` tables and refetches. This is safe because
  the cache is disposable, and the migration never touches the outbox (AGENTS §7: migration tests run with pending ops).
- **Dataset format changes** (seed format 2 → 3) do not affect devices; only the server's snapshot builder changes.
- **No F12 protocol change.** Older app versions without the cache keep working online as today.

## 5. Security and privacy

- **Access:** staff roles only, with the organization taken from the session (AGENTS §6). It runs inside `withTenant`,
  and a cross-tenant probe test is required (AC-SEC).
- **No content beyond what is needed:** no internal notes, student data, or Quran text, and no word-level data.
- **Rate limit:** the snapshot route has a light per-user limit, since a refresh is at most a few per day.
- **Revocation:** delete the cache (§4.5).

## 6. Testing (when built)

| Level | Tests |
|---|---|
| Unit | The builder's canonical JSON and SHA-256 are stable; the compact row encode/decode round-trips; device and server `countLines`/`paraFor`/`validateAyahRange` agree on the same synthetic snapshot; the withdrawn-licence rule (§3.4) |
| Integration (API) | `/version` and `/snapshot`; `ETag` gives `304`; the version changes after an Admin edit and after a new import; Student and Parent get 403; cross-tenant isolation; `426` for old formats; a withdrawn layout licence empties `lines` |
| Mobile unit | Atomic swap and rollback; checksum mismatch keeps the old cache; revocation deletes it; the local migration with pending outbox ops; backoff schedule |
| E2E | F06-AC24 (API parity) and a Maestro offline flow: sign in online, sync, airplane mode, pick a range, then Para, the error, and Total Lines match the server |

## 7. Consequences

- **Positive:** offline pickers and line counts; no F12 change; licensed data stays controllable and withdrawable; a
  small, verifiable payload.
- **Negative:** a second, small synchronization mechanism, plus a local migration and a Settings screen element.
- **Risks:** see the readiness review §9 (S1–S12). S3 (redistribution scope) is resolved by requiring the licence to
  cover device caching (OD-QR-3) and by the distribution-time check (§3.4).

## 8. Open points for the product owner

1. **OD-QR-7:** approve option A (this ADR).
2. **§3.4:** confirm that a withdrawn licence stops distribution of the affected data on the next refresh.
3. **OD-QR-9:** confirm that the attribution text travels with the snapshot and appears in Settings → About.
