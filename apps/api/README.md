# HifzAmanah API

Node.js + Fastify + Kysely over PostgreSQL (ARCHITECTURE.md §3.2). Request and response shapes are the Zod
schemas and types in [`packages/contracts`](../../packages/contracts/src/identity.ts), shared with the app.

## Run

| Task | Command (from the repository root) |
|---|---|
| Dev server on `http://127.0.0.1:3000` | `npm run api:dev` |
| E2E server (fresh in-memory database, seeded personas, test-control API) | `npm run api:e2e-server` |
| Migrations against `DATABASE_URL` | `npm run db:migrate` |
| Tests (unit + integration) | `npm test` |

Without `DATABASE_URL`, development and tests use embedded Postgres (PGlite, DEC-B68). Development data persists
in `apps/api/.data/pglite` (git-ignored).

An unset `NODE_ENV` means **production**, which requires `DATABASE_URL`, `JWT_SECRET`, `HASH_PEPPER`,
`TOTP_ENCRYPTION_KEY` (32 bytes, base64) and `MAIL_TRANSPORT=ses`. `npm run api:dev` sets `development`.
`TEST_CONTROL_SECRET` is accepted only with `NODE_ENV=test`. `TRUST_PROXY_HOPS` (default 0) sets how many
proxies in front of the API are trusted for the client address. `SYNC_MIN_PROTOCOL_VERSION` (integer ≥ 1,
default 1) is the oldest sync protocol the server accepts; older apps get `426 UPGRADE_REQUIRED` (F12-AC15).

### Database role and row-level security (F12, ADR-016)

Sync tables (F12) and roster tables (F03) use Postgres row-level security with the `hifz_tenant` role ([`src/platform/tenant.ts`](src/platform/tenant.ts)).
In staging and production:

- The API must connect as a **non-superuser without `BYPASSRLS`** that is a **member of `hifz_tenant`**. Migration
  0004 grants the role to the migrating user (`GRANT hifz_tenant TO CURRENT_USER`); if the API connects as another
  role, grant it to that role too.
- Running migration 0004 needs **`CREATEROLE`**, or a DBA creates `hifz_tenant` (`NOLOGIN NOSUPERUSER NOBYPASSRLS`)
  beforehand.
- A superuser or `BYPASSRLS` login defeats RLS. Only the embedded development/test database connects as a superuser.

## Conventions

- **Errors:** `{ "error": { "code", "message", "fields"? } }`. The app localizes by `code` (contracts `ERROR_CODES`).
- **Auth:** `Authorization: Bearer <accessToken>`. Every request re-checks the session, account, and membership,
  so sign-out, resets, and deactivation take effect at once. Organization and role come from the membership,
  never from the request (FR-SEC-009).
- **Scope:** a record outside the caller's madrasa, or outside what the role may see, is `404 NOT_FOUND`,
  the same as a missing ID (FR-SEC-008).

## Identity routes (F01)

| Method and path | Who | Body | Success |
|---|---|---|---|
| `POST /auth/sign-in` | anyone | `{ loginId, password, deviceId? }` | `200` `{ step: SIGNED_IN, accessToken, refreshToken, expiresIn }`, or for Owner/Admin `{ step: TWO_FACTOR_REQUIRED \| TWO_FACTOR_SETUP_REQUIRED, challengeToken }`. Any refusal: `401 INVALID_CREDENTIALS` |
| `POST /auth/two-factor/setup` | Owner/Admin, first sign-in | `{ challengeToken }` | `200` `{ secret, otpauthUri }` |
| `POST /auth/two-factor/setup/confirm` | same | `{ challengeToken, code }` | `200` signed in, plus `recoveryCodes` (10, shown once) |
| `POST /auth/two-factor/verify` | Owner/Admin | `{ challengeToken, code }` or `{ challengeToken, recoveryCode }` | `200` signed in |
| `POST /auth/refresh` | anyone with a refresh token | `{ refreshToken }` | `200` new token pair (rotated; a replayed old token ends the session) |
| `POST /auth/sign-out` | signed in, or holding the refresh token | `{ refreshToken? }` | `204`; ends this session only. With an expired access token, the refresh token alone is enough |
| `POST /auth/password-reset/request` | anyone | `{ loginId }` | `202` `{ status: RESET_REQUESTED }`, always the same |
| `POST /auth/password-reset/confirm` | anyone | `{ loginId, otp, newPassword }` | `204`; ends every session. `400 OTP_INVALID` for a wrong, expired, used, or over-tried code |
| `GET /me` | signed in | — | `200` profile: display name, email, User ID, role, madrasa, language, 2FA status |
| `PATCH /me` | signed in | `{ displayName?, email?, preferredLocale?, currentPassword? }` only | `200` profile; any other field is `400`. Changing the email needs `currentPassword` (DEC-B69): missing is `400 fields.currentPassword: REQUIRED`, wrong is `400 CURRENT_PASSWORD_INCORRECT`, and nothing changes |
| `POST /me/password` | signed in | `{ currentPassword, newPassword }` | `204`; ends the user's other sessions |
| `POST /me/two-factor/recovery-codes` | Owner/Admin, signed in within 15 min | `{ code }` | `200` `{ recoveryCodes }`; earlier codes stop working. `403 REAUTH_REQUIRED` if not recent |
| `GET /accounts?page=` | Owner/Admin | — | `200` 25 per page |
| `POST /accounts` | Owner/Admin | `{ loginId, displayName, email?, role: TEACHER \| STUDENT \| PARENT, password }` | `201` account. `409 LOGIN_ID_TAKEN`, `400` with `fields.loginId` / `fields.password` |
| `GET /accounts/login-id-suggestion` | Owner/Admin | — | `200` `{ prefix }`, e.g. `ALIF-` |
| `GET /accounts/:id` | Owner/Admin | — | `200` account, including `lockedUntil` |
| `POST /accounts/:id/deactivate` | Owner/Admin (Admin: Teacher/Student/Parent only) | — | `200` account; its sessions end |
| `POST /accounts/:id/password` | Owner/Admin (only the Owner for an Admin) | `{ newPassword }` | `204`; the user's sessions end |
| `POST /accounts/:id/two-factor/reset` | Owner, for an Admin | — | `204`; the Admin's sessions end and 2FA must be set up again |

