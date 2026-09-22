'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getIdToken as firebaseGetIdToken,
  getRedirectResult,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config';

/**
 * Auth service — port of motvin-ui/JS/firebase-auth.js.
 *
 * Two things beyond plain Firebase auth, both carried over deliberately:
 *
 * 1. A synchronous snapshot of the last signed-in user in localStorage.
 *    Firebase restores its own session from IndexedDB asynchronously, so a
 *    freshly-navigated page looks logged out for a beat. The snapshot lets the
 *    first paint show the right state; onAuthStateChanged corrects it moments
 *    later and remains the source of truth.
 *
 * 2. Cross-tab sync over BroadcastChannel, with a localStorage `storage` event
 *    as the fallback. Signing out in one tab signs out the rest.
 *
 * Changed from the original: the redirects. The old service navigated straight
 * to /login or /files from inside the auth callback, with a hardcoded list of
 * protected paths. Route protection belongs to the router, not the auth
 * service, so this module only reports state — nothing here calls
 * window.location. Guarding routes is left for whoever adds them.
 *
 * Dropped: the compat-SDK credential mirroring (`window.firebase.auth()`).
 * Nothing in this app loads the compat SDK; it existed for older pages.
 */

const SYNC_CHANNEL = 'motvin-auth-sync-v1';
const SYNC_STORAGE_KEY = '__motvin_auth_sync_v1__';
const SNAPSHOT_STORAGE_KEY = 'motvin-auth-snapshot-v1';

/** Distinguishes this tab's own sync messages from other tabs'. */
const instanceId = `root-${Math.random().toString(36).slice(2)}-${Date.now()}`;

/** The subset of a Firebase user the UI needs, safe to cache. */
export type AuthUser = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  isAnonymous: boolean;
};

type Listener = (user: AuthUser | null) => void;

let auth: Auth | null = null;
let provider: GoogleAuthProvider | null = null;
let readyPromise: Promise<Auth | null> | null = null;
let currentUser: AuthUser | null = null;
let applyingExternalSignOut = false;
let channel: BroadcastChannel | null = null;
let syncListenersStarted = false;

const listeners = new Set<Listener>();

/** Resolves once Firebase has restored (or failed to restore) its session. */
let resolveInitialized: ((user: User | null) => void) | null = null;
const initializedPromise = new Promise<User | null>((resolve) => {
  resolveInitialized = resolve;
});

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const providerPhotoURL = user.providerData.find((provider) => provider.photoURL)?.photoURL ?? '';
  return {
    uid: user.uid || '',
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || providerPhotoURL,
    isAnonymous: Boolean(user.isAnonymous),
  };
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function persistSnapshot(user: AuthUser | null) {
  try {
    if (user && !user.isAnonymous) {
      window.localStorage.setItem(
        SNAPSHOT_STORAGE_KEY,
        JSON.stringify({ ...user, at: Date.now() }),
      );
    } else if (!user) {
      window.localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable; the snapshot is an optimisation, not a requirement.
  }
}

/** Last known signed-in user on this origin, for instant first paint. */
export function readSnapshot(): AuthUser | null {
  try {
    const parsed = safeJsonParse<AuthUser>(
      window.localStorage.getItem(SNAPSHOT_STORAGE_KEY),
    );
    return parsed && !parsed.isAnonymous && parsed.uid ? parsed : null;
  } catch {
    return null;
  }
}

function emit(user: User | AuthUser | null) {
  currentUser =
    user && 'providerData' in (user as User)
      ? toAuthUser(user as User)
      : ((user as AuthUser | null) ?? null);
  persistSnapshot(currentUser);
  for (const listener of listeners) {
    try {
      listener(currentUser);
    } catch {
      // A broken subscriber must not stop the others from updating.
    }
  }
}

type SyncPayload = { source: string; type: string; uid: string; at: number };

function publishSyncEvent(type: string, user: AuthUser | null) {
  const payload: SyncPayload = {
    source: instanceId,
    type,
    uid: user?.uid ?? '',
    at: Date.now(),
  };
  try {
    channel?.postMessage(payload);
  } catch {
    // Channel closed; the storage write below still reaches other tabs.
  }
  try {
    window.localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable — cross-tab sync degrades, nothing else breaks.
  }
}

async function applyExternalSync(payload: SyncPayload | null) {
  if (!payload || payload.source === instanceId) return;
  const instance = await ensureReady();
  if (!instance) return;

  if (payload.type === 'sign-out') {
    if (instance.currentUser && !applyingExternalSignOut) {
      applyingExternalSignOut = true;
      try {
        await signOut(instance);
      } catch {
        // Already signed out, or the network failed; emit regardless.
      } finally {
        applyingExternalSignOut = false;
      }
    }
    emit(null);
    return;
  }

  const active =
    instance.currentUser && !instance.currentUser.isAnonymous
      ? toAuthUser(instance.currentUser)
      : readSnapshot();
  if (active) emit(active);
}

function initSyncListeners() {
  if (typeof window === 'undefined' || syncListenersStarted) return;
  syncListenersStarted = true;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL);
      channel.addEventListener('message', (event) => {
        void applyExternalSync((event?.data as SyncPayload) ?? null);
      });
    } catch {
      channel = null;
    }
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== SYNC_STORAGE_KEY || !event.newValue) return;
    void applyExternalSync(safeJsonParse<SyncPayload>(event.newValue));
  });
}

