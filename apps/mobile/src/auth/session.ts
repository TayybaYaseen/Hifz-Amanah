// Session manager (US-001, US-072; FR-AUTH-003). Plain TypeScript, tested with Vitest.
// - The refresh token lives only in secure storage (expo-secure-store, ARCHITECTURE.md §3.1); the access token
//   lives only in memory.
// - A 401 refreshes once; if the server has ended the session, the state becomes `expired` and the User ID is kept,
//   so the app shows the session-expired prompt without discarding anything stored on the device (F01-AC6).
// - Sign-out revokes the session on the server, even with an expired access token, then forgets the tokens
//   locally even when the server cannot be reached (F01-AC5).
// - Every sign-out or expiry starts a new "epoch". A response that arrives for an older epoch (a slow request
//   started before sign-out) can never change the state or write a token back (code review H1).
// - Refresh tokens rotate: if a rotation succeeds on the server but its response is lost, the next refresh replays
//   the old token and the server ends the session. That is the intended theft protection; the user signs in again.
import type {
  MeResponse,
  SessionTokens,
  SignInResponse,
  TwoFactorSetupConfirmResponse,
  TwoFactorSetupResponse,
} from '@hifz/contracts';
import { ApiFailure, request, type Fetch, type RequestOptions } from '../api/client.ts';

/** Where the refresh token and the last User ID are kept. Implemented with expo-secure-store in the app. */
export interface TokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
  getLastLoginId(): Promise<string | null>;
  setLastLoginId(loginId: string | null): Promise<void>;
}

export type SessionState =
  | { kind: 'starting' }
  | { kind: 'signedOut'; lastLoginId: string | null }
  | { kind: 'twoFactor'; step: 'TWO_FACTOR_REQUIRED' | 'TWO_FACTOR_SETUP_REQUIRED'; challengeToken: string; loginId: string }
  | { kind: 'recoveryCodes'; codes: string[]; tokens: SessionTokens; loginId: string }
  | { kind: 'signedIn'; me: MeResponse }
  /** The stored session could not be checked (no connection or a server error). It is kept; retry resumes it. */
  | { kind: 'offline'; loginId: string | null }
  | { kind: 'expired'; loginId: string | null };

type Listener = (state: SessionState) => void;

/** The server has refused the session itself, as opposed to being unreachable or failing. */
const isSessionRefusal = (err: unknown) => err instanceof ApiFailure && err.status === 401;

export class SessionManager {
  private state: SessionState = { kind: 'starting' };
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private epoch = 0;
  private readonly listeners = new Set<Listener>();
  private readonly baseUrl: string;
  private readonly fetchFn: Fetch;
  private readonly store: TokenStore;

