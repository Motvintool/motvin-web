'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ensureReady,
  getAuthSnapshot,
  getServerAuthSnapshot,
  loginWithEmail,
  loginWithGoogle,
  logout as authLogout,
  onAuthChange,
  registerWithEmail,
  resetPassword,
  type AuthUser,
} from '@/lib/firebase/auth';

/**
 * React binding for the auth service in lib/firebase/auth.ts.
 *
 * `user` comes from useSyncExternalStore over the auth service: the server
 * snapshot is null, and the client snapshot is the cached last-known user. That
 * is what makes a returning visitor's avatar appear immediately instead of
 * waiting for Firebase to restore its session from IndexedDB — and it does so
 * without a post-mount setState, which would render every page twice.
 *
 * `ready` distinguishes "definitely signed out" from "we don't know yet" —
 * without it, every page would flash a signed-out state on load.
 */

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  signInWithGoogle: () => Promise<AuthUser | null>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(
    onAuthChange,
    getAuthSnapshot,
    getServerAuthSnapshot,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Resolves once Firebase has restored (or failed to restore) its session,
    // which is what separates "definitely signed out" from "not known yet".
    let cancelled = false;
    void ensureReady().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGoogle = useCallback(async () => loginWithGoogle(), []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await loginWithEmail(email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await registerWithEmail(email, password);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await resetPassword(email);
  }, []);

  const signOut = useCallback(async () => {
    await authLogout();
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      signOut,
    }),
    [
      user,
      ready,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
