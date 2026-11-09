# F06 · Quran reference snapshot: implementation plan

**Status:** **Plan for product-owner review. Nothing is built.** Implementation starts only after approval.
**Date:** 2026-11-09. **Decisions:** DEC-B75 (OD-QR-7, option A), DEC-B76, DEC-B77, DEC-B78, DEC-B79.
**Design:** [ADR-018](../adr/ADR-018-quran-reference-snapshot-offline-cache.md). **Requirements:** FR-SAB-014,
FR-SAB-008, FR-SAB-009, FR-SAB-011, FR-SAB-013, NFR-OFF. **Stories / criteria:** US-025 (F06-AC24), US-024
(F06-AC26 distribution clause), US-026 (F06-AC20).

## 1. Scope and guardrails

**In scope:**
1. Versioned snapshot API (`/quran/reference/version`, `/quran/reference/snapshot`).
2. Android local cache (`ref_*` tables) with checksum and schema validation.
3. Background initial sync and refresh.
4. Revocation handling (licence withdrawal and access revocation).
5. F06-AC24 end-to-end test (API) and the offline mobile flow (Maestro).

**Guardrails:**
- Synthetic data only. No real Quran data is imported; the source catalogue and licence gate are never bypassed (the
  snapshot builder uses the same `cleared` check as the import gate).
- No F12 protocol, outbox, or change-log change (ADR-015). F12 code is touched only to call `ReferenceSync` after a
  sync cycle and on `ACCESS_REVOKED`, through existing hooks.
- Migrations: one new server migration **0011** (snapshot manifest, §3.1) and one new **workspace migration 4** on the
  device (§4.1). No shipped migration is edited. Both are listed here for explicit approval.
- F05 Daily Hifz entry continues as a parallel milestone; this plan does not change F05 entities.
- Nothing claims an automated match with the physical Mushaf (DEC-B78) or a remote wipe (DEC-B79).

## 2. Snapshot API contract

Schemas in `packages/contracts/src/quran-reference.ts` (Zod, strict). Errors use the API's existing envelope
`{ error: { code, message } }`.

### 2.1 `GET /quran/reference/version`

| Query | Rule |
|---|---|
| `format` | Integer, required. The highest snapshot format the app supports |
| `have` | Optional. 64 lowercase hex characters: the cached `referenceVersion` |

```ts
ReferenceVersionResponse = {
  snapshotFormatVersion: number;           // format the server will serve for this request
  referenceVersion: string;                // sha256 hex of the canonical body
  bytes: number;                           // uncompressed body length
  builtAt: string;                         // ISO-8601 UTC
  layout: { importId: string | null; verified: boolean; withdrawn: boolean };
  metadataWithdrawn: boolean;
  empty: boolean;                          // no Surah metadata at all for this madrasa
  cached?: {                               // present only when `have` was sent
    referenceVersion: string;
    status: 'CURRENT' | 'SUPERSEDED' | 'REVOKED' | 'UNKNOWN';
    revokedAt?: string;                    // when status = REVOKED
    reasonCode?: 'LICENCE_WITHDRAWN';      // when status = REVOKED
  };
}
```

`status` rules: `CURRENT` when `have` equals the current version; `REVOKED` when the manifest row for `have` (this
organization only) is revoked, or any of its sources is not cleared now; `SUPERSEDED` when the manifest row exists and
is not revoked; `UNKNOWN` otherwise (including a version from another organization).

### 2.2 `GET /quran/reference/snapshot`

| Request | Rule |
|---|---|
| `format` | Integer, required |
| `If-None-Match` | Optional, `"<referenceVersion>"`; equal to the current version gives `304` with no body |
| `Accept-Encoding: gzip` | Supported; the body is gzip-compressed on the wire |

`200` headers: `ETag: "<referenceVersion>"`, `Cache-Control: private, no-store`, `Content-Type: application/json`.
The body is the canonical JSON of `ReferenceSnapshotV1` (ADR-018 §3.3):

```ts
ReferenceSnapshotV1 = {
  snapshotFormatVersion: 1;
  edition: { code: string; linesPerPage: number; publisher: string | null; printingId: string | null; pageCount: number | null };
  layout: { importId: string | null; verified: boolean; withdrawn: boolean };
  metadataWithdrawn: boolean;
  surahs: [number, string, string, number][];          // number, nameAr, nameTranslit, ayahCount
  paras: [number, number, number, number, number][];   // number, startSurah, startAyah, endSurah, endAyah
  lines: [number, number, number, number, number][];   // page, line, surah, ayahStart, ayahEnd (Ayat lines only)
  attribution: string[];                               // DEFERRED: OD-QR-9 (wording and locales)
}
```

