// The Quran source catalogue: registering downloaded source files and recording their licence status (F06;
// FR-SAB-011; ADR-017 §3.1; DEC-B71, DEC-B72).
//
// PRIVILEGED, NOT TENANT CODE. `quran_sources` and `quran_source_licences` are global; the tenant role may only read
// them. This registry runs on the owner connection, from the maintainer CLI (`npm run quran:source`) or tests, never
// from a request handler.
//
// It records facts the maintainer supplies: the file's checksum, and the licence evidence the product owner holds.
// It never downloads anything and holds no Quran data. A new source always starts as LICENSE_REVIEW_REQUIRED. A
// status change is a new history row; nothing is overwritten or deleted. Approving a licence here needs the written
// evidence's reference; the registry cannot invent a permission.
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { LICENCE_STATUSES } from '@hifz/domain/quran-ref';
import type { Clock } from '../../platform/clock.ts';
import type { Db } from '../../platform/db.ts';

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (max: number) => z.string().trim().min(1).max(max);

export const RegisterSourceInput = z.strictObject({
  provider: z.string().regex(/^[A-Z0-9_]{2,40}$/),
  resourceName: text(300),
  resourceId: text(100).nullable(),
  category: z.enum(['SURAHS', 'AYAHS', 'JUZ', 'RUKU', 'HIZB', 'RUB_AL_HIZB', 'MANZIL7', 'LAYOUT', 'WORDS']),
  sourceUrl: text(500),
  downloadUrl: text(500).nullable(),
  downloadedOn: z.string().regex(ISO_DATE),
  fileName: text(300),
  fileSha256: z.string().regex(SHA256),
  sourceVersion: text(100).nullable(),
  notes: z.string().max(2000).nullable(),
  registeredBy: text(200),
});
export type RegisterSourceInput = z.infer<typeof RegisterSourceInput>;

export const RecordLicenceInput = z
  .strictObject({
    status: z.enum(LICENCE_STATUSES),
    licenceName: text(200).nullable(),
    permissionRef: text(300).nullable(),
    publisherClearanceRef: text(300).nullable(),
    attributionText: z.string().max(1000).nullable(),
    recordedBy: text(200),
  })
  // A cleared status must name its evidence (the database checks this too).
  .refine((v) => !(v.status === 'OPEN_LICENCE_VERIFIED' || v.status === 'PERMISSION_GRANTED') || v.permissionRef !== null, {
    path: ['permissionRef'],
    message: 'REQUIRED',
  });
export type RecordLicenceInput = z.infer<typeof RecordLicenceInput>;

export interface SourceView {
  id: string;
  provider: string;
  resourceName: string;
  resourceId: string | null;
  category: string;
  fileName: string;
  fileSha256: string;
  synthetic: boolean;
  licence: { status: string; permissionRef: string | null; publisherClearanceRef: string | null; recordedAt: string; recordedBy: string } | null;
}

export class SyntheticSourceNotAllowedError extends Error {
  constructor() {
    super('Synthetic sources are allowed only in tests');
    this.name = 'SyntheticSourceNotAllowedError';
  }
}

export class QuranSourceRegistry {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly allowSynthetic: boolean;

  /** `db` must be the owner connection: the tenant role cannot write the catalogue. */
  constructor(db: Db, clock: Clock, options: { allowSynthetic: boolean }) {
    this.db = db;
    this.clock = clock;
    this.allowSynthetic = options.allowSynthetic;
  }

  /**
   * Registers a downloaded file. Registering the same (provider, resource ID, checksum) again returns the existing row
   * unchanged. A new file always starts as LICENSE_REVIEW_REQUIRED (FR-SAB-011).
   */
  async register(raw: unknown, options: { synthetic?: boolean } = {}): Promise<{ id: string; created: boolean }> {
    const input = RegisterSourceInput.parse(raw);
    const synthetic = options.synthetic ?? false;
    if (synthetic && !this.allowSynthetic) throw new SyntheticSourceNotAllowedError();
    let q = this.db.selectFrom('quran_sources').select('id').where('provider', '=', input.provider).where('file_sha256', '=', input.fileSha256);
    q = input.resourceId === null ? q.where('resource_id', 'is', null) : q.where('resource_id', '=', input.resourceId);
    const existing = await q.executeTakeFirst();
    if (existing) return { id: existing.id, created: false };

    const id = uuidv7();
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('quran_sources')
        .values({
          id,
          provider: input.provider,
          resource_name: input.resourceName,
          resource_id: input.resourceId,
          category: input.category,
          source_url: input.sourceUrl,
          download_url: input.downloadUrl,
          downloaded_on: input.downloadedOn,
          file_name: input.fileName,
          file_sha256: input.fileSha256,
          source_version: input.sourceVersion,
          notes: input.notes,
          synthetic,
          registered_at: now,
          registered_by: input.registeredBy,
        })
        .execute();
      await tx
        .insertInto('quran_source_licences')
        .values({
          id: uuidv7(),
          source_id: id,
          status: 'LICENSE_REVIEW_REQUIRED',
          licence_name: null,
          permission_ref: null,
          publisher_clearance_ref: null,
          attribution_text: null,
          recorded_at: now,
          recorded_by: input.registeredBy,
        })
        .execute();
    });
    return { id, created: true };
  }

  /** Appends a licence record; the latest one is the source's current status. */
  async recordLicence(sourceId: string, raw: unknown): Promise<void> {
    const input = RecordLicenceInput.parse(raw);
    const source = await this.db.selectFrom('quran_sources').select('id').where('id', '=', sourceId).executeTakeFirst();
    if (!source) throw new Error(`Unknown source ${sourceId}`);
    await this.db
      .insertInto('quran_source_licences')
      .values({
        id: uuidv7(),
        source_id: sourceId,
        status: input.status,
        licence_name: input.licenceName,
        permission_ref: input.permissionRef,
        publisher_clearance_ref: input.publisherClearanceRef,
        attribution_text: input.attributionText,
        recorded_at: this.clock.now(),
        recorded_by: input.recordedBy,
      })
      .execute();
  }

  /** Every registered source with its current licence record. */
  async list(): Promise<SourceView[]> {
    const sources = await this.db.selectFrom('quran_sources').selectAll().orderBy('registered_at').orderBy('id').execute();
    const licences = await this.db.selectFrom('quran_source_licences').selectAll().orderBy('recorded_at', 'desc').orderBy('id', 'desc').execute();
    return sources.map((s) => {
      const l = licences.find((x) => x.source_id === s.id);
      return {
        id: s.id,
        provider: s.provider,
        resourceName: s.resource_name,
        resourceId: s.resource_id,
        category: s.category,
        fileName: s.file_name,
        fileSha256: s.file_sha256,
        synthetic: s.synthetic,
        licence: l
          ? { status: l.status, permissionRef: l.permission_ref, publisherClearanceRef: l.publisher_clearance_ref, recordedAt: l.recorded_at.toISOString(), recordedBy: l.recorded_by }
          : null,
      };
    });
  }
}
