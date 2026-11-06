-- 0001 · Identity (F01) and the minimum organization/membership/audit tables it needs.
-- ARCHITECTURE.md §6.1, §6.3, §7.1, §15. F02 and F17 extend these tables in later migrations.
-- No ON DELETE CASCADE into history or audit tables; accounts are deactivated, never deleted.

CREATE TABLE organizations (
  id                uuid PRIMARY KEY,
  kind              text NOT NULL CHECK (kind IN ('INDIVIDUAL', 'MADRASA')),
  name              text NOT NULL,
  -- Short madrasa code, suggested as the User ID prefix (FR-AUTH-013). Set by the platform operator.
  code              text NOT NULL CHECK (code ~ '^[A-Za-z0-9]{2,12}$'),
  timezone          text NOT NULL DEFAULT 'Asia/Karachi',
  week_start        text NOT NULL DEFAULT 'MONDAY',
  daily_report_mode text NOT NULL DEFAULT 'SINGLE' CHECK (daily_report_mode IN ('SINGLE', 'MULTI_SESSION')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_code_key ON organizations (lower(code));

CREATE TABLE users (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations (id),
  login_id         text NOT NULL CHECK (login_id ~ '^[A-Za-z0-9-]{3,32}$'),
  password_hash    text NOT NULL,
  email            text,
  display_name     text NOT NULL,
  preferred_locale text NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en', 'ur', 'ur-Latn')),
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEACTIVATED')),
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deactivated_at   timestamptz
);
-- User IDs are global and case-insensitive (FR-AUTH-013). Email is deliberately NOT unique (FR-AUTH-009/011).
CREATE UNIQUE INDEX users_login_id_key ON users (lower(login_id));
CREATE INDEX users_organization_idx ON users (organization_id);

CREATE TABLE memberships (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id),
  user_id         uuid NOT NULL REFERENCES users (id),
  role            text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT')),
  all_classes     boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz
);
-- One account per madrasa (FR-AUTH-011): a user has at most one active membership.
CREATE UNIQUE INDEX memberships_one_active_per_user ON memberships (user_id) WHERE status = 'ACTIVE';

CREATE TABLE sessions (
  id                          uuid PRIMARY KEY,
  user_id                     uuid NOT NULL REFERENCES users (id),
  refresh_token_hash          text NOT NULL UNIQUE,
  -- The token replaced by the last rotation; presenting it again is reuse and revokes the session.
  previous_refresh_token_hash text,
  device_id                   text,
  authenticated_at            timestamptz NOT NULL,
  created_at                  timestamptz NOT NULL,
  expires_at                  timestamptz NOT NULL,
  revoked_at                  timestamptz,
  revoked_reason              text
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_previous_hash_idx ON sessions (previous_refresh_token_hash);

CREATE TABLE password_reset_otps (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users (id),
  otp_hash      text NOT NULL,
  created_at    timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  superseded_at timestamptz
);
CREATE INDEX password_reset_otps_user_idx ON password_reset_otps (user_id, created_at);

-- Failed sign-ins, keyed by the typed User ID (lower-cased) so unknown IDs are throttled the same way (FR-AUTH-014).
CREATE TABLE login_failures (
  id        bigserial PRIMARY KEY,
  login_key text NOT NULL,
  failed_at timestamptz NOT NULL
);
CREATE INDEX login_failures_key_idx ON login_failures (login_key, failed_at);

CREATE TABLE login_locks (
  login_key    text PRIMARY KEY,
  locked_until timestamptz NOT NULL
);

CREATE TABLE user_totp (
  user_id          uuid PRIMARY KEY REFERENCES users (id),
  secret_encrypted text NOT NULL,
  created_at       timestamptz NOT NULL,
  enabled_at       timestamptz
);

CREATE TABLE recovery_codes (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users (id),
  code_hash      text NOT NULL,
  created_at     timestamptz NOT NULL,
  used_at        timestamptz,
  invalidated_at timestamptz
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);

-- Append-only audit log (ARCHITECTURE.md §15). Written in the same transaction as the change.
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations (id),
  actor_user_id   uuid REFERENCES users (id),
  action          text NOT NULL,
  target_type     text NOT NULL,
  target_id       uuid,
  -- Field names and non-sensitive values only. Never passwords, OTPs, tokens, or note bodies.
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL
);
CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_id);

CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