Canonical JSON: keys sorted, no whitespace, integers only, arrays ordered by their first columns. `referenceVersion =
sha256(body bytes)`.

### 2.3 Errors (both routes)

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION` | `format` missing or not an integer; `have` not 64 hex; `format` newer than the server supports |
| 401 | `SESSION_EXPIRED` | No or expired session |
| 403 | `FORBIDDEN` | Student or Parent |
| 403 | `ACCESS_REVOKED` | Membership removed (existing F12 behaviour) |
| 426 | `UPGRADE_REQUIRED` | `format` older than the minimum supported |
| 429 | `RATE_LIMITED` | Snapshot route: more than 30 requests per user per hour (proposed value, configurable) |

## 3. Server work (`apps/api`)

### 3.1 Migration 0011 `quran_reference_snapshots` (manifest)

```text
quran_reference_snapshots(
  organization_id uuid, reference_version char(64), snapshot_format_version int,
  bytes int, layout_import_id uuid NULL, import_ids uuid[], source_ids uuid[],
  built_at timestamptz, revoked_at timestamptz NULL, revoked_reason text NULL CHECK (revoked_reason IN ('LICENCE_WITHDRAWN')),
  revoked_by_licence_id uuid NULL,
  PRIMARY KEY (organization_id, reference_version))
