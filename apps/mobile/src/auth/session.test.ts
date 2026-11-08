// F01 · Identity — mobile session logic (docs/specs/01-f01-identity-authentication.md). Runs in Vitest, no device.
import { describe, expect, it } from 'vitest';
import type { MeResponse } from '@hifz/contracts';
import type { Fetch } from '../api/client.ts';
import { SessionManager, type SessionState, type TokenStore } from './session.ts';

const ME: MeResponse = {
  id: 'u1',
  loginId: 'teacher-a1',
  displayName: 'Test teacher',
  email: null,
  role: 'TEACHER',
  organization: { id: 'o1', name: 'Madrasa Alif (test)' },
  preferredLocale: 'en',
  twoFactorEnabled: false,
};

class MemoryStore implements TokenStore {
  refresh: string | null = null;
  lastLoginId: string | null = null;
  async getRefreshToken() { return this.refresh; }
  async setRefreshToken(token: string | null) { this.refresh = token; }
  async getLastLoginId() { return this.lastLoginId; }
  async setLastLoginId(id: string | null) { this.lastLoginId = id; }
}

type Handler = (body: Record<string, unknown>, headers: Record<string, string>) => { status: number; json?: unknown };

/** A fake API: routes "METHOD /path" to handlers and records every call. */
function fakeApi(routes: Record<string, Handler>) {
  const calls: Array<{ route: string; body: Record<string, unknown>; auth: string | undefined }> = [];
  const fetchFn: Fetch = async (url, init) => {
    const route = `${init?.method ?? 'GET'} ${url.replace('http://api', '')}`;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ route, body, auth: headers.Authorization });
    const handler = routes[route];
    if (!handler) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: '' } }), { status: 404 });
    const { status, json } = handler(body, headers);
    return new Response(status === 204 ? null : JSON.stringify(json ?? {}), { status });
  };
  return { fetchFn, calls };
}

const tokens = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn: 900 });
const expired = { status: 401, json: { error: { code: 'SESSION_EXPIRED', message: '' } } };

function setup(routes: Record<string, Handler>) {
  const store = new MemoryStore();
  const api = fakeApi(routes);
  const session = new SessionManager('http://api', api.fetchFn, store);
  const states: SessionState[] = [];
  session.subscribe((s) => states.push(s));
  return { store, session, states, calls: api.calls };
}

