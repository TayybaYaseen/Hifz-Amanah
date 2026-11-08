// Identity contracts shared by the API and the app (F01; FR-AUTH-001…016).
// Stored values are canonical and language-neutral; the app localizes labels and messages by code.
import { z } from 'zod';
import { COMMON_PASSWORDS } from './common-passwords.ts';

export const ROLES = ['OWNER', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

/** Roles an Owner or Admin may create through the create-account endpoint (FR-AUTH-009). */
export const CREATABLE_ROLES = ['TEACHER', 'STUDENT', 'PARENT'] as const;
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

/** Roles that must use two-factor sign-in (FR-AUTH-016). */
export const TWO_FACTOR_ROLES: readonly Role[] = ['OWNER', 'ADMIN'];

export const LOCALES = ['en', 'ur', 'ur-Latn'] as const;
export type Locale = (typeof LOCALES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'DEACTIVATED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

// ---------- User ID (FR-AUTH-013, DEC-B09) ----------

export const LOGIN_ID_PATTERN = /^[A-Za-z0-9-]{3,32}$/;

/** Trims surrounding whitespace (F01 edge case). Case is kept for display; comparison uses {@link loginIdKey}. */
export function normalizeLoginId(raw: string): string {
  return raw.trim();
}

/** Case-insensitive comparison key for a User ID. */
export function loginIdKey(raw: string): string {
  return normalizeLoginId(raw).toLowerCase();
}

export function isValidLoginId(raw: string): boolean {
  return LOGIN_ID_PATTERN.test(normalizeLoginId(raw));
}

// ---------- Password policy (FR-AUTH-012, DEC-B08) ----------

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

export type PasswordIssue = 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_COMMON' | 'PASSWORD_EQUALS_USER_ID';

/** Returns the first policy violation, or null when the password is acceptable. No composition rules. */
export function checkPassword(password: string, loginId: string | null): PasswordIssue | null {
  // Length counts Unicode code points, so Urdu or emoji characters count as one each.
  const length = [...password].length;
  if (length < PASSWORD_MIN) return 'PASSWORD_TOO_SHORT';
  if (length > PASSWORD_MAX) return 'PASSWORD_TOO_LONG';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'PASSWORD_TOO_COMMON';
  if (loginId && password.trim().toLowerCase() === loginIdKey(loginId)) return 'PASSWORD_EQUALS_USER_ID';
  return null;
}

// ---------- Error codes ----------

export const ERROR_CODES = [
  'VALIDATION',
  'INVALID_CREDENTIALS',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'LOGIN_ID_TAKEN',
  'LAST_ADMIN',
  'OTP_INVALID',
  'CURRENT_PASSWORD_INCORRECT',
  'TWO_FACTOR_INVALID',
  'REAUTH_REQUIRED',
  'RATE_LIMITED',
  'INTERNAL',
  // Sync (F12; plan docs/handover/F12-plan.md §5).
  /** 403: the membership was revoked or the account deactivated; the app locks the workspace. */
  'ACCESS_REVOKED',
  /** 426: the app's sync protocol version is below the server's minimum. */
  'UPGRADE_REQUIRED',
  'DEPENDENCY_PENDING',
  'OP_ID_REUSED',
  'ID_TAKEN',
  'ENTITY_NOT_SUPPORTED',
  /** 409: the server row changed since the conflict was opened. */
  'CONFLICT_STALE',
  /** 409: the conflict was already resolved. */
  'CONFLICT_CLOSED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    /** Field name → issue code, for VALIDATION errors. */
    fields?: Record<string, string>;
  };
}

/** The one message for every sign-in refusal (F01-AC2, AC3, AC4, AC25). */
export const INVALID_CREDENTIALS_MESSAGE = 'User ID or password is incorrect';

// ---------- Requests ----------

const password = z.string().max(256);
const loginIdInput = z.string().max(128);
const email = z.email().max(254);

export const SignInRequest = z.strictObject({
  loginId: loginIdInput,
  password,
  deviceId: z.string().max(128).optional(),
});
export type SignInRequest = z.infer<typeof SignInRequest>;

export const RefreshRequest = z.strictObject({ refreshToken: z.string().min(1).max(512) });

/** The refresh token lets the app sign out even after its access token has expired. */
export const SignOutRequest = z.strictObject({ refreshToken: z.string().min(1).max(512).optional() });

export const TwoFactorChallengeRequest = z.strictObject({ challengeToken: z.string().min(1).max(2048) });

export const TwoFactorSetupConfirmRequest = z.strictObject({
  challengeToken: z.string().min(1).max(2048),
  code: z.string().regex(/^\d{6}$/),
});

export const TwoFactorVerifyRequest = z.union([
  z.strictObject({ challengeToken: z.string().min(1).max(2048), code: z.string().regex(/^\d{6}$/) }),
  z.strictObject({ challengeToken: z.string().min(1).max(2048), recoveryCode: z.string().min(1).max(32) }),
]);

export const PasswordResetRequest = z.strictObject({ loginId: loginIdInput });

export const PasswordResetConfirmRequest = z.strictObject({
  loginId: loginIdInput,
  otp: z.string().max(16),
  newPassword: password,
});

export const CreateAccountRequest = z.strictObject({
  loginId: loginIdInput,
  displayName: z.string().trim().min(1).max(100),
  email: email.nullable().optional(),
  role: z.enum(CREATABLE_ROLES),
  password,
});
export type CreateAccountRequest = z.infer<typeof CreateAccountRequest>;

export const AdminSetPasswordRequest = z.strictObject({ newPassword: password });

/**
 * My profile: only display name, optional email, and language may change (FR-AUTH-006, F01-AC29).
 * Changing the email also needs `currentPassword` (DEC-B69); the server checks it.
 */
export const UpdateProfileRequest = z.strictObject({
  displayName: z.string().trim().min(1).max(100).optional(),
  email: email.nullable().optional(),
  preferredLocale: z.enum(LOCALES).optional(),
  currentPassword: password.optional(),
});

export const ChangePasswordRequest = z.strictObject({ currentPassword: password, newPassword: password });

export const RegenerateRecoveryCodesRequest = z.strictObject({ code: z.string().regex(/^\d{6}$/) });

export const ListAccountsQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// ---------- Responses ----------

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

export type SignInResponse =
  | ({ step: 'SIGNED_IN' } & SessionTokens)
  | { step: 'TWO_FACTOR_REQUIRED'; challengeToken: string }
  | { step: 'TWO_FACTOR_SETUP_REQUIRED'; challengeToken: string };

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUri: string;
}

export interface TwoFactorSetupConfirmResponse extends SessionTokens {
  step: 'SIGNED_IN';
  recoveryCodes: string[];
}

export interface MeResponse {
  id: string;
  loginId: string;
  displayName: string;
  email: string | null;
  role: Role;
  organization: { id: string; name: string };
  preferredLocale: Locale;
  twoFactorEnabled: boolean;
}

export interface AccountResponse {
  id: string;
  loginId: string;
  displayName: string;
  email: string | null;
  role: Role;
  status: AccountStatus;
  /** Set while the account is locked after repeated failed sign-ins (FR-AUTH-014). */
  lockedUntil: string | null;
  twoFactorEnabled: boolean;
  /** A Teacher's "all classes" flag (FR-SEC-003); always false for other roles. */
  allClasses: boolean;
  createdAt: string;
}

export interface AccountListResponse {
  items: AccountResponse[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LoginIdSuggestionResponse {
  prefix: string;
}

export interface RecoveryCodesResponse {
  recoveryCodes: string[];
}