/**
 * IndexedDB survives the most; session storage is the last resort before
 * in-memory. Each fallback matters on browsers or modes that block the one
 * above it.
 */
async function configureBestPersistence(instance: Auth) {
  for (const persistence of [
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
  ]) {
    try {
      await setPersistence(instance, persistence);
      return;
    } catch {
      // Try the next backend.
    }
  }
}

export function ensureReady(): Promise<Auth | null> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    if (typeof window === 'undefined' || !isFirebaseConfigured) return null;

    initSyncListeners();

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();

    await configureBestPersistence(auth);

    // Completes a signInWithRedirect started before this page load.
    getRedirectResult(auth).catch(() => null);

    onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        emit(user);
        publishSyncEvent('auth-state-changed', toAuthUser(user));
      } else {
        emit(null);
        publishSyncEvent('auth-state-changed', null);
      }
      resolveInitialized?.(user ?? null);
      resolveInitialized = null;
    });

    return auth;
  })().catch(() => null);

  return readyPromise;
}

function shouldFallbackToRedirect(code: string) {
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  );
}

/** Turns a Firebase error code into something worth showing a person. */
export function buildAuthErrorMessage(error: unknown): string {
  const code = String((error as { code?: string })?.code ?? '');

  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'Authentication cannot run from file:// URLs. Open this site via localhost or Firebase Hosting.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized in Firebase Authentication. Add it under Firebase Console > Authentication > Settings > Authorized domains.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in method is disabled in Firebase. Enable it in Firebase Console > Authentication > Sign-in method.';
  }
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-credential'
  ) {
    return 'Invalid email or password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters.';
  }
  if (code) return `Authentication failed (${code}).`;
  return 'Authentication failed. Please try again.';
}

