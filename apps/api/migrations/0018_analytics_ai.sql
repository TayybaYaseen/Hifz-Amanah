-- 0018 · AI gateway settings, request trail, and monthly usage (F15; US-063…065). FR-AI-011…013, NFR-AI-003,
-- NFR-PRV-005; DEC-B44, DEC-B45 (provider vendor Deferred), DEC-B46. ARCHITECTURE.md §12, §15.
--
-- - org_ai_settings: one row per madrasa; no row means the defaults below. AI is off until an Admin turns it on and a
--   provider is set (CHECK). `provider` is an adapter id with no FK and no enum: the vendor is Deferred (DEC-B45).
--   Money is integer micro-USD, never a float. The budget defaults to USD 10 per month and can only be lowered
--   (FR-AI-012). The five shareable data categories are on by default (FR-AI-013, DEC-B46). There is deliberately
--   no column for sharing names, contact details, or notes: those are never sent (NFR-AI-003).
-- - ai_requests: one row per AI call (usage and audit trail). `payload` is the minimized, pseudonymous request only;
--   there is no student_id and no name column. Kept 90 days (DEC-B44): the tenant role may DELETE a row only once it
--   is older than 90 days (restrictive policy), which is the retention prune's only path. Rows are never updated.
-- - ai_usage_monthly: request and cost totals per madrasa and month (first day of the month in the madrasa's
--   timezone), incremented in the same transaction as the ai_requests insert and used for the cap checks. Kept 1 year
--   (DEC-B44): DELETE is allowed only for months that ended more than a year ago.
-- No ON DELETE CASCADE. Settings rows are never deleted (trigger). RLS as in 0004/0007 (ADR-016).
--
-- Rollback / forward fix: new tables only, no existing data touched. Rolling back is DROP TABLE of the three tables
-- (loses AI settings and usage history); prefer a forward-fix migration.

-- ---------- org_ai_settings (FR-AI-011…013) ----------
CREATE TABLE org_ai_settings (
  organization_id          uuid PRIMARY KEY REFERENCES organizations (id),
  enabled                  boolean NOT NULL DEFAULT false,
  provider                 text CHECK (provider IS NULL OR length(provider) BETWEEN 1 AND 64), -- DEFERRED: DEC-B45
  monthly_request_cap      integer CHECK (monthly_request_cap IS NULL OR monthly_request_cap > 0),
  teacher_daily_cap        integer NOT NULL DEFAULT 20 CHECK (teacher_daily_cap > 0),
  -- USD 10 = 10 000 000 micro-USD; an Admin may only lower it (FR-AI-012).
  monthly_budget_micro_usd bigint NOT NULL DEFAULT 10000000 CHECK (monthly_budget_micro_usd > 0 AND monthly_budget_micro_usd <= 10000000),
  share_attendance         boolean NOT NULL DEFAULT true,
  share_progress           boolean NOT NULL DEFAULT true,
  share_mistakes           boolean NOT NULL DEFAULT true,
  share_quality            boolean NOT NULL DEFAULT true,
  share_homework           boolean NOT NULL DEFAULT true,
  updated_by               uuid REFERENCES users (id),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_ai_settings_enabled_needs_provider CHECK (NOT enabled OR provider IS NOT NULL)
);
CREATE TRIGGER org_ai_settings_no_delete BEFORE DELETE ON org_ai_settings FOR EACH ROW EXECUTE FUNCTION roster_no_delete();

-- ---------- ai_requests (FR-AI-011, NFR-AI-003; kept 90 days) ----------
CREATE TABLE ai_requests (
  id                uuid PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id),
  requested_by      uuid NOT NULL REFERENCES users (id),
  provider          text NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  locale            text NOT NULL CHECK (locale IN ('en', 'ur', 'ur-Latn')),
  period_from       date,
  period_to         date,
  -- The minimized, pseudonymous request exactly as sent: never names, contacts, notes, or student ids.
  payload           jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  input_hash        text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  output            jsonb,
  outcome           text NOT NULL CHECK (outcome IN ('OK', 'INVALID_OUTPUT', 'WRONG_LANGUAGE', 'TIMEOUT', 'PROVIDER_ERROR')),
  provider_attempts smallint NOT NULL DEFAULT 1 CHECK (provider_attempts >= 1),
  input_tokens      integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens     integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_micro_usd    bigint NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  latency_ms        integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((period_from IS NULL) = (period_to IS NULL)),
  CHECK (period_to >= period_from)
);
-- Madrasa history and the 90-day prune (created_at < now() - 90 days), per tenant.
CREATE INDEX ai_requests_org_idx ON ai_requests (organization_id, created_at);
-- The per-Teacher daily cap: count of a user's requests since the start of the madrasa's day.
CREATE INDEX ai_requests_requester_idx ON ai_requests (organization_id, requested_by, created_at);

-- ---------- ai_usage_monthly (FR-AI-012; kept 1 year) ----------
CREATE TABLE ai_usage_monthly (
  organization_id uuid NOT NULL REFERENCES organizations (id),
  month           date NOT NULL CHECK (extract(day FROM month) = 1),
  requests        integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  cost_micro_usd  bigint NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0),
  PRIMARY KEY (organization_id, month)
);

-- ---------- Row-level security (ADR-016) ----------
ALTER TABLE org_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_ai_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY org_ai_settings_tenant ON org_ai_settings
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_requests_tenant ON ai_requests
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());
-- Retention (DEC-B44): only rows older than 90 days can be deleted.
CREATE POLICY ai_requests_retention ON ai_requests AS RESTRICTIVE FOR DELETE
  USING (created_at < now() - interval '90 days');

ALTER TABLE ai_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_monthly FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_monthly_tenant ON ai_usage_monthly
  USING (organization_id = app_current_org_id()) WITH CHECK (organization_id = app_current_org_id());
-- Retention (DEC-B44): a month's totals are kept one full year after the month ends.
CREATE POLICY ai_usage_monthly_retention ON ai_usage_monthly AS RESTRICTIVE FOR DELETE
  USING (month < (now() - interval '13 months')::date);

-- Least privilege: settings are never deleted; requests are insert-only (DELETE only through the retention policy);
-- usage totals are upserted (requests, cost) and pruned after a year.
GRANT SELECT, INSERT ON org_ai_settings TO hifz_tenant;
GRANT UPDATE (enabled, provider, monthly_request_cap, teacher_daily_cap, monthly_budget_micro_usd,
  share_attendance, share_progress, share_mistakes, share_quality, share_homework, updated_by, updated_at)
  ON org_ai_settings TO hifz_tenant;
GRANT SELECT, INSERT, DELETE ON ai_requests TO hifz_tenant;
GRANT SELECT, INSERT, DELETE ON ai_usage_monthly TO hifz_tenant;
GRANT UPDATE (requests, cost_micro_usd) ON ai_usage_monthly TO hifz_tenant;
