// Provides the session to screens. The refresh token is kept only in expo-secure-store (Android Keystore-backed);
// the access token is never written to storage.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SessionManager, type SessionState, type TokenStore } from './session.ts';

const REFRESH_KEY = 'hifz.refreshToken';
const LOGIN_ID_KEY = 'hifz.lastLoginId';

const secureStore: TokenStore = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefreshToken: (token) => (token ? SecureStore.setItemAsync(REFRESH_KEY, token) : SecureStore.deleteItemAsync(REFRESH_KEY)),
  getLastLoginId: () => SecureStore.getItemAsync(LOGIN_ID_KEY),
  setLastLoginId: (id) => (id ? SecureStore.setItemAsync(LOGIN_ID_KEY, id) : SecureStore.deleteItemAsync(LOGIN_ID_KEY)),
};

/** The API address: EXPO_PUBLIC_API_URL (inlined at build time), or the host machine as seen from the emulator. */
export function apiUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000').replace(/\/$/, '');
}

const manager = new SessionManager(apiUrl(), (input, init) => fetch(input, init), secureStore);
const SessionContext = createContext<{ session: SessionManager; state: SessionState }>({ session: manager, state: manager.current });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(manager.current);
  useEffect(() => {
    const unsubscribe = manager.subscribe(setState);
    void manager.restore();
    return unsubscribe;
  }, []);
  return <SessionContext.Provider value={{ session: manager, state }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
