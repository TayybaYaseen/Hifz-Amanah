// Quran reference snapshot contracts (F06; ADR-018; FR-SAB-014; DEC-B75, DEC-B78, DEC-B79). Shared by the API, which
// serves the snapshot, and the app, which validates it before caching it on a Teacher/Admin device. Organization and
// role come from the signed-in membership only; no request carries an organization ID.
//
// The snapshot holds no Quran text and no word-level data. Its exact JSON body is canonical (sorted keys, no
// whitespace), and `referenceVersion` is the SHA-256 of those bytes: the device recomputes it before activation.
import { z } from 'zod';

export const SHA256_HEX = /^[0-9a-f]{64}$/;

/** `format`: the highest snapshot format the app reads. `have`: the version the device has cached, if any. */
export const ReferenceVersionQuery = z.strictObject({
  format: z.coerce.number().int().min(1).max(1000),
  have: z.string().regex(SHA256_HEX).optional(),
});
export type ReferenceVersionQuery = z.infer<typeof ReferenceVersionQuery>;

export const ReferenceSnapshotQuery = z.strictObject({ format: z.coerce.number().int().min(1).max(1000) });
export type ReferenceSnapshotQuery = z.infer<typeof ReferenceSnapshotQuery>;

/**
 * What the server says about a cached version:
 * - CURRENT: it is the current version;
 * - SUPERSEDED: an older version, still allowed; fetch the new one and keep the old one until it is verified;
 * - REVOKED: it contained data whose licence was withdrawn; delete it now (DEC-B79);
 * - UNKNOWN: the server has no record of it for this madrasa; fetch the current one.
 */
export const CACHED_STATUSES = ['CURRENT', 'SUPERSEDED', 'REVOKED', 'UNKNOWN'] as const;
export type CachedStatus = (typeof CACHED_STATUSES)[number];
export const REVOCATION_REASONS = ['LICENCE_WITHDRAWN'] as const;

const layoutState = z.strictObject({ importId: z.string().uuid().nullable(), verified: z.boolean(), withdrawn: z.boolean() });

export const ReferenceVersionResponse = z.strictObject({
  snapshotFormatVersion: z.number().int().min(1),
  referenceVersion: z.string().regex(SHA256_HEX),
  bytes: z.number().int().min(1),
  builtAt: z.string(),
  layout: layoutState,
  metadataWithdrawn: z.boolean(),
  /** No Surah metadata at all for this madrasa: the app shows "No Quran reference data yet". */
  empty: z.boolean(),
  cached: z
    .strictObject({
      referenceVersion: z.string().regex(SHA256_HEX),
      status: z.enum(CACHED_STATUSES),
      revokedAt: z.string().optional(),
      reasonCode: z.enum(REVOCATION_REASONS).optional(),
    })
    .optional(),
});
export type ReferenceVersionResponse = z.infer<typeof ReferenceVersionResponse>;

const count = z.number().int().min(1);
const text = z.string().min(1).max(400);

/** Format 1 of the snapshot body (ADR-018 §3.3). Strict at every level: an unexpected field fails validation. */
export const ReferenceSnapshotV1Schema = z.strictObject({
  snapshotFormatVersion: z.literal(1),
  edition: z.strictObject({
    code: z.string().regex(/^[A-Z0-9_]{3,40}$/),
    linesPerPage: z.number().int().min(1).max(30),
    publisher: z.string().max(200).nullable(),
    printingId: z.string().max(200).nullable(),
    pageCount: z.number().int().min(1).max(2000).nullable(),
  }),
  layout: layoutState,
  metadataWithdrawn: z.boolean(),
  surahs: z.array(z.tuple([z.number().int().min(1).max(114), text, text, z.number().int().min(1).max(999)])).max(114),
  paras: z.array(z.tuple([z.number().int().min(1).max(30), count, count, count, count])).max(30),
  lines: z.array(z.tuple([count, z.number().int().min(1).max(30), z.number().int().min(1).max(114), count, count])).max(60_000),
  attribution: z.array(z.string().max(1000)).max(50),
});
export type ReferenceSnapshotV1Body = z.infer<typeof ReferenceSnapshotV1Schema>;

/** Response headers of `GET /quran/reference/snapshot`. */
export const REFERENCE_VERSION_HEADER = 'x-reference-version';