Rules and values live in [`src/modules/identity/rules.ts`](src/modules/identity/rules.ts): OTP 6 digits, 10 minutes,
5 tries, 3 per hour (DEC-B10); 10 failures in 15 minutes lock for 15 minutes, with a 1–8 s progressive delay after
5 (DEC-B67); sessions end 30 days after sign-in (DEC-B65); recent sign-in is 15 minutes (DEC-B66).

**Throttling.** Each attempt is counted before the secret is checked, so parallel requests cannot slip past the lock.
Passwords are throttled per typed User ID (sign-in and the current password on My profile). Authenticator and
recovery codes have their own per-account counter, which a correct password does not reset. An authenticator code
is accepted once only.

## Organization routes (F02)

Organization and role always come from the signed-in membership (FR-SEC-009). Bodies are strict: an
`organizationId`, `role`, or any other unexpected field is `400` with `fields.<name>: NOT_ALLOWED` (F02-AC9).
There is no route that creates a workspace or signs up (F02-AC16), and none that edits or deletes an audit record
(F02-AC12). Rules live in [`src/modules/access/policy.ts`](src/modules/access/policy.ts) (the SRS §17.1 matrix as
data, `can()` / `authorize()`, list scope) and [`src/modules/organization/rules.ts`](src/modules/organization/rules.ts).

| Route | Who | Body | Result |
|---|---|---|---|
| `GET /organization` | any member | — | `200` `{ id, name, kind, timezone, weekStart, dailyReportMode, canEdit }` |
| `PATCH /organization` | Owner/Admin | `{ name?, timezone?, weekStart? }` only | `200` settings; one `ORGANIZATION_UPDATED` audit with old and new values, none if nothing changed. `400 fields.name: REQUIRED` (blank), `fields.timezone: INVALID` (not an IANA name), `fields.weekStart: INVALID`. `403` for Teacher/Student/Parent |
| `POST /accounts/:id/role` | Owner | `{ role: ADMIN \| TEACHER }` | `200` account; `ADMIN_ADDED` or `ADMIN_REMOVED` audit. A new Admin's sessions end, so the next sign-in sets up two-factor. `400` unless the target is an active Teacher or Admin; `409 LAST_ADMIN` if no Owner/Admin would remain |
| `POST /accounts/:id/owner` | Owner | — | `200` account; the Admin becomes an Owner too, and the current Owner stays Owner. `OWNER_ADDED` audit. `400` unless the target is an active Admin |
| `POST /accounts/:id/all-classes` | Owner/Admin | `{ allClasses: boolean }` | `200` account; `ALL_CLASSES_SET` or `ALL_CLASSES_CLEARED` audit, none if unchanged. `400` unless the target is an active Teacher |

The role is checked first, so `403` comes before any ID lookup. An ID outside the madrasa is `404`, identical to an
ID that does not exist (F02-AC7). Accounts now include `allClasses`. Deactivation is refused with `409 LAST_ADMIN`
if it would leave no Owner or Admin.

## Roster routes (F03)

Classes, teacher assignments, students, and enrollments (US-010…012). Shapes in
[`packages/contracts/src/roster.ts`](../../packages/contracts/src/roster.ts); pure rules in `packages/domain/roster`;
code in [`src/modules/roster`](src/modules/roster); plan in [docs/handover/F03-plan.md](../../docs/handover/F03-plan.md).
Owner, Admin, and Teacher only; Student and Parent get `403 FORBIDDEN`. A role without the capability gets `403`
before anything is loaded; a resource outside the caller's madrasa or (for a Teacher) outside their classes is `404`,
the same as a missing ID. Request schemas are strict (unknown keys are `fields.<key>: NOT_ALLOWED`). **There is no
DELETE route**; the tables refuse DELETE for every role (migration 0007). Dates are `YYYY-MM-DD` in the madrasa's
timezone.

A Teacher's classes are those they are assigned to now, or every class with "all classes". A student is in a Teacher's
scope while the student has an enrollment in one of those classes that has not ended (current or future-dated).

