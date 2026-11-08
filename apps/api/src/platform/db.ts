// Database access. Kysely over node-postgres; parameterized SQL only (ARCHITECTURE.md §7.5).
import { Kysely, PostgresDialect, type Generated, type Transaction } from 'kysely';
import pg from 'pg';

type Timestamp = Date;

export interface OrganizationsTable {
  id: string;
  kind: 'INDIVIDUAL' | 'MADRASA';
  name: string;
  code: string;
  // Defaults Asia/Karachi, MONDAY, SINGLE (F02-AC1): optional on insert so new workspaces get the database defaults.
  timezone: Generated<string>;
  week_start: Generated<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'>;
  daily_report_mode: Generated<'SINGLE' | 'MULTI_SESSION'>;
  created_at: Timestamp;
}

export interface UsersTable {
  id: string;
  organization_id: string;
  login_id: string;
  password_hash: string;
  email: string | null;
  display_name: string;
  preferred_locale: 'en' | 'ur' | 'ur-Latn';
  status: 'ACTIVE' | 'DEACTIVATED';
  locked_until: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deactivated_at: Timestamp | null;
}

export interface MembershipsTable {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'OWNER' | 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
  all_classes: boolean;
  status: 'ACTIVE' | 'REVOKED';
  created_at: Timestamp;
  revoked_at: Timestamp | null;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  previous_refresh_token_hash: string | null;
  device_id: string | null;
  authenticated_at: Timestamp;
  created_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  revoked_reason: string | null;
}

export interface PasswordResetOtpsTable {
  id: string;
  user_id: string;
  otp_hash: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  attempts: number;
  consumed_at: Timestamp | null;
  superseded_at: Timestamp | null;
}

export interface LoginFailuresTable {
  id: Generated<string>;
  login_key: string;
  failed_at: Timestamp;
}

export interface LoginLocksTable {
  login_key: string;
  locked_until: Timestamp;
}

export interface UserTotpTable {
  user_id: string;
  secret_encrypted: string;
  created_at: Timestamp;
  enabled_at: Timestamp | null;
  /** Last accepted TOTP time step (bigint, returned as a string by pg). */
  last_used_step: string | number | null;
}

export interface RecoveryCodesTable {
  id: string;
  user_id: string;
  code_hash: string;
  created_at: Timestamp;
  used_at: Timestamp | null;
  invalidated_at: Timestamp | null;
}

export interface AuditLogsTable {
  id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  summary: Record<string, unknown>;
  created_at: Timestamp;
}

// ---------- Sync (F12, 0004_sync.sql). Row-level security applies: query them only through withTenant(). ----------

export interface SyncOpsTable {
  op_id: string;
  organization_id: string;
  user_id: string;
  device_id: string;
  entity: string;
  entity_id: string;
  op_hash: Buffer;
  status: 'APPLIED' | 'CONFLICT' | 'REJECTED';
  result: unknown;
  received_at: Timestamp;
}

export interface ChangeLogTable {
  /** bigint, returned as a string by pg. */
  seq: Generated<string>;
  organization_id: string;
  entity: string;
  entity_id: string;
  row_version: string | number;
  op: 'UPSERT' | 'REMOVE';
  changed_fields: string[];
  student_id: string | null;
  class_id: string | null;
  actor_user_id: string | null;
  op_id: string | null;
  at: Timestamp;
}

export interface SyncConflictsTable {
  id: string;
  organization_id: string;
  entity: string;
  entity_id: string;
  base_version: string | number | null;
  server_version: string | number;
  device_fields: unknown;
  server_fields: unknown;
  conflict_fields: string[];
  student_id: string | null;
  class_id: string | null;
  caused_by_user_id: string;
  op_id: string;
  status: 'OPEN' | 'RESOLVED';
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  resolution: unknown;
  created_at: Timestamp;
}

export interface ScopeChangesTable {
  organization_id: string;
  user_id: string;
  seq: Generated<string>;
  at: Timestamp;
}

export interface Database {
  sync_ops: SyncOpsTable;
  change_log: ChangeLogTable;
  sync_conflicts: SyncConflictsTable;
  scope_changes: ScopeChangesTable;
  organizations: OrganizationsTable;
  users: UsersTable;
  memberships: MembershipsTable;
  sessions: SessionsTable;
  password_reset_otps: PasswordResetOtpsTable;
  login_failures: LoginFailuresTable;
  login_locks: LoginLocksTable;
  user_totp: UserTotpTable;
  recovery_codes: RecoveryCodesTable;
  audit_logs: AuditLogsTable;
}

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;
/** Either the root connection or an open transaction. */
export type Executor = Db | Tx;

export interface DbOptions {
  connectionString: string;
  /** Embedded Postgres (PGlite) serves one connection at a time. */
  maxConnections?: number;
}

export function createDb({ connectionString, maxConnections = 10 }: DbOptions): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString, max: maxConnections });
  return { db: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }), pool };
}
