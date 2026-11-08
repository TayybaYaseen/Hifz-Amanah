// App lock for screens (F12-AC18, NFR-OFF-011; plan Q12). Holds the lock state of the signed-in staff account:
// locked on a cold start with a stored session and after 5 minutes in the background; a fresh sign-in with the
// password does not lock. After 5 wrong PINs or "Forgot PIN", an online sign-in with User ID + password (and
// two-factor for Owner/Admin) clears the old PIN, then a new one is set.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import type { Role } from '@hifz/contracts';
import { useSession } from '../auth/SessionContext.tsx';
import type { SessionState } from '../auth/session.ts';
import { pinCrypto, secureKeyValue } from '../sync/platform.ts';
import { AppLockManager, lockGate, lockOfferedTo, shouldLockAfterBackground, type LockGate, type LockStatus, type VerifyResult } from './lock.ts';

export type AppLockGate = LockGate | 'LOADING' | 'ERROR' | 'SETUP_RESET';

export interface AppLockValue {
  gate: AppLockGate;
  status: LockStatus | null;
  role: Role | null;
  /** Fingerprint hardware present with a fingerprint enrolled (UI spec flag F9: fingerprint only). */
  fingerprintAvailable: boolean;
  unlockWithPin(pin: string): Promise<VerifyResult>;
  unlockWithFingerprint(prompt: { promptMessage: string; cancelLabel: string }): Promise<boolean>;
  setPin(pin: string): Promise<void>;
  setBiometric(enabled: boolean): Promise<void>;
  skipSetup(): Promise<void>;
  forgotPin(): Promise<void>;
  /** Called by the locked-out sign-in form just before it signs in. */
  expectReauth(): void;
  /** Checks the current PIN (a wrong one counts toward the lockout like any other), then turns the lock off (Teacher). */
  disable(currentPin: string): Promise<VerifyResult>;
  /** Checks the current PIN without unlocking (settings). A wrong PIN counts toward the 5-try lockout. */
  checkPin(pin: string): Promise<VerifyResult>;
  retry(): void;
}

const AppLockContext = createContext<AppLockValue | null>(null);