| Route | Who | Body / query | Result |
|---|---|---|---|
| `GET /classes` | Owner, Admin, Teacher (own classes) | `?status=ACTIVE|INACTIVE|ALL` (default ALL) | `200 { items: ClassResponse[] }` sorted by name: `id, name, status, teachers[{userId, displayName}], activeStudentCount, canManage` |
| `POST /classes` | Owner, Admin | `{ name, teacherIds? }` | `201` class; `CLASS_CREATED` audit. `400 fields.name: REQUIRED` (blank), `TAKEN` (an active class has that name, ignoring case, F03-AC14); `fields.teacherIds: INVALID` (not an active Teacher of this madrasa) |
| `GET /classes/:id` | as list | — | `200` class |
| `PATCH /classes/:id` | Owner, Admin | `{ name?, teacherIds? }` (`teacherIds` = the full new set) | `200`; `CLASS_UPDATED` audit with name from/to and teachers added/removed. Ended assignments are kept with `unassigned_at` |
| `POST /classes/:id/deactivate` | Owner, Admin | — | `200`; `CLASS_DEACTIVATED` audit. Students stay enrolled (the app warns with their list first) |
| `POST /classes/:id/reactivate` | Owner, Admin | — | `200`; `CLASS_REACTIVATED`. `400 fields.name: TAKEN` if an active class now uses the name |
| `GET /roster/teachers` | Owner, Admin | — | `200 { items: [{userId, displayName}] }`: active Teachers, for the class form |
| `GET /students` | Owner, Admin, Teacher (scope) | `?q=&classId=&status=ACTIVE|INACTIVE|ALL&cursor=&limit=` (default ACTIVE, 25; max 100) | `200 { items: StudentSummary[], nextCursor }`: keyset pages by name. `q` matches name or External Student ID (case-insensitive, wildcards literal); `classId` matches a not-yet-ended enrollment. `400 fields.cursor: INVALID` |
| `POST /students` | Owner, Admin, Teacher (own class) | `{ name, classId, externalStudentId?, admissionDate?, privateNotes? }` (nothing else, DEC-B56) | `201` student; enrolled from `admissionDate` or today. `STUDENT_CREATED` audit (field names only). `404` for a class outside scope; `400 fields.classId: CLASS_INACTIVE`; `fields.externalStudentId: TAKEN` (unique per madrasa, ignoring case); `fields.admissionDate: INVALID` |
| `GET /students/:id` | as list | — | `200 StudentResponse`: summary + `admissionDate, privateNotes` (staff only), `enrollments[]` oldest first, `canEdit, canManage` |
| `PATCH /students/:id` | Owner, Admin, Teacher (scope) | `{ name?, externalStudentId?, admissionDate?, privateNotes? }` (null or blank clears) | `200`; `STUDENT_UPDATED` audit (field names only). The class is changed only by an enrollment |
| `POST /students/:id/deactivate` · `/reactivate` | Owner, Admin | — | `200`; `STUDENT_DEACTIVATED` / `STUDENT_REACTIVATED`. Nothing is deleted; the enrollment is kept |
| `POST /students/:id/enrollments` | Owner, Admin | `{ classId, startDate }` | `200` student. With an open enrollment this is a move: it ends `startDate − 1` (F03-AC11, AC18), `STUDENT_MOVED`; otherwise `STUDENT_ENROLLED`. `400 fields.classId: SAME_CLASS | CLASS_INACTIVE`, `fields.startDate: BEFORE_CURRENT_START | OVERLAPS_HISTORY | INVALID` |
| `GET /entry/classes` | Owner, Admin, Teacher | — | `200 { items: [{id, name}] }`: active classes in scope (Daily/Bulk Entry pickers, F03-AC4) |
| `GET /entry/classes/:id/students` | Owner, Admin, Teacher | `?date=` (default today) | `200 { date, items: [{id, name, externalStudentId}] }`: active students enrolled in that class on that date. `404` for a deactivated class |

Sync scope: the roster supplies the sync module's scope provider ([`src/modules/roster/scope.ts`](src/modules/roster/scope.ts)),
and writes `scope_changes` (next pull answers `scopeReset`) for each Teacher whose classes change: assignment added or
removed, a student moved into or out of their class, "all classes" set or cleared, and Admin ↔ Teacher role changes.

## Quran reference routes (F06)

Surahs, Para boundaries, Mushaf editions, the Total Lines lookup, the review list, and import provenance (US-024…026).
Shapes in [`packages/contracts/src/quran.ts`](../../packages/contracts/src/quran.ts); pure rules in
`packages/domain/quran-ref` and `packages/domain/quantity`; code in [`src/modules/quran-ref`](src/modules/quran-ref);
migrations `0009_quran_ref.sql`, `0010_quran_ref_v2.sql`, `0011_quran_reference_snapshots.sql`. **There is no DELETE
route and no line-layout editor.** Page/line data comes only from an approved import.

**No Quran data ships yet** (SRS §17.3, DEFERRED: DEC-B31). Every madrasa starts empty until a dataset's accuracy and
licence are approved. The default edition is `INDOPAK_16_LINE` (16 lines per page, DEC-B70); its publisher is unset.