describe('F01 · mobile session', () => {
  it('F01-AC1 (US-001) signing in stores only the refresh token and shows the account’s home', async () => {
    const { session, store } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'SIGNED_IN', ...tokens(1) } }),
      'GET /me': (_b, h) => (h.Authorization === 'Bearer access-1' ? { status: 200, json: ME } : expired),
    });
    await session.signIn('  teacher-a1 ', 'E2e-Test-Pass-1');
    expect(session.current).toEqual({ kind: 'signedIn', me: ME });
    expect(store.refresh).toBe('refresh-1');
    expect(store.lastLoginId).toBe('teacher-a1');
    // The access token is never written to storage.
    expect(JSON.stringify(store)).not.toContain('access-1');
  });

  it('F01-AC3 (US-001) a refused sign-in keeps the user signed out and stores nothing', async () => {
    const { session, store } = setup({
      'POST /auth/sign-in': () => ({ status: 401, json: { error: { code: 'INVALID_CREDENTIALS', message: '' } } }),
    });
    await expect(session.signIn('teacher-a1', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(store.refresh).toBeNull();
    expect(session.current.kind).toBe('starting');
  });

  it('F01-AC6 (US-001) a 401 refreshes once and retries; a refused refresh shows the session-expired prompt', async () => {
    let refreshes = 0;
    const { session, store } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'SIGNED_IN', ...tokens(1) } }),
      'GET /me': (_b, h) => (h.Authorization === 'Bearer access-1' || h.Authorization === 'Bearer access-2' ? { status: 200, json: ME } : expired),
      'GET /accounts?page=1': (_b, h) => (h.Authorization === 'Bearer access-2' ? { status: 200, json: { items: [] } } : expired),
      // The server has ended the session: every token is refused.
      'GET /accounts?page=2': () => expired,
      'POST /auth/refresh': (b) => {
        refreshes++;
        return b.refreshToken === 'refresh-1' ? { status: 200, json: tokens(2) } : expired;
      },
    });
    await session.signIn('teacher-a1', 'p');
    await expect(session.authorized('/accounts?page=1')).resolves.toEqual({ items: [] });
    expect(refreshes).toBe(1);
    expect(store.refresh).toBe('refresh-2');

    // The server ends the session: the next refresh is refused.
    store.refresh = 'refresh-revoked';
    await expect(session.authorized('/accounts?page=2')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(session.current).toEqual({ kind: 'expired', loginId: 'teacher-a1' });
    expect(store.refresh).toBeNull();
    // The User ID is kept for the prompt.
    expect(store.lastLoginId).toBe('teacher-a1');
  });

  it('F01-AC6 (US-001) parallel 401s share one refresh, so a rotated token is never replayed', async () => {
    let refreshes = 0;
    const { session } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'SIGNED_IN', ...tokens(1) } }),
      'GET /me': (_b, h) => (h.Authorization === 'Bearer access-2' || h.Authorization === 'Bearer access-1' ? { status: 200, json: ME } : expired),
      'GET /a': (_b, h) => (h.Authorization === 'Bearer access-2' ? { status: 200, json: 'a' } : expired),
      'GET /b': (_b, h) => (h.Authorization === 'Bearer access-2' ? { status: 200, json: 'b' } : expired),
      'POST /auth/refresh': () => {
        refreshes++;
        return { status: 200, json: tokens(2) };
      },
    });
    await session.signIn('teacher-a1', 'p');
    expect(await Promise.all([session.authorized('/a'), session.authorized('/b')])).toEqual(['a', 'b']);
    expect(refreshes).toBe(1);
  });

  it('F01-AC5 (US-001) sign-out sends the refresh token to the server and forgets the session', async () => {
    const { session, store, calls } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'SIGNED_IN', ...tokens(1) } }),
      'GET /me': () => ({ status: 200, json: ME }),
      'POST /auth/sign-out': () => ({ status: 204 }),
    });
    await session.signIn('teacher-a1', 'p');
    await session.signOut();
    const signOut = calls.find((c) => c.route === 'POST /auth/sign-out');
    expect(signOut?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(store.refresh).toBeNull();
    expect(session.current).toEqual({ kind: 'signedOut', lastLoginId: 'teacher-a1' });
  });

  it('F01-AC5 (US-001) sign-out while offline still forgets the session on the device', async () => {
    const store = new MemoryStore();
    const session = new SessionManager('http://api', async () => { throw new TypeError('Network request failed'); }, store);
    store.refresh = 'refresh-1';
    await session.signOut();
    expect(store.refresh).toBeNull();
    expect(session.current.kind).toBe('signedOut');
  });

  it('F01 unit: offline sign-in reports NETWORK and keeps the stored session', async () => {
    const store = new MemoryStore();
    const session = new SessionManager('http://api', async () => { throw new TypeError('Network request failed'); }, store);
    await expect(session.signIn('teacher-a1', 'p')).rejects.toMatchObject({ code: 'NETWORK' });
    store.refresh = 'kept';
    await session.restore();
    expect(store.refresh).toBe('kept');
  });

  it('F01-AC5 (US-001) regression H1: a slow request that finishes after sign-out cannot sign the user back in', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let meCalls = 0;
    const store = new MemoryStore();
    const fetchFn: Fetch = async (url, init) => {
      const path = url.replace('http://api', '');
      if (path === '/auth/sign-in') return new Response(JSON.stringify({ step: 'SIGNED_IN', ...tokens(1) }), { status: 200 });
      if (path === '/auth/sign-out') return new Response(null, { status: 204 });
      if (path === '/me' && init?.method !== 'PATCH') {
        meCalls++;
        if (meCalls === 2) await gate; // the reload after a profile save is slow
        return new Response(JSON.stringify(ME), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    };
    const session = new SessionManager('http://api', fetchFn, store);
    await session.signIn('teacher-a1', 'p');
    const slowReload = session.reloadMe();
    await session.signOut();
    release();
    await slowReload;
    expect(session.current.kind).toBe('signedOut');
    expect(store.refresh).toBeNull();
  });

  it('F01 unit: regression M1: a server error during refresh keeps the session instead of signing out', async () => {
    const { session, store } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'SIGNED_IN', ...tokens(1) } }),
      'GET /me': (_b, h) => (h.Authorization === 'Bearer access-1' ? { status: 200, json: ME } : expired),
      'GET /later': () => expired,
      'POST /auth/refresh': () => ({ status: 502, json: { error: { code: 'INTERNAL', message: '' } } }),
    });
    await session.signIn('teacher-a1', 'p');
    await expect(session.authorized('/later')).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(store.refresh).toBe('refresh-1');
    expect(session.current.kind).toBe('signedIn');
  });

  it('F01 unit: regression M2: starting offline keeps the session and offers retry, not "session ended"', async () => {
    let online = false;
    const store = new MemoryStore();
    store.refresh = 'refresh-1';
    store.lastLoginId = 'teacher-a1';
    const session = new SessionManager('http://api', async (url) => {
      if (!online) throw new TypeError('Network request failed');
      const path = url.replace('http://api', '');
      if (path === '/auth/refresh') return new Response(JSON.stringify(tokens(2)), { status: 200 });
      return new Response(JSON.stringify(ME), { status: 200 });
    }, store);
    await session.restore();
    expect(session.current).toEqual({ kind: 'offline', loginId: 'teacher-a1' });
    expect(store.refresh).toBe('refresh-1');
    online = true;
    await session.restore();
    expect(session.current).toEqual({ kind: 'signedIn', me: ME });
  });

  it('F01-AC30 (US-072) first Owner/Admin sign-in shows recovery codes before any madrasa data', async () => {
    const admin = { ...ME, role: 'ADMIN' as const, loginId: 'admin-a' };
    const { session, states } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'TWO_FACTOR_SETUP_REQUIRED', challengeToken: 'ch' } }),
      'POST /auth/two-factor/setup': (b) => ({ status: b.challengeToken === 'ch' ? 200 : 401, json: { secret: 'S', otpauthUri: 'otpauth://totp/x' } }),
      'POST /auth/two-factor/setup/confirm': () => ({
        status: 200,
        json: { step: 'SIGNED_IN', ...tokens(1), recoveryCodes: Array.from({ length: 10 }, (_, i) => `CODE${i}`) },
      }),
      'GET /me': () => ({ status: 200, json: admin }),
    });
    await session.signIn('admin-a', 'p');
    expect(session.current.kind).toBe('twoFactor');
    await session.startTwoFactorSetup();
    await session.confirmTwoFactorSetup('123456');
    expect(session.current.kind).toBe('recoveryCodes');
    expect(states.some((s) => s.kind === 'signedIn')).toBe(false);
    await session.acknowledgeRecoveryCodes();
    expect(session.current).toEqual({ kind: 'signedIn', me: admin });
  });

  it('F01-AC31 (US-072) later Owner/Admin sign-ins verify a code before signing in', async () => {
    const { session, calls } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'TWO_FACTOR_REQUIRED', challengeToken: 'ch' } }),
      'POST /auth/two-factor/verify': (b) => (b.recoveryCode === 'GOOD-CODE' ? { status: 200, json: { step: 'SIGNED_IN', ...tokens(1) } } : { status: 400, json: { error: { code: 'TWO_FACTOR_INVALID', message: '' } } }),
      'GET /me': () => ({ status: 200, json: { ...ME, role: 'OWNER' } }),
    });
    await session.signIn('owner-a', 'p');
    await expect(session.verifyTwoFactor({ recoveryCode: 'USED' })).rejects.toMatchObject({ code: 'TWO_FACTOR_INVALID' });
    expect(session.current.kind).toBe('twoFactor');
    await session.verifyTwoFactor({ recoveryCode: 'GOOD-CODE' });
    expect(session.current.kind).toBe('signedIn');
    expect(calls.filter((c) => c.route === 'POST /auth/two-factor/verify').every((c) => c.body.challengeToken === 'ch')).toBe(true);
  });
});