function staffOf(state: SessionState): { userId: string; role: Role } | null {
  if (state.kind !== 'signedIn' || !lockOfferedTo(state.me.role)) return null;
  return { userId: state.me.id, role: state.me.role };
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { session, state } = useSession();
  const user = staffOf(state);
  const userId = user?.userId ?? null;
  const manager = useMemo(() => (userId ? new AppLockManager(secureKeyValue, pinCrypto, userId) : null), [userId]);
  const [status, setStatus] = useState<LockStatus | null>(null);
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reset, setReset] = useState(false);
  const [fingerprintAvailable, setFingerprintAvailable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const backgroundedAt = useRef<number | null>(null);
  const awaitingReauth = useRef(false);
  // How the current signed-in state was reached: from a stored session (lock) or a fresh sign-in (no lock).
  const restoredSession = useRef(false);
  const previousKind = useRef<SessionState['kind']>(session.current.kind);

  useEffect(
    () =>
      session.subscribe((next) => {
        const prev = previousKind.current;
        previousKind.current = next.kind;
        if (next.kind !== 'signedIn') return;
        if (prev === 'starting' || prev === 'offline') restoredSession.current = true;
        else if (prev !== 'signedIn') restoredSession.current = false;
        if (awaitingReauth.current) {
          // The locked-out user signed in again with the password: the effects below clear the old PIN.
          setReset(true);
          setLocked(false);
          restoredSession.current = false;
        }
      }),
    [session],
  );
  // The provider may mount after the first transition (restore runs on SessionProvider mount).
  if (state.kind === 'signedIn' && previousKind.current === 'starting') {
    previousKind.current = 'signedIn';
    restoredSession.current = true;
  }

  const refresh = useCallback(async () => {
    if (!manager) return;
    try {
      setStatus(await manager.status());
      setError(false);
    } catch {
      // Secure storage unavailable: never fail open.
      setError(true);
    }
  }, [manager]);

  useEffect(() => {
    setStatus(null);
    if (!awaitingReauth.current) setReset(false);
    if (!manager) return;
    let cancelled = false;
    void (async () => {
      try {
        if (awaitingReauth.current) {
          awaitingReauth.current = false;
          await manager.clearAfterReauth();
        }
        const s = await manager.status();
        if (cancelled) return;
        setStatus(s);
        setError(false);
        setLocked(s.configured && restoredSession.current);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manager, reloadKey]);

  // After a re-authentication the old PIN is forgotten before a new one is set.
  useEffect(() => {
    if (!reset || !manager || !awaitingReauth.current) return;
    awaitingReauth.current = false;
    void manager.clearAfterReauth().then(refresh);
  }, [reset, manager, refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const [hardware, enrolled, types, level] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          LocalAuthentication.getEnrolledLevelAsync(),
        ]);
        // Offered only with a Class 3 (strong) biometric enrolled, matching the strong-only prompt below (security L4).
        setFingerprintAvailable(
          hardware && enrolled && types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) && level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG,
        );
      } catch {
        setFingerprintAvailable(false);
      }
    })();
  }, [userId]);

  // F12-AC18: lock after 5 minutes in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgroundedAt.current = Date.now();
      else if (next === 'active') {
        if (shouldLockAfterBackground(backgroundedAt.current, Date.now()) && status?.configured) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [status?.configured]);

  const gate: AppLockGate = !user
    ? 'OPEN'
    : error
      ? 'ERROR'
      : !status
        ? 'LOADING'
        : reset && !status.configured
          ? 'SETUP_RESET'
          : lockGate(user.role, status, locked);

  const value: AppLockValue = {
    gate,
    status,
    role: user?.role ?? null,
    fingerprintAvailable,
    unlockWithPin: async (pin) => {
      if (!manager) return { ok: false, remaining: 0, lockedOut: false };
      const result = await manager.verifyPin(pin);
      if (result.ok) setLocked(false);
      await refresh();
      return result;
    },
    unlockWithFingerprint: async ({ promptMessage, cancelLabel }) => {
      if (!manager || !status?.biometric) return false;
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage,
          cancelLabel,
          disableDeviceFallback: true,
          // Android: only Class 3 biometrics unlock (security review L4); weak face unlock is refused.
          biometricsSecurityLevel: 'strong',
        });
        if (!result.success) return false;
        await manager.biometricUnlocked();
        setLocked(false);
        await refresh();
        return true;
      } catch {
        return false;
      }
    },
    setPin: async (pin) => {
      if (!manager) return;
      await manager.setPin(pin);
      setReset(false);
      setLocked(false);
      await refresh();
    },
    setBiometric: async (enabled) => {
      await manager?.setBiometric(enabled);
      await refresh();
    },
    skipSetup: async () => {
      await manager?.markOffered();
      setReset(false);
      await refresh();
    },
    forgotPin: async () => {
      await manager?.forgotPin();
      await refresh();
    },
    expectReauth: () => {
      awaitingReauth.current = true;
    },
    checkPin: async (pin) => {
      if (!manager) return { ok: false, remaining: 0, lockedOut: false };
      const result = await manager.verifyPin(pin);
      await refresh();
      return result;
    },
    disable: async (currentPin) => {
      if (!manager || !user || user.role !== 'TEACHER') return { ok: false, remaining: 0, lockedOut: false };
      const result = await manager.verifyPin(currentPin);
      if (result.ok) await manager.disable();
      await refresh();
      return result;
    },
    retry: () => setReloadKey((k) => k + 1),
  };

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockValue {
  const value = useContext(AppLockContext);
  if (!value) throw new Error('useAppLock must be used inside AppLockProvider');
  return value;
}
