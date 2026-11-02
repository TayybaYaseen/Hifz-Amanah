// F01 · Identity — mapping API failures to messages (apps/api/README.md conventions).
import { describe, expect, it } from 'vitest';
import { ApiFailure, request } from './client.ts';
import { errorKeys } from './errors.ts';

describe('F01 · mobile errors', () => {
  it('F01-AC16 (US-004) field errors go to their fields; unknown issues become INVALID', () => {
    const failure = new ApiFailure('VALIDATION', 400, { password: 'PASSWORD_TOO_SHORT', email: 'SOMETHING_NEW' });
    expect(errorKeys(failure)).toEqual({ form: null, fields: { password: 'fields.PASSWORD_TOO_SHORT', email: 'fields.INVALID' } });
  });

  it('F01-AC14 (US-003) a coded failure maps to its form message', () => {
    expect(errorKeys(new ApiFailure('LOGIN_ID_TAKEN', 409))).toEqual({ form: 'errors.LOGIN_ID_TAKEN', fields: {} });
  });

  it('F01 unit: anything unexpected is a generic server message, never raw text', () => {
    expect(errorKeys(new Error('boom'))).toEqual({ form: 'errors.INTERNAL', fields: {} });
  });

  it('F01 unit: no response at all is NETWORK; a non-JSON error is INTERNAL', async () => {
    await expect(request('http://x', async () => { throw new TypeError('offline'); }, '/me')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
    await expect(request('http://x', async () => new Response('<html>', { status: 502 }), '/me')).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });
});
