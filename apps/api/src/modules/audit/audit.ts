// Append-only audit writer (ARCHITECTURE.md §15). Call it with the same transaction as the change it
// describes. Summaries carry field names and non-sensitive values only; anything that looks like a
// password, OTP, token, secret, code, or note body is dropped before it is stored.
import { v7 as uuidv7 } from 'uuid';
import type { Executor } from '../../platform/db.ts';

export type AuditAction =
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_DEACTIVATED'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_RESET_RATE_LIMITED'
  | 'PASSWORD_CHANGED'
  | 'PROFILE_UPDATED'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_RESET'
  | 'RECOVERY_CODE_USED'
  | 'RECOVERY_CODES_REGENERATED';

export interface AuditEvent {
  organizationId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  targetType: 'USER';
  targetId: string | null;
  summary?: Record<string, unknown>;
  at: Date;
}

const SENSITIVE_KEY = /pass|otp|token|secret|code|note|hash/i;

export function redact(summary: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(summary)) {
    if (SENSITIVE_KEY.test(key)) continue;
    out[key] = value !== null && typeof value === 'object' && !Array.isArray(value) ? redact(value as Record<string, unknown>) : value;
  }
  return out;
}

export async function recordAudit(db: Executor, event: AuditEvent): Promise<void> {
  await db
    .insertInto('audit_logs')
    .values({
      id: uuidv7(),
      organization_id: event.organizationId,
      actor_user_id: event.actorUserId,
      action: event.action,
      target_type: event.targetType,
      target_id: event.targetId,
      summary: JSON.stringify(redact(event.summary ?? {})) as unknown as Record<string, unknown>,
      created_at: event.at,
    })
    .execute();
}