| Route | Who | Body / query | Result |
|---|---|---|---|
| `GET /quran/editions` | Owner, Admin, Teacher | — | `200 { active, editions: [{code, name, linesPerPage, publisher, printingId, pageCount, verification, hasLayout, layoutVerified, layoutWithdrawn}] }`. `layoutVerified` is true only for this madrasa's active layout when it is a production import with an approving signed review, its physical-verification evidence stored, and every source still licensed (DEC-B78). It records human sign-off; it is not an automated proof that the layout matches the printed Mushaf. Signed test data never counts. `layoutWithdrawn`: a source licence was withdrawn, so the layout is no longer used (DEC-B79) |
| `GET /quran/reference/version` | Owner, Admin, Teacher | `?format=<highest the app reads>&have=<cached version>` | `200 { snapshotFormatVersion, referenceVersion, bytes, builtAt, layout: {importId, verified, withdrawn}, metadataWithdrawn, empty, cached?: {referenceVersion, status: CURRENT|SUPERSEDED|REVOKED|UNKNOWN, revokedAt?, reasonCode?: LICENCE_WITHDRAWN} }`. A version from another madrasa is `UNKNOWN`. `400` bad query; `403` Student/Parent; `426 UPGRADE_REQUIRED` below the oldest served format. Schema: [`quran-reference.ts`](../../packages/contracts/src/quran-reference.ts) (ADR-018) |
| `GET /quran/reference/snapshot` | Owner, Admin, Teacher | `?format=`; optional `If-None-Match: "<version>"` | `200` the canonical JSON body (sorted keys, no whitespace); `ETag` and `X-Reference-Version` = `sha256(body)`; `Cache-Control: private, no-store`. `304` when `If-None-Match` is current. Holds Surahs, Paras, and the active layout's **Ayat lines only** as compact rows: no Quran text, no word data. Data from a withdrawn source is left out (including Admin-edited rows of a withdrawn import, P1); test data never leaves a test build. `429 RATE_LIMITED` above 30 downloads per user per hour |
| `GET /quran/surahs` · `GET /quran/paras` | Owner, Admin, Teacher | — | `200 { items, empty }`. `empty` drives "No Quran reference data yet — ask your Admin" |
| `GET /quran/line-count` | Owner, Admin, Teacher | `?surah=&ayahStart=&ayahEnd=` | `200 { edition, totalLines, source: LAYOUT|UNAVAILABLE, layoutImportId, para, issues }`, computed by `evaluateRange` (packages/domain), the same function the app runs offline on its snapshot (F06-AC24). `totalLines` is null when no usable layout covers the range (none, or withdrawn), so the Teacher enters it (FR-SAB-008). `issues` carries range errors, e.g. `{field: ayahEnd, code: OUT_OF_RANGE, max: 7}` (F06-AC6) |
| `PUT /quran/surahs/:number` | Owner, Admin | `{ nameAr, nameTranslit, ayahCount, rowVersion }` (`rowVersion` null to create) | `200 { surah, recordsNeedingReview }`; `QURAN_SURAH_CREATED|UPDATED` audit with before/after values. `nameAr` is stored byte-for-byte (F06-AC3). `400 fields.<field>: REQUIRED|TOO_LONG|OUT_OF_RANGE`; `409 CONFLICT_STALE` when `rowVersion` is not current |
| `PUT /quran/paras/:number` | Owner, Admin | `{ start: {surah, ayah}, end: {surah, ayah}, rowVersion }` | `200 { para, recordsNeedingReview }`; `QURAN_PARA_CREATED|UPDATED` audit. `400 fields.end: END_BEFORE_START` (F06-AC4), `fields.<start|end>: UNKNOWN_SURAH|OUT_OF_RANGE` with `fields.<start|end>.max` |
| `GET /quran/review` | Owner, Admin | — | `200 { findings, records }`. Findings: `MISSING_SURAHS|MISSING_PARAS` (numbers), `PARA_INVALID`, `PARA_OVERLAP|PARA_GAP`, `LAYOUT_MISSING`. `records` lists stored ranges that no longer fit (none until F05 registers its records); they are never changed (F06-AC19) |
| `GET /quran/imports` | Owner, Admin | — | `200 { items }`: each dataset applied, with source, licence, reviewer, approval date, `synthetic`, checksum, counts, review decision, report hash, `mushafPrinting`, `signOffRef`, `validationReportStored`, its sources with their current licence status, and whether a layout import is the active one |

**Seed loader** ([`src/modules/quran-ref/seed.ts`](src/modules/quran-ref/seed.ts)). The input is a JSON file
(`format: hifz-quran-seed`) with `datasetKey`, `datasetVersion`, `provenance` (source, licence, reviewer, approval
date, `synthetic`), optional `metadata` (Surahs and Paras), and `layouts` (per edition: lines per page and line rows).
- **Format 1:** Ayat lines only, as `{page, line, surah, ayahStart, ayahEnd}`. It is accepted for synthetic test data only.
- **Format 2** (ADR-017, migration `0010_quran_ref_v2.sql`) adds:
  - typed lines `{page, line, lineType: AYAH|SURAH_NAME|BASMALLAH, isCentered, surah, ayahStart, wordStart, ayahEnd,
    wordEnd, srcFirstWordId, srcLastWordId}`; heading and Bismillah lines carry no Ayat or words;
  - `sources[]` (`{provider, resourceId, fileSha256, role: METADATA|LAYOUT|WORDS}`);
  - `validationReport` (`{sha256, decision, signedBy, signedOn, mushafPrinting, signOffRef}`);
  - optional Surah display fields (`revelationPlace`, `revelationOrder`, `bismillahPre`).
- A seed with any issue is refused whole.
- **Format-2 checks:** lines must run in page/line order with no gap or overlap (word positions and source word IDs
  contiguous), each Surah's heading line comes before its Ayat, and Surahs follow in order.
- **A production seed (DEC-B72, FR-SAB-011, FR-SAB-013) must:**
  - be format 2 and complete: 114 Surahs, 30 contiguous Paras, a layout covering every Surah with no missing page, and
    the edition's page count once one is recorded;
  - name its reviewer and approval date, and carry an `APPROVED` or `APPROVED_WITH_FINDINGS` report signed by that
    reviewer on that date (`REJECTED` and `PENDING` are always refused);
  - cite registered sources only (the licence gate, below), with no synthetic source;
  - **(0011, DEC-B78, plan P5)** name the exact printing the reviewer compared against (`mushafPrinting`) and where the
    paper sign-off or its documented digital equivalent is held (`signOffRef`), and come **with the signed validation
    report itself**. The loader checks that the report's canonical SHA-256 is the signed one, that it validated this
    seed, and that its reviewer, date, decision, printing, and sign-off reference match the seed
    (`validationReport.report: REQUIRED|INVALID|HASH_MISMATCH`, `…report.seedSha256: SEED_MISMATCH`,
    `…report.review.<field>: REPORT_MISMATCH`). The report is stored with the import (`quran_imports.validation_report`).
    The system records human approval; it never checks the physical Mushaf itself.