```
RLS tenant policy (ADR-016); no deletes (trigger, as other history tables); `hifz_tenant` gets SELECT and INSERT, and
UPDATE of the `revoked_*` columns only. Indexed on `source_ids` (GIN) for the revocation update.

### 3.2 Modules and files

| File | Work |
|---|---|
| `packages/contracts/src/quran-reference.ts` | Zod schemas of §2 |
| `packages/domain/quran-ref/snapshot.ts` | Pure: `canonicalJson`, row encode/decode, a `ReferenceIndex` built from snapshot rows that feeds the existing `paraFor`, `validateAyahRange`, `countLines` |
| `apps/api/src/modules/quran-ref/snapshot-service.ts` | Build (stamp cache, licence filter, manifest upsert), `version(have)`, `snapshot(ifNoneMatch)` |
| `apps/api/src/modules/quran-ref/routes.ts` | The two routes, `quran.view`, rate limit on `/snapshot` |
| `apps/api/src/modules/quran-ref/sources.ts` | `recordLicence`: when the new status is not cleared, mark manifest rows containing the source revoked and audit `quran.reference.revoked`, in the same transaction |
| `apps/api/src/e2e/*` (test control) | Synthetic helpers: withdraw a synthetic source's licence |

The builder reuses the import gate's `cleared` predicate, so distribution and import can never disagree (F06-AC26).

## 4. Mobile work (`apps/mobile`)

### 4.1 Workspace migration 4

Creates `ref_meta`, `ref_surahs`, `ref_paras`, `ref_layout_lines`, `ref_attribution` (ADR-018 §4.1). It does not
touch `outbox`, `sync_meta`, or entity tables. A later change to these tables drops and recreates them.

### 4.2 Modules

| File | Work |
|---|---|
| `src/quran-ref/cache.ts` | Read the cache; `applySnapshot` (verify → one-transaction swap); `clearCache(reason)` |
| `src/quran-ref/verify.ts` | SHA-256 of the body (expo-crypto), Zod parse, row sanity checks |
| `src/quran-ref/ReferenceSync.ts` | `ensure()`, `check()`; single flight; backoff; status handling (`CURRENT`, `SUPERSEDED`, `UNKNOWN`, `REVOKED`) |
| `src/quran-ref/triggers.ts` | Sign-in bootstrap, app foreground, connectivity regained, after F12 sync cycle, 24-hour timer, manual Refresh |
| `src/quran-ref/useQuranReference.ts` | Offline-first lookups through `packages/domain` (`ReferenceIndex`): `paraFor`, `validateRange`, `countLines` |
| `src/features/quran/RangeFields.tsx` | Surah/Ayat range fields (design.md §4.7) on the cache, with field errors and the Total Lines pre-fill |
| `src/features/settings/…` | "Quran references": state, age, layout availability, Refresh, attribution (OD-QR-9) |
| `src/i18n/locales/{en,ur,ur-Latn}.ts` | All new strings in all three locales |

Only Owner, Admin, and Teacher workspaces run `ReferenceSync`. Student and Parent never download the snapshot.

### 4.3 UI states (design.md §8)

| State | Shown |
|---|---|
| Loading (no cache yet) | "Preparing Quran references…"; range fields usable, Total Lines manual |
| Empty / failed | "No Quran reference data yet" with Retry |
| Ready | Range fields validate offline; Total Lines pre-filled when a layout is present |
| Layout unavailable (none, or withdrawn) | "Line layout not available. Enter Total Lines." |
| Offline | Works from cache; Settings shows the cache age |
| Revoked (licence) | Cache cleared, then refetched; neutral notice in Settings |
| Permission revoked | Existing F12 locked-workspace screen |

## 5. Cache lifecycle and revocation behaviour

See ADR-018 §4.2 (diagram and triggers) and §4.5 (device revocation). Summary:

| Event | Server | Device |
|---|---|---|
| First online sign-in | Builds/serves the current snapshot; records the manifest | Background fetch → verify → atomic swap |
| Admin edit, new import, sign-off | Next build has a new version | Next check: `SUPERSEDED` → fetch → swap; old cache usable meanwhile |
| Licence withdrawn | Licence record + manifest rows revoked + audit, one transaction; future builds exclude the data | Next successful check: `REVOKED` → delete all `ref_*` → fetch current (without the withdrawn data) |
| Device offline at withdrawal | Nothing can reach the device | Keeps the cached copy until its next successful connection (ADR-018 §6) |
| Membership revoked | `403 ACCESS_REVOKED` | Delete `ref_*`; F12 workspace lock |
| Checksum/schema failure | — | Discard download; keep previous cache; back off |
| App killed mid-swap | — | Transaction rolls back; previous cache stays |

Records (portions, Total Lines, layout import id) are never changed by any of these events.

## 6. Test plan

Test names cite the criterion or requirement. Every test uses synthetic data.

### 6.1 Unit (Vitest, `packages/domain`, `packages/contracts`)

| Test | Covers |
|---|---|
| `canonicalJson` is stable across key order and runs; `referenceVersion` changes on any content change | FR-SAB-014 |
| Compact rows round-trip (encode → decode) | FR-SAB-014 |
| `ReferenceIndex` from a snapshot gives the same `paraFor`, `validateAyahRange`, `countLines` results as the server's sources, property-based (fast-check) over synthetic metadata and ranges | F06-AC24, FR-SAB-009 |
| `countLines` counts Ayat lines only | F06-AC23, DEC-B77 |
| Withdrawal filter: layout withdrawn → empty `lines`; metadata withdrawn → affected rows excluded | DEC-B79, FR-SAB-011 |
| Contracts reject a bad `have`, a non-integer format, and unknown snapshot keys at the top level | §2 |

### 6.2 API integration (Vitest + embedded Postgres)

| Test | Covers |
|---|---|
| `/version` and `/snapshot` agree; `sha256(body) == ETag == referenceVersion`; `If-None-Match` gives `304` | FR-SAB-014 |
| The version changes after an Admin Surah edit, a new import, a layout activation, a signed sign-off | FR-SAB-014, DEC-B78 |
| `layout.verified` is false for synthetic (signed test) imports and true only for a signed production import of this madrasa | F06-AC20, DEC-B78 |
| Withdrawing a source licence: the manifest rows are revoked in the same transaction, the audit event exists, `/version?have=<old>` answers `REVOKED`, and the new snapshot excludes the data | DEC-B79, F06-AC26 |
| A source not cleared at build time is never in a snapshot | F06-AC26, FR-SAB-011 |
| Role matrix: Owner, Admin, Teacher 200; Student, Parent 403; revoked membership `ACCESS_REVOKED` | FR-SEC-*, AGENTS §6 |
| Cross-tenant: org B's version as `have` in org A answers `UNKNOWN`; org A's snapshot contains only org A's rows | AC-SEC-01…05 |
| `426` for an old format; `400` for a bad `have` | §2.3 |
| No internal note, user, or student data, and no Quran text, in the payload | AGENTS §6 privacy |
| Migration 0011 applies on a database with existing 0010 data | §3.1 |

### 6.3 Mobile unit (Vitest, SQLite test driver)

| Test | Covers |
|---|---|
| Verify-then-swap; a mid-swap failure rolls back to the previous cache | ADR-018 §4.2 |
| Checksum, schema, and sanity mismatches keep the previous cache and record the error | ADR-018 §4.4 |
| `REVOKED` deletes every `ref_*` row, records `revoked_version`, then refetches | DEC-B79 |
| `ACCESS_REVOKED` deletes the cache and locks the workspace | F12-AC14, ADR-018 §4.5 |
| Workspace migration 4 with pending outbox operations: outbox rows intact, byte for byte | AGENTS §7 |
| Backoff schedule, single flight, 24-hour check, foreground and connectivity triggers | ADR-018 §4.2 |
| Student and Parent sessions never call the snapshot routes | FR-SAB-014 |
| `RangeFields` errors and pre-fill come from `packages/domain` (no inline rules) | AGENTS §11 |
| i18n: new keys exist in `en`, `ur`, `ur-Latn`; RTL render check for the Settings card | AGENTS §8 |

### 6.4 E2E

| Test | Covers |
|---|---|
| **API (Playwright), activates the `test.fixme` F06-AC24:** sign in as `teacher.a1`, fetch `/version` and `/snapshot`, verify the hash, build `ReferenceIndex` with `packages/domain` exactly as the device does, then for a table of synthetic ranges (valid, Ayat beyond count, end before start, unknown Surah, multi-line) compare derived Para, validation result, and Total Lines with `GET /quran/paras`, the server validation, and `GET /quran/line-count` | F06-AC24 |
| **API:** licence withdrawal → `REVOKED` → new snapshot without the data | DEC-B79 |
| **Mobile (Maestro), `e2e/mobile/f06-quran-portions/offline-reference.yaml`:** sign in online as a Teacher, wait for "Quran references updated", turn on airplane mode, enter a synthetic range in the range fields, check the derived Para, the field error for an Ayat beyond the count, and the Total Lines pre-fill against values the flow fetched from the API before going offline | F06-AC24, NFR-OFF |
| **Mobile (Maestro):** revoke the synthetic source through the test-control API, reconnect, check the "updated by your madrasa" notice and that Total Lines is manual | DEC-B79 |

Gate: `npm run e2e:gate -- US-025` must report `PASS` before US-025 is called complete. The Maestro flows need the
Maestro CLI and an emulator; if they are not available the gate reports `BLOCKED`, and that is reported as such.

## 7. Order of work

Branch `feature/f06-quran-reference-snapshot` from the current F06 branch once that is merged, or continued on
`feature/f06-quran-portions-metadata` if the product owner prefers.

1. Contracts and domain (`snapshot.ts`, `ReferenceIndex`) with unit tests.
2. Migration 0011, snapshot service, routes, licence-command revocation, integration tests, API E2E AC24.
3. Workspace migration 4, cache, verify, `ReferenceSync`, triggers, mobile unit tests.
4. `RangeFields`, Settings card, i18n in three locales.
5. Maestro flows; `e2e:gate -- US-025`; security review (security-agent) and code review (code-review-agent).
6. Docs: ARCHITECTURE §, API README, ADR-018 status → Implemented.

## 8. Questions for the product owner

| # | Question | Recommendation |
|---|---|---|
| P1 | When a **metadata** source is withdrawn, are Admin-edited rows that still carry that import's id excluded from snapshots too? | **Yes, exclude them.** Only rows an Admin entered with no imported origin keep shipping |
| P2 | After a withdrawal, must the server delete the withdrawn rows, and may records keep line counts derived from the withdrawn layout? | **Legal review (OD-QR-3).** Until decided: keep server rows unused and undistributed; never change records |
| P3 | Should an offline device stop using a snapshot older than a maximum age (bounds offline exposure after a withdrawal)? | **No maximum in MVP**; revisit if a licence requires it. It would disable offline line counts on long-offline devices |
| P5 | **Gap against DEC-B78.** A production import stores the reviewer (`reviewed_by`), the approval date (`approved_on`), the decision, and the SHA-256 of the signed report. The exact printing (`mushafPrinting`) and the findings live only inside the signed report file, which the system does not keep; the paper sign-off is not referenced at all. Add to migration 0011: `quran_imports.mushaf_printing`, the signed report itself (`validation_report jsonb`, checked against the stored hash), and an optional reference (S3 key + SHA-256) to a scan of the paper sign-off? | **Yes**, so the system itself preserves the evidence DEC-B78 lists. It changes no import rule and touches no F12 table |
| P4 | The Maestro offline flow needs a screen with range fields. Daily Entry (F05) is the designed host (design.md §4.7, §13). | **Build `RangeFields` in F06 and run the flow inside Daily Entry once the F05 entry screen exists.** Until then the US-025 gate stays `PENDING` on the mobile flow, while AC24's API test can pass |
