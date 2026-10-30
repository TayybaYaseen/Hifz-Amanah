// F17 · Security, audit, and administration — unit: account recovery (docs/specs/05-f17-security-audit-admin/)
import { describe, it } from 'vitest';

describe('F17 · recovery OTP', () => {
  it.todo('F17-AC10 (US-070) an OTP is stored only as a hash');
  it.todo('F17-AC10 (US-070) an OTP expires after the configured time');
  it.todo('F17-AC10 (US-070) an OTP is invalid after the configured number of wrong tries');
});

describe('F17 · throttling', () => {
  it.todo('F17-AC11 (US-070) over the per-account limit, no OTP is sent and a rate-limited event is audited');
  it.todo('F17-AC13 (US-070) failed OTP tries across many accounts from one IP throttle that IP past the threshold');
});
