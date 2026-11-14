// Opaque pull cursor (F12 plan §5). It encodes positions in change_log.seq, never row data:
// - BOOT: bootstrap snapshot of the rows current at watermark `w`, delivered after seq `a` (paged);
// - LOG: incremental changes after seq `a`.
// A tampered cursor can only ask for other positions of the caller's own organization: the pull still filters
// by organization (and RLS) and by the caller's scope.
import { z } from 'zod';
import { AppError } from '../../platform/errors.ts';

const seq = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);

const Cursor = z.discriminatedUnion('m', [
  z.strictObject({ m: z.literal('BOOT'), w: seq, a: seq }),
  z.strictObject({ m: z.literal('LOG'), a: seq }),
]);
export type Cursor = z.infer<typeof Cursor>;

const PREFIX = 'v1.';

export function encodeCursor(cursor: Cursor): string {
  return PREFIX + Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(text: string): Cursor {
  if (!text.startsWith(PREFIX)) throw new AppError('VALIDATION', { cursor: 'INVALID' });
  try {
    const parsed = Cursor.safeParse(JSON.parse(Buffer.from(text.slice(PREFIX.length), 'base64url').toString('utf8')));
    if (parsed.success) return parsed.data;
  } catch {
    // Not JSON: fall through.
  }
  throw new AppError('VALIDATION', { cursor: 'INVALID' });
}

export const maxSeq = (a: string, b: string): string => (BigInt(a) >= BigInt(b) ? a : b);
