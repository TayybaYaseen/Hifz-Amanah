// Safe, stable API errors. Clients localize by `code`; messages never include internal detail.
import type { FastifyError, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LAST_ADMIN_MESSAGE, type ApiError, type ErrorCode } from '@hifz/contracts';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  OTP_INVALID: 400,
  CURRENT_PASSWORD_INCORRECT: 400,
  TWO_FACTOR_INVALID: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  REAUTH_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  LOGIN_ID_TAKEN: 409,
  LAST_ADMIN: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  // Sync (F12). The per-operation codes normally travel inside push results, not as HTTP errors.
  ACCESS_REVOKED: 403,
  UPGRADE_REQUIRED: 426,
  DEPENDENCY_PENDING: 409,
  CONFLICT_OPEN: 409,
  OP_ID_REUSED: 409,
  ID_TAKEN: 409,
  ENTITY_NOT_SUPPORTED: 400,
  CONFLICT_STALE: 409,
  CONFLICT_CLOSED: 409,
  // Calendar (F04).
  RECORDS_EXIST: 409,
  LEAVE_NOT_AWAITING: 409,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION: 'Some fields are not valid',
  OTP_INVALID: 'The code is not valid or has expired',
  CURRENT_PASSWORD_INCORRECT: 'The current password is incorrect',
  TWO_FACTOR_INVALID: 'The code is not valid',
  INVALID_CREDENTIALS: 'User ID or password is incorrect',
  UNAUTHENTICATED: 'Sign in to continue',
  SESSION_EXPIRED: 'Your session has ended. Sign in again',
  REAUTH_REQUIRED: 'Sign in again to continue',
  FORBIDDEN: 'You do not have permission to do this',
  NOT_FOUND: 'Not found',
  LOGIN_ID_TAKEN: 'User ID already in use',
  LAST_ADMIN: LAST_ADMIN_MESSAGE,
  RATE_LIMITED: 'Too many requests. Try again later',
  INTERNAL: 'Something went wrong',
  ACCESS_REVOKED: 'Your access to this madrasa was removed',
  UPGRADE_REQUIRED: 'Update the app to keep syncing',
  DEPENDENCY_PENDING: 'Waiting for a related change to sync first',
  CONFLICT_OPEN: 'This record has a conflict to resolve first',
  OP_ID_REUSED: 'This change could not be accepted',
  ID_TAKEN: 'This change could not be accepted',
  ENTITY_NOT_SUPPORTED: 'This kind of change cannot sync yet',
  CONFLICT_STALE: 'The record changed again. Review the latest version',
  CONFLICT_CLOSED: 'This conflict was already resolved',
  RECORDS_EXIST: 'Records already exist for this date. Confirm to continue',
  LEAVE_NOT_AWAITING: 'This leave is no longer waiting for a decision',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(code: ErrorCode, fields?: Record<string, string>) {
    super(DEFAULT_MESSAGE[code]);
    this.code = code;
    this.fields = fields;
  }
}

export const fieldError = (field: string, issue: string): AppError => new AppError('VALIDATION', { [field]: issue });

export function body(error: AppError): ApiError {
  return { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } };
}

/** Parses input with a shared Zod schema; failures become a VALIDATION error naming the fields. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  throw new AppError('VALIDATION', issueFields(result.error));
}

/** Field path → issue code for a Zod error. Never includes the rejected values. */
export function issueFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    fields[key] ??= issue.code === 'unrecognized_keys' ? 'NOT_ALLOWED' : 'INVALID';
    if (issue.code === 'unrecognized_keys') for (const k of issue.keys) fields[k] = 'NOT_ALLOWED';
  }
  return fields;
}

/**
 * What may be logged about an unexpected error: its class name and code (the SQLSTATE for a database error) only.
 * Never the message, detail, where, stack, or parameters: a Postgres error's detail ("Failing row contains (…)")
 * and some messages ("invalid input syntax … \"<value>\"") carry row values, which can include note bodies
 * (AGENTS.md §6, FR-AUD-003, NFR-REL-004).
 */
export function safeErrorSummary(error: unknown): { name: string; code: string } {
  const record = typeof error === 'object' && error !== null ? (error as { name?: unknown; code?: unknown }) : {};
  const code = record.code === undefined || record.code === null ? 'unknown' : String(record.code).slice(0, 64);
  const name = typeof record.name === 'string' ? record.name.slice(0, 64) : typeof error;
  return { name, code };
}

/** AppErrors pass through; any other error is replaced by one that carries only its safe summary. */
export function sanitizeError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  const { name, code } = safeErrorSummary(error);
  const safe = new Error(`operation failed (${name} ${code})`);
  return Object.assign(safe, { code });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) return reply.status(STATUS[err.code]).send(body(err));
    if ('statusCode' in err && err.statusCode && err.statusCode < 500) {
      // Fastify-level client errors (malformed JSON, body too large).
      return reply.status(err.statusCode).send(body(new AppError('VALIDATION')));
    }
    request.log.error({ error: safeErrorSummary(err) }, 'unhandled error');
    return reply.status(500).send(body(new AppError('INTERNAL')));
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send(body(new AppError('NOT_FOUND'))));
}