export async function loginWithGoogle(
  options: { method?: 'popup' | 'redirect' } = {},
): Promise<AuthUser | null> {
  const method = options.method === 'redirect' ? 'redirect' : 'popup';
  const instance = await ensureReady();
  if (!instance || !provider) return null;

  await configureBestPersistence(instance);
  provider.setCustomParameters({ prompt: 'select_account' });

  // A guest session would otherwise be linked to, not replaced by, the sign-in.
  if (instance.currentUser?.isAnonymous) {
    try {
      await signOut(instance);
    } catch {
      // Proceed with sign-in regardless.
    }
  }

  try {
    if (method === 'redirect') {
      await signInWithRedirect(instance, provider);
      return null;
    }
    const result = await signInWithPopup(instance, provider);
    const user = result?.user ?? instance.currentUser ?? null;
    emit(user);
    return toAuthUser(user);
  } catch (error) {
    const code = String((error as { code?: string })?.code ?? '');
    // Popup blockers and accidental dismissals are common enough that the
    // original silently retried as a full-page redirect.
    if (method === 'popup' && shouldFallbackToRedirect(code)) {
      await signInWithRedirect(instance, provider);
      return null;
    }
    throw new Error(buildAuthErrorMessage(error));
  }
}

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const instance = await ensureReady();
  if (!instance) return null;
  await configureBestPersistence(instance);

  try {
    const result = await signInWithEmailAndPassword(instance, email, password);
    const user = result?.user ?? instance.currentUser ?? null;
    emit(user);
    return toAuthUser(user);
  } catch (error) {
    throw new Error(buildAuthErrorMessage(error));
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const instance = await ensureReady();
  if (!instance) return null;
  await configureBestPersistence(instance);

  try {
    const result = await createUserWithEmailAndPassword(instance, email, password);
    // Referenced so the import is used the way the original did — the compat
    // credential mirroring it fed is gone, but the provider stays available
    // for anything that needs to re-authenticate.
    void EmailAuthProvider;
    const user = result?.user ?? instance.currentUser ?? null;
    emit(user);
    return toAuthUser(user);
  } catch (error) {
    throw new Error(buildAuthErrorMessage(error));
  }
}

/**
 * Opt-in anonymous session, for features needing a stable per-visitor identity
 * before any real sign-in. Deliberately not called from ensureReady(): "is
 * someone signed in?" must keep meaning "a real account".
 */
export async function ensureGuestSession(): Promise<AuthUser | null> {
  const instance = await ensureReady();
  if (!instance) return null;

  // Without this, persistence may not have restored yet and we would mint a
  // brand-new guest on every page load.
  await initializedPromise;

  if (instance.currentUser) return toAuthUser(instance.currentUser);
  try {
    const result = await signInAnonymously(instance);
    return toAuthUser(result?.user ?? instance.currentUser ?? null);
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  const instance = await ensureReady();
  if (instance) await signOut(instance);
  emit(null);
  publishSyncEvent('sign-out', null);
}

export async function resetPassword(email: string): Promise<void> {
  const instance = await ensureReady();
  if (!instance) return;
  try {
    await sendPasswordResetEmail(instance, email);
  } catch (error) {
    throw new Error(buildAuthErrorMessage(error));
  }
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const instance = await ensureReady();
  const user = instance?.currentUser;
  if (!user) return null;
  try {
    return await firebaseGetIdToken(user, forceRefresh);
  } catch {
    return null;
  }
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

/** Current user if known, else the cross-page snapshot. For optimistic UI. */
export function getCachedUser(): AuthUser | null {
  if (currentUser && !currentUser.isAnonymous) return currentUser;
  return readSnapshot();
}

/**
 * Identity-stable view of getCachedUser(), for useSyncExternalStore.
 *
 * That hook compares snapshots by reference, so returning a freshly-parsed
 * object from localStorage on every call would loop forever. This caches the
 * last value and only swaps the reference when the user actually changes.
 */
let snapshotCache: AuthUser | null = null;
let snapshotKey = '';

export function getAuthSnapshot(): AuthUser | null {
  const user = getCachedUser();
  const key = user ? `${user.uid}|${user.displayName}|${user.email}|${user.photoURL}` : '';
  if (key !== snapshotKey) {
    snapshotKey = key;
    snapshotCache = user;
  }
  return snapshotCache;
}

/** Server render has no user; the client corrects it during hydration. */
export function getServerAuthSnapshot(): AuthUser | null {
  return null;
}

/**
 * Subscribe to auth changes. Fires immediately with a best guess so callers can
 * paint the right state on first render; the authoritative value follows.
 */
export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentUser ?? readSnapshot());
  return () => {
    listeners.delete(listener);
  };
}