  constructor(baseUrl: string, fetchFn: Fetch, store: TokenStore) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
    this.store = store;
  }

  get current(): SessionState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  /** Applies a state change only if no sign-out or expiry happened since `epoch` was read. */
  private setIfCurrent(epoch: number, state: SessionState): boolean {
    if (epoch !== this.epoch) return false;
    this.set(state);
    return true;
  }

  private call<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return request<T>(this.baseUrl, this.fetchFn, path, opts);
  }

  private async adopt(tokens: SessionTokens): Promise<void> {
    const epoch = this.epoch;
    this.accessToken = tokens.accessToken;
    await this.store.setRefreshToken(tokens.refreshToken);
    const me = await this.authorized<MeResponse>('/me');
    if (epoch !== this.epoch) return;
    await this.store.setLastLoginId(me.loginId);
    this.setIfCurrent(epoch, { kind: 'signedIn', me });
  }

  /** On app launch, and on Retry while offline: resume a stored session if the server still accepts it. */
  async restore(): Promise<void> {
    const epoch = this.epoch;
    const lastLoginId = await this.store.getLastLoginId();
    if (!(await this.store.getRefreshToken())) {
      this.setIfCurrent(epoch, { kind: 'signedOut', lastLoginId });
      return;
    }
    try {
      if (!(await this.refresh())) {
        this.setIfCurrent(epoch, { kind: 'expired', loginId: lastLoginId });
        return;
      }
      const me = await this.authorized<MeResponse>('/me');
      this.setIfCurrent(epoch, { kind: 'signedIn', me });
    } catch (err) {
      if (isSessionRefusal(err)) return; // authorized() already moved to `expired`.
      // No connection or a server error: keep the stored session and let the user retry (code review M2).
      this.setIfCurrent(epoch, { kind: 'offline', loginId: lastLoginId });
    }
  }

  async signIn(loginId: string, password: string): Promise<void> {
    const result = await this.call<SignInResponse>('/auth/sign-in', { body: { loginId, password } });
    if (result.step === 'SIGNED_IN') {
      await this.adopt(result);
      return;
    }
    this.set({ kind: 'twoFactor', step: result.step, challengeToken: result.challengeToken, loginId: loginId.trim() });
  }

  private challenge(): { challengeToken: string; loginId: string } {
    if (this.state.kind !== 'twoFactor') throw new ApiFailure('SESSION_EXPIRED', 401);
    return this.state;
  }

  startTwoFactorSetup(): Promise<TwoFactorSetupResponse> {
    return this.call<TwoFactorSetupResponse>('/auth/two-factor/setup', { body: { challengeToken: this.challenge().challengeToken } });
  }

  /** Confirms the authenticator; the recovery codes must be acknowledged before any data is shown (F01-AC30). */
  async confirmTwoFactorSetup(code: string): Promise<void> {
    const { challengeToken, loginId } = this.challenge();
    const result = await this.call<TwoFactorSetupConfirmResponse>('/auth/two-factor/setup/confirm', { body: { challengeToken, code } });
    const { recoveryCodes, step: _step, ...tokens } = result;
    this.set({ kind: 'recoveryCodes', codes: recoveryCodes, tokens, loginId });
  }

  async acknowledgeRecoveryCodes(): Promise<void> {
    if (this.state.kind !== 'recoveryCodes') return;
    await this.adopt(this.state.tokens);
  }

  async verifyTwoFactor(proof: { code: string } | { recoveryCode: string }): Promise<void> {
    const { challengeToken } = this.challenge();
    await this.adopt(await this.call<SessionTokens>('/auth/two-factor/verify', { body: { challengeToken, ...proof } }));
  }

  /** Back from the two-factor step to the sign-in screen. */
  async cancelTwoFactor(): Promise<void> {
    const loginId = this.state.kind === 'twoFactor' ? this.state.loginId : await this.store.getLastLoginId();
    this.set({ kind: 'signedOut', lastLoginId: loginId });
  }

  /**
   * Rotates the refresh token; parallel callers share one rotation, so a rotated token is never replayed.
   * Returns false only when the server refuses the session (401). No connection, a server error, or rate
   * limiting throws instead and keeps the stored token (code review M1).
   */
  private refresh(): Promise<boolean> {
    const epoch = this.epoch;
    this.refreshing ??= (async () => {
      const refreshToken = await this.store.getRefreshToken();
      if (!refreshToken) return false;
      try {
        const tokens = await this.call<SessionTokens>('/auth/refresh', { body: { refreshToken } });
        if (epoch !== this.epoch) return false;
        this.accessToken = tokens.accessToken;
        await this.store.setRefreshToken(tokens.refreshToken);
        return true;
      } catch (err) {
        if (!isSessionRefusal(err)) throw err;
        if (epoch === this.epoch) {
          this.accessToken = null;
          await this.store.setRefreshToken(null);
        }
        return false;
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Calls the API with the session; refreshes once on 401; ends in the session-expired state if that fails. */
  async authorized<T>(path: string, opts: Omit<RequestOptions, 'token'> = {}): Promise<T> {
    const epoch = this.epoch;
    if (!this.accessToken && !(await this.refresh())) return this.expire(epoch);
    try {
      return await this.call<T>(path, { ...opts, token: this.accessToken });
    } catch (err) {
      if (!isSessionRefusal(err)) throw err;
      if (!(await this.refresh())) return this.expire(epoch);
      try {
        return await this.call<T>(path, { ...opts, token: this.accessToken });
      } catch (retry) {
        if (isSessionRefusal(retry)) return this.expire(epoch);
        throw retry;
      }
    }
  }

  private async expire(epoch: number): Promise<never> {
    if (epoch === this.epoch) {
      this.epoch++;
      this.accessToken = null;
      const loginId = this.state.kind === 'signedIn' ? this.state.me.loginId : await this.store.getLastLoginId();
      this.set({ kind: 'expired', loginId });
    }
    throw new ApiFailure('SESSION_EXPIRED', 401);
  }

  /** Always answers the same way, whether or not the User ID exists or has an email (F01-AC8). */
  async requestPasswordReset(loginId: string): Promise<void> {
    await this.call('/auth/password-reset/request', { body: { loginId: loginId.trim() } });
  }

  async confirmPasswordReset(loginId: string, otp: string, newPassword: string): Promise<void> {
    await this.call('/auth/password-reset/confirm', { body: { loginId: loginId.trim(), otp: otp.trim(), newPassword } });
    await this.store.setLastLoginId(loginId.trim());
    this.set({ kind: 'signedOut', lastLoginId: loginId.trim() });
  }

  /** Re-reads My profile after a change. Ignored if the user signed out meanwhile. */
  async reloadMe(): Promise<MeResponse> {
    const epoch = this.epoch;
    const me = await this.authorized<MeResponse>('/me');
    this.setIfCurrent(epoch, { kind: 'signedIn', me });
    return me;
  }

  /** Ends this device's session. Local tokens are forgotten even if the server cannot be reached. */
  async signOut(): Promise<void> {
    // Let a rotation in flight finish first, so the token revoked below is the current one.
    if (this.refreshing) await this.refreshing.catch(() => false);
    // From here on, late responses from requests started before sign-out are ignored.
    this.epoch++;
    const refreshToken = await this.store.getRefreshToken();
    const loginId = this.state.kind === 'signedIn' ? this.state.me.loginId : await this.store.getLastLoginId();
    const accessToken = this.accessToken;
    this.accessToken = null;
    try {
      await this.call('/auth/sign-out', { body: refreshToken ? { refreshToken } : {}, token: accessToken });
    } catch {
      // Offline: the server session lives on until it expires, but no copy of its token remains anywhere.
    }
    await this.store.setRefreshToken(null);
    this.set({ kind: 'signedOut', lastLoginId: loginId });
  }
}