describe('F12 · access revoked', () => {
  const revoked = { status: 403, json: { error: { code: 'ACCESS_REVOKED', message: '' } } };

  it('F12-AC14 (US-052) a 403 ACCESS_REVOKED on any call moves the session to "revoked" and keeps the User ID', async () => {
    const { session } = setup({
      'POST /auth/sign-in': () => ({ status: 200, json: { step: 'SIGNED_IN', ...tokens(1) } }),
      'GET /me': () => ({ status: 200, json: ME }),
      'POST /sync/push': () => revoked,
    });
    await session.signIn('teacher-a1', 'p');
    await expect(session.authorized('/sync/push', { body: {} })).rejects.toMatchObject({ code: 'ACCESS_REVOKED', status: 403 });
    expect(session.current).toEqual({ kind: 'revoked', loginId: 'teacher-a1' });
  });

  it('F12-AC14 (US-052) at launch, a refresh answered with ACCESS_REVOKED shows the revoked state, not "offline"', async () => {
    const { session, store } = setup({ 'POST /auth/refresh': () => revoked });
    store.refresh = 'refresh-0';
    store.lastLoginId = 'teacher-a1';
    await session.restore();
    expect(session.current).toEqual({ kind: 'revoked', loginId: 'teacher-a1' });
    // Sign-out still works from here and forgets the token.
    await session.signOut();
    expect(session.current).toEqual({ kind: 'signedOut', lastLoginId: 'teacher-a1' });
    expect(store.refresh).toBeNull();
  });
});
