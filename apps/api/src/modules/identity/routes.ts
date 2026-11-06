// Identity HTTP routes. Contract: packages/contracts/src/identity.ts; documented in apps/api/README.md.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AdminSetPasswordRequest,
  ChangePasswordRequest,
  CreateAccountRequest,
  ListAccountsQuery,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RefreshRequest,
  RegenerateRecoveryCodesRequest,
  SignInRequest,
  SignOutRequest,
  TwoFactorChallengeRequest,
  TwoFactorSetupConfirmRequest,
  TwoFactorVerifyRequest,
  UpdateProfileRequest,
} from '@hifz/contracts';
import { parse } from '../../platform/errors.ts';
import type { AccountsService } from './accounts-service.ts';
import type { Actor, AuthService } from './auth-service.ts';
import type { ProfileService } from './profile-service.ts';

export interface IdentityServices {
  auth: AuthService;
  accounts: AccountsService;
  profile: ProfileService;
}

function bearer(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

const idParam = (request: FastifyRequest) => (request.params as { id: string }).id;

export function registerIdentityRoutes(app: FastifyInstance, { auth, accounts, profile }: IdentityServices): void {
  const actorOf = (request: FastifyRequest): Promise<Actor> => auth.authenticate(bearer(request));

  // ---------- Sign-in and sessions (US-001, US-072) ----------

  app.post('/auth/sign-in', async (request) => {
    const input = parse(SignInRequest, request.body);
    return auth.signIn(input.loginId, input.password, input.deviceId ?? null);
  });

  app.post('/auth/two-factor/setup', async (request) => {
    const input = parse(TwoFactorChallengeRequest, request.body);
    return auth.startTwoFactorSetup(input.challengeToken);
  });

  app.post('/auth/two-factor/setup/confirm', async (request) => {
    const input = parse(TwoFactorSetupConfirmRequest, request.body);
    return auth.confirmTwoFactorSetup(input.challengeToken, input.code);
  });

  app.post('/auth/two-factor/verify', async (request) => {
    const input = parse(TwoFactorVerifyRequest, request.body);
    const proof = 'code' in input ? { code: input.code } : { recoveryCode: input.recoveryCode };
    return auth.verifyTwoFactor(input.challengeToken, proof);
  });

  app.post('/auth/refresh', async (request) => auth.refresh(parse(RefreshRequest, request.body).refreshToken));

  // Ends the session named by the access token, or by the refresh token once the access token has expired.
  app.post('/auth/sign-out', async (request, reply) => {
    const input = parse(SignOutRequest, request.body);
    if (!bearer(request) && input.refreshToken) {
      await auth.signOutByRefreshToken(input.refreshToken);
      return reply.status(204).send();
    }
    try {
      await auth.signOut(await actorOf(request));
    } catch (err) {
      if (!input.refreshToken) throw err;
      await auth.signOutByRefreshToken(input.refreshToken);
    }
    return reply.status(204).send();
  });

  // ---------- Password recovery (US-002, US-005) ----------

  app.post('/auth/password-reset/request', async (request, reply) => {
    await auth.requestPasswordReset(parse(PasswordResetRequest, request.body).loginId);
    // The same neutral answer whether or not the account exists or has an email (F01-AC8).
    return reply.status(202).send({ status: 'RESET_REQUESTED' });
  });

  app.post('/auth/password-reset/confirm', async (request, reply) => {
    const input = parse(PasswordResetConfirmRequest, request.body);
    await auth.confirmPasswordReset(input.loginId, input.otp, input.newPassword);
    return reply.status(204).send();
  });

  // ---------- My profile (US-071, US-072) ----------

  app.get('/me', async (request) => profile.me(await actorOf(request)));

  app.patch('/me', async (request) => {
    const actor = await actorOf(request);
    return profile.update(actor, parse(UpdateProfileRequest, request.body));
  });

  app.post('/me/password', async (request, reply) => {
    const actor = await actorOf(request);
    const input = parse(ChangePasswordRequest, request.body);
    await profile.changePassword(actor, input.currentPassword, input.newPassword);
    return reply.status(204).send();
  });

  app.post('/me/two-factor/recovery-codes', async (request) => {
    const actor = await actorOf(request);
    return profile.regenerateRecoveryCodes(actor, parse(RegenerateRecoveryCodesRequest, request.body).code);
  });

  // ---------- Accounts, by Owner/Admin (US-003, US-004, US-006) ----------

  app.get('/accounts', async (request) => {
    const actor = await actorOf(request);
    return accounts.list(actor, parse(ListAccountsQuery, request.query).page);
  });

  app.post('/accounts', async (request, reply) => {
    const actor = await actorOf(request);
    return reply.status(201).send(await accounts.create(actor, parse(CreateAccountRequest, request.body)));
  });

  app.get('/accounts/login-id-suggestion', async (request) => accounts.suggestLoginId(await actorOf(request)));

  app.get('/accounts/:id', async (request) => accounts.get(await actorOf(request), idParam(request)));

  app.post('/accounts/:id/deactivate', async (request) => accounts.deactivate(await actorOf(request), idParam(request)));

  app.post('/accounts/:id/password', async (request, reply) => {
    const actor = await actorOf(request);
    await accounts.setPassword(actor, idParam(request), parse(AdminSetPasswordRequest, request.body).newPassword);
    return reply.status(204).send();
  });

  app.post('/accounts/:id/two-factor/reset', async (request, reply) => {
    await accounts.resetTwoFactor(await actorOf(request), idParam(request));
    return reply.status(204).send();
  });
}