- **Licence gate:** every cited source must be registered and its latest licence record `OPEN_LICENCE_VERIFIED` or
  `PERMISSION_GRANTED`. A `LAYOUT` source also needs `publisherClearanceRef`: the printed edition's publisher's
  permission or legal advice (Taj Company for the Taj layout, DEC-B71). Refusal codes: `UNREGISTERED`,
  `LICENCE_NOT_CLEARED`, `PUBLISHER_CLEARANCE_REQUIRED`, `SYNTHETIC_SOURCE`.
- Total Lines counts Ayat lines only (FR-SAB-012; DEC-B77).
- Synthetic seeds are refused unless `NODE_ENV=test`.
- Each (madrasa, kind, dataset, version, edition) is applied once. Re-applying is a no-op, and the same version with
  changed content is refused.
- A newer metadata version updates rows still marked `SEED` but keeps Admin edits.
- A newer layout is a new import; the old lines stay and `mushaf_layouts` points at the new one.
- `QURAN_SEED_FILE` (unset until approved) is applied to each new madrasa inside the workspace-creation transaction,
  with its signed report from `QURAN_SEED_REPORT_FILE` (also unset until approved). A production seed without the report
  is refused.

**Source catalogue** ([`src/modules/quran-ref/sources.ts`](src/modules/quran-ref/sources.ts)). `quran_sources` (one
row per downloaded file, with its SHA-256) and `quran_source_licences` (append-only licence history, where the latest
row is current) are global. The tenant role can only read them. They are written by the maintainer's privileged step on
the owner connection:

```text
npm run quran:source -- list
npm run quran:source -- register <file.json>          # RegisterSourceInput; starts LICENSE_REVIEW_REQUIRED
npm run quran:source -- licence <sourceId> <file.json> # RecordLicenceInput; a cleared status needs permissionRef
```

The tool downloads nothing and refuses synthetic sources. Recording a cleared status is the product owner's decision,
backed by written evidence.

**Licence withdrawal (DEC-B79, ADR-018 §3.4).** Recording a licence that no longer clears a source (for example
`REFUSED`, or a layout without publisher clearance) marks every recorded snapshot version that carried that source as
revoked, in every madrasa, in the same transaction, with a `QURAN_REFERENCE_REVOKED` audit event; the command prints
how many versions it revoked. From then on the data is left out of snapshots, not used for Total Lines, and not shown as
verified. **Nothing is deleted**: the imported rows stay for audit and legal review (plan P2; deletion and retention
periods await legal review). Devices delete a revoked copy on their **next successful online check**; a device that
stays offline cannot be reached before then. `GET /quran/reference/version` also revokes such a version itself if the
licence row was written some other way. `GET /quran/imports` shows each import's format, review decision, report hash, and its
sources with their current licence status.

**Converter and validation tool** ([`src/modules/quran-ref/converter`](src/modules/quran-ref/converter); ADR-017 §4–§7).
This is offline maintainer tooling. It downloads nothing and imports nothing.

```text
npm run quran:convert -- convert <manifest.json> --out <dir> [--check-sources]
npm run quran:convert -- sign <dir> <review.json>
```

- **The manifest** (`hifz-quran-source-manifest` v1) names the dataset, provenance, edition (`code`, `linesPerPage`, and
  the verified `pageCount` or null), and four source files, each with `provider` and `resourceId`. Paths are relative
  to the manifest. The files use the provider's published columns:
  - a Surah list (`id, name_simple, name_arabic, revelation_order, revelation_place, verses_count, bismillah_pre`);
  - a Juz list (`juz_number, first_verse_key, last_verse_key`);
  - layout `pages` rows (`page_number, line_number, line_type, is_centered, first_word_id, last_word_id, surah_number`);
  - word rows (`word_index, word_key, surah, ayah`).

  A SQLite source is exported to JSON rows with the same column names. Word text is read and discarded; no Quran text
  reaches the seed or the report.
- **`convert`** hashes each raw file (SHA-256) and runs checks **S1–S10**:
  - S1: the files parse;
  - S2: Surah numbering and fields;
  - S3: Juz keys;
  - S4: word IDs unique, keys consistent, positions in sequence, Quran order;
  - S5: cross-source Ayat counts;
  - S6: layout rows (types, slots, word IDs only on Ayat lines, every ID mapped, one Surah per line, `surah_number`
    agrees);
  - S7: every word on exactly one line, with no gap or overlap;
  - S8: no missing page, the verified page count, short pages listed;
  - S9: one heading per Surah, with Bismillah lines compared with `bismillah_pre`;
  - S10: the existing domain rules on the built seed.

  It writes `report.json` and `report.md`, which hold the checks, cross-source comparison, short pages, a 40-page
  reviewer sample, the review block, and the import gate. It writes `seed.json` **only when no check failed**. A failure
  exits 1. `--check-sources` reads the source catalogue (`DATABASE_URL`) so the gate shows each file's licence status.
  Otherwise licences are reported `NOT_CHECKED`, never assumed.
