-- 0002 · Reject a reused authenticator code (code review F01, L1).
-- Each accepted TOTP time step is remembered; a code for that step or an earlier one is refused.
ALTER TABLE user_totp ADD COLUMN last_used_step bigint;