- **`sign`** attaches the reviewer's signed decision (verification kit Part F: reviewer, qualification, printing,
  `signOffRef` (where the paper sign-off is held), decision, date, findings) and writes `seed.signed.json`,
  `report.signed.json`, and `report.signed.md`. The seed's `validationReport.sha256` is the signed report's hash. Load
  `report.signed.json` with the seed (`QURAN_SEED_REPORT_FILE`). It refuses:
  - an approval without `signOffRef` (`SIGN_OFF_REF_REQUIRED`); the tool never invents one;
  - a seed changed since conversion, a failed check, or a second signature;
  - an approval with a blocking finding, or `APPROVED` with findings listed (use `APPROVED_WITH_FINDINGS`).

  A `REJECTED` decision is recorded, and that seed is then refused at import.
- **The gate in the report is advisory.** The seed loader enforces the licence and review gates again at import.
  Synthetic manifests are accepted only with `NODE_ENV=test`.

## Daily Hifz routes (F05)

Contract: [`packages/contracts/src/hifz.ts`](../../packages/contracts/src/hifz.ts); rules in `packages/domain/hifz`;
code in [`src/modules/hifz`](src/modules/hifz); tables in `migrations/0012_hifz.sql` (`daily_records`,
`lesson_portions`, `portion_attempts`, `attempt_mistakes`; RLS forced, no DELETE for any role). Plan:
[F05-plan](../../docs/handover/F05-plan.md).

**Writes are sync operations** (`POST /sync/push`), one op per row, each validated and committed on its own:

| Entity | CREATE fields | UPDATE fields (a correction, audited) |
|---|---|---|
| `daily_record` | `studentId, classId, reportDate, sessionLabel, clientSavedAt?` | `sessionLabel` |
| `lesson_portion` | `dailyRecordId, section, position, isExtra, paraNumber, range, assigned, totalLines, totalLinesSource` (Sabaq `assigned` may be left out: it defaults to Total Lines) | `position`, `isExtra`, the group `paraNumber, range, totalLines, totalLinesSource, assigned` (whole), `removed: true` |
| `portion_attempt` | `lessonPortionId, attemptNo, attemptedAt, status, completed, quality, noMistakes, mistakes[], remarks` | `attemptedAt`, `remarks`, the group `status, completed, quality, noMistakes, mistakes` (whole) |

Server rules (a refusal is `REJECTED VALIDATION` with `fields`, or `REJECTED NOT_FOUND`):
- **Scope:** the record's class must be in the caller's `daily.write` scope (Owner/Admin, assigned Teacher, or the
  "all classes" flag); otherwise, and for another madrasa's ids, `NOT_FOUND`. A portion's and an attempt's scope keys
  are their record's. An unknown class id is `classId: INVALID`.
- **Record:** `reportDate: FUTURE` after today in the madrasa's timezone (F05-AC17); `reportDate: HOLIDAY | CLOSURE |
  NO_CLASS | UNSCHEDULED` on a day the class does not meet; `studentId: NOT_ENROLLED` (a new entry needs an active
  student in an active class on that date; a correction only that the student was in the class then).
- **Report mode (F05-AC6, AC7):** `SINGLE`: `reportDate: DUPLICATE_RECORD` with `reportDate.existingId: <id>`,
  `sessionLabel: SESSION_LABEL_NOT_ALLOWED`. `MULTI_SESSION`: `sessionLabel: SESSION_LABEL_REQUIRED |
  SESSION_LABEL_TOO_LONG` (`sessionLabel.max: 40`) | `DUPLICATE_SESSION` (case-insensitive, with
  `sessionLabel.existingId`). Labels are trimmed.
- **Attendance (FR-DAY-011, F05-AC18):** a new portion or attempt needs the student Present, Late, or Half day on the
  date: `attendance: ATTENDANCE_CHANGE_TO_LATE` (Absent, Leave) or `attendance: ATTENDANCE_REQUIRED` (unmarked).
- **Sabaq:** checked against the madrasa's active Quran metadata, never guessed: `range: METADATA_UNAVAILABLE` with
  none loaded, `range: CROSSES_SURAH | END_BEFORE_START | PARA_UNKNOWN`, `surah`/`ayahStart`/`ayahEnd: UNKNOWN |
  OUT_OF_RANGE` (with `.max`). The server derives `paraNumber` (a client value is `paraNumber:
  SABAQ_PARA_NOT_ACCEPTED`; on UPDATE send `paraNumber: null`), sets `lineCountEdition` to the madrasa's edition, and
  sets `totalLinesSource` (`LAYOUT` when Total Lines equals the usable layout's count, else `MANUAL`). A Para unit is
  `unit: UNIT_NOT_ALLOWED`, never converted (FR-SAB-010).
- **Quantities:** the domain codes `unit: REQUIRED | UNIT_NOT_ALLOWED`, `assigned: REQUIRED | NOT_POSITIVE |
  NOT_A_PRESET | ABOVE_TOTAL` (`assigned.max`), `completed: UNIT_MISMATCH | ABOVE_ASSIGNED | NOT_A_PRESET`; a
  fractional LINES/AYAT/PAGES amount is refused by the schema (`completed.denominator: INVALID`). A portion correction that would no longer fit a recorded attempt is
  `assigned: ABOVE_ASSIGNED | UNIT_MISMATCH`.
- **Attempts:** `attemptNo: ATTEMPT_NO_TAKEN` (append-only; earlier attempts never change, F05-AC15),
  `lessonPortionId: PORTION_REMOVED`, `quality: QUALITY_NOT_ALLOWED` on ABSENT/NOT_ASSIGNED/PENDING,
  `mistakes: NO_MISTAKES_CONFLICT`, `remarks: TOO_LONG` (500). NOT_REMEMBERED without `completed` stores 0, COMPLETED
  without `completed` stores the assigned quantity; otherwise a missing `completed` stays null.
- **Corrections** go through F12 conflict detection: two edits of a coupled group from the same base version become a
  conflict, never last-write-wins. A removed portion keeps its row and attempts and takes no further edit
  (`removed: PORTION_REMOVED`). No edit lock (FR-DAY-009).
- **Audit** in the same transaction: `DAILY_RECORD_CREATED/UPDATED`, `LESSON_PORTION_CREATED/UPDATED/REMOVED`,
  `PORTION_ATTEMPT_CREATED/CORRECTED`, `DAILY_REPORT_MODE_CHANGED`. Remarks appear by field name only.

| Route | Body / query | Result |
|---|---|---|
| `GET /hifz/daily-records` | `?date=` or `?from=&to=` (≤ 62 days), optional `studentId`, `classId`, `cursor`, `limit` (1–100, default 25) | `200 { items: DailyRecordView[], nextCursor }`, newest date first; a Teacher sees assigned classes only (`404` for an unassigned `classId`). Owner, Admin, Teacher; Student/Parent `403` |
| `GET /hifz/daily-records/:id` | — | `200 DailyRecordDetail`: the record, `attendance { status, portionsAllowed }`, portions in Sabaq/Sabqi/Manzil and position order (removed ones flagged) with their attempts oldest first and `progress` (latest attempt; assigned counted once), and `sectionSummary` (per-unit totals). `404` out of scope |
| `PUT /organization/daily-report-mode` | `{ mode: SINGLE \| MULTI_SESSION }` | `200 { mode }`, audited. Owner/Admin only (`403` otherwise, F05-AC9). Switching to `SINGLE` while a student has two records on a date: `409 MODE_CONFLICTS` with `error.conflicts: [{ studentId, studentName, reportDate, sessionLabels }]` (F05-AC8) |

The madrasa's mode is also in `GET /organization` (`dailyReportMode`). F05 supplies the F04 lookups (recited portions
for the Bulk Entry sheet's `recited` and the Absent-note rule; daily records in `/calendar/exceptions/impact`) and the
F06 review list's Sabaq ranges (`kind: SABAQ_PORTION`).

## Sync routes (F12)

Protocol v1, decisions in [ADR-015](../../docs/adr/ADR-015-sync-protocol-idempotency-conflicts.md); shapes in
[`packages/contracts/src/sync.ts`](../../packages/contracts/src/sync.ts); pure rules in `packages/domain/sync`; code in
[`src/modules/sync`](src/modules/sync). Teacher, Admin, and Owner only; Student and Parent get `403 FORBIDDEN`
(online, read-only). Every route refuses a revoked membership or deactivated account with `403 ACCESS_REVOKED`
(also `/auth/refresh` and every other authenticated route, when the session ended for that reason), and an expired
session with `401 SESSION_EXPIRED`.

| Route | Body / query | Result |
|---|---|---|
| `POST /sync/push` | `{ protocolVersion, deviceId, ops: SyncOp[] }`, 1–100 ops in outbox order | `200` `{ results[], serverTime }`, one result per op in order: `APPLIED { rowVersion, entityId }`, `CONFLICT { conflictId }`, `REJECTED { code, fields? }` (`VALIDATION`, `NOT_FOUND`, `ENTITY_NOT_SUPPORTED`, `ID_TAKEN`, `OP_ID_REUSED`), or `RETRY { code }` (`DEPENDENCY_PENDING`, `CONFLICT_OPEN`; not stored, send again later). `426 UPGRADE_REQUIRED` below the minimum protocol; nothing applied |
| `GET /sync/pull` | `?protocolVersion=` (absent = 1) `&cursor=` (absent = bootstrap) `&limit=` (1–500, default 500) | `200` `{ changes[], cursor, hasMore, scopeReset, serverTime }`; a change is `UPSERT` with staff-projected `fields` or `REMOVE_FROM_DEVICE`. `400 fields.cursor: INVALID` for a bad cursor; `426` as for push |
| `GET /sync/conflicts` | `?status=OPEN\|RESOLVED&page=` | `200` 50 per page: entity, safe label, created time, caused-by user. A Teacher sees only conflicts their own operations caused, for records still in scope; Owner/Admin see all |
| `GET /sync/conflicts/:id` | — | `200` both versions, base and server versions, `fieldDiff[]`; `404` for anyone who may not resolve it |
| `POST /sync/conflicts/:id/resolve` | `{ choice: KEEP_DEVICE \| KEEP_SERVER \| MERGE, picks? }` | `200` `{ rowVersion }`; one `SYNC_CONFLICT_RESOLVED` audit. `404` for another Teacher (F12-AC17), `409 CONFLICT_STALE` if the row changed since, `409 CONFLICT_CLOSED` if already resolved, `400` for picks that split a coupled group |

- **Per op, one transaction:** organization advisory lock, idempotent replay check (`sync_ops.op_hash`), `op_id`
  claim, dependencies, scope (out of scope = `NOT_FOUND`), the handler's strict schema, conflict detection against
  `change_log`; then apply or store a conflict. One refused op never rolls back the others.
- **Dependencies:** an op is `RETRY DEPENDENCY_PENDING` until each `dependsOn` op of the same user is `APPLIED`, or
  its conflict is `RESOLVED`, **and** that op's record exists in the organization. F04/F05 must decide what happens
  to the dependents of a natural-key create-create conflict resolved with `KEEP_SERVER` (decision Q11), whose record
  is never created.
- **Own edits and `seq` (migration `0006_sync_ops_seq.sql`):** `sync_ops.seq` stores the op's client outbox `seq`
  (nullable, not unique, not part of `op_hash`). In the conflict check, a change since the base counts as a server
  change if its `op_id` is NULL, it came from another user or device, its `seq` is NULL, or its `seq` is greater than
  the incoming op's `seq`. So this device's own earlier edits are excluded, but an older edit arriving after a newer
  one becomes a conflict instead of overwriting it (NFR-OFF-006).
- **Entities:** each feature registers a `SyncHandler` ([`src/modules/sync/handler.ts`](src/modules/sync/handler.ts))
  for its entities: attendance (F04) and daily records, portions, attempts (F05) are registered; mistakes and notes
  (F07) and homework (F08) are `ENTITY_NOT_SUPPORTED` until then. A child entity's `keysForCreate` may load its
  parent's scope keys in the op's transaction (F05).
- **Test-only `sync_probe` entity:** its table is applied by the integration-test harness from
  `test/support/migrations/9001_sync_probe.sql` and its handler is passed in as `testSync` (`NODE_ENV=test`). It is
  not in `migrations/` and is not registered by `npm run api:e2e-server`.
- **Scope:** until F03 adds the roster, a Teacher without "all classes" has an empty sync scope (fail closed). F03
  supplies a `SyncScopeProvider` and must call `recordScopeChange` for every Teacher a roster change affects
  ([`src/modules/sync/change-log.ts`](src/modules/sync/change-log.ts)).
- Request bodies are never logged, so operation fields and note bodies never reach the logs.

## Test control (non-production only)

Enabled when `TEST_CONTROL_SECRET` is set (the E2E server sets `local-e2e-control-secret` unless overridden; E2E
fixtures read `E2E_CONTROL_SECRET`). Every route needs the `x-test-control-secret` header and is otherwise `404`.

`POST /__test/reset` · `POST /__test/clock { advanceMs }` · `GET /__test/users/:loginId` · `GET /__test/otp/:loginId` ·
`GET /__test/emails/:loginId` · `GET /__test/audit/:loginId` · `GET /__test/totp/:loginId` · `POST /__test/search { text }`

F02 adds:
- `POST /__test/organizations { name, code, kind?, owner: { loginId, displayName?, email?, password? }, twoFactor? }`: the
  platform operator creates a workspace and its first Owner (FR-ORG-001), with the database defaults for timezone,
  week start, and report mode. With `twoFactor` (the default) the Owner gets an authenticator so fixtures can sign in.
- `POST /__test/audit/fail-next`: the next audit write fails (F02-AC13). A reset clears it.
- `GET /__test/audit-target/:id`: audit records about one organization or user, oldest first.

F12 adds (all cleared by `/__test/reset`):
- `POST /__test/sync/min-protocol { version }`: sets the oldest accepted protocol version (F12-AC15).
- `POST /__test/sync/fail-next { count, status? }`: the next `count` push/pull requests fail with `status`
  (500–599, default 503) (F12-AC6).
- `GET /__test/sync/ops/:opId`: the stored result of one operation (no fields; `sync_ops` never stores them).
- `GET /__test/sync/conflicts`: every conflict, oldest first, without the device/server values.

F03 seeds the fixture classes, Teachers, and students of `e2e/fixtures/personas.ts` on every reset (each student enrolled
from 90 days before today) and adds:
- `GET /__test/roster/ids`: `{ classes: { A1, A2, B1 }, students: { S1, S2, S3, SB1 } }` ids of the seeded fixtures.

F06 adds:
- `POST /__test/quran/seed { organizationCode, seed? }`: applies a **synthetic** Quran seed (default: the fixture in
  `packages/domain/quran-ref/synthetic-fixture.ts`, which matches no real Mushaf) to that madrasa. `400 { issues }` if
  refused. Real Quran data is never loaded through test control.

## Not yet built

- F06: the production Quran seed and 16-line layout (blocked on the dataset, licence, edition, and reviewer; SRS §17.3);
  syncing Quran metadata to devices for offline Daily Entry (arrives with F05); the review list's homework ranges (F08);
  an operator CLI that applies an approved seed to existing madaris.

- The per-IP throttle (F17-AC13) and the F17 audit query API arrive with F17.
- Row-level security (ADR-006, ADR-016) covers the sync and roster tables. The F01/F02 tables (`users`, `memberships`,
  `audit_logs`, …) do not have it yet: sign-in looks users up across madaris by User ID, so it needs a design decision
  (open question in docs/handover/F03-plan.md). Every query on them filters by the membership's organization.
- Rate limiting on `/sync/*` is not built (open item D4 in docs/handover/F12-plan.md §12).
- F02: an operator CLI or console for creating workspaces (only test control does it today), and removing or demoting
  an Owner (who may do it is still open).
- The platform operator's reset of an Owner's two-factor setup is operator tooling, not an API route.
- Open items from the F01 code review (2026-11-02):
  - Refresh-token reuse is detected one rotation back only; older replays are refused but do not end the session (L3).
  - `login_failures` rows are never pruned; a cleanup job arrives with the pg-boss workers (L10).
  - Unknown User IDs answer a reset request with slightly less database work than real ones; the email send no
    longer adds to the difference (M3, partly addressed).
