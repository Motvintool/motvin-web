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
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
  type UserCredential,
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

    // Completes a signInWithRedirect / linkWithRedirect started before this
    // page load. A guest who picked an account that already exists comes back
    // with credential-already-in-use; their requests move across to it.
    const redirectAuth = auth;
    getRedirectResult(redirectAuth)
      .then((result) => (result?.operationType === 'link' ? afterGuestLinked(result.user) : undefined))
      .catch((error) => {
        const guest = redirectAuth.currentUser;
        const credential = GoogleAuthProvider.credentialFromError(error);
        if (guest?.isAnonymous && credential && isAccountTaken(error)) {
          return moveGuestInto(guest, () => signInWithCredential(redirectAuth, credential));
        }
        return null;
      })
      .catch(() => null);

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

// ---------------------------------------------------------------------------
// A guest (anonymous session) who signs in keeps what they did as a guest —
// today, their app requests. Signing in to a new account links the guest to it
// (same uid, nothing to move). Signing in to an account that already exists
// moves the requests across (appRequests.ts); the request code is loaded only
// when that happens.
// ---------------------------------------------------------------------------

/** Firebase's "that sign-in already belongs to another account" errors. */
function isAccountTaken(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '');
  return code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use';
}

/** Linking doesn't fire onAuthStateChanged (the uid is unchanged), so announce the new account here. */
async function afterGuestLinked(user: User): Promise<void> {
  emit(user);
  publishSyncEvent('auth-state-changed', toAuthUser(user));
  if (!user.email) return;
  try {
    // A fresh token, so the rules see the account's email on the update.
    await firebaseGetIdToken(user, true);
    const { stampRequestsWithEmail, saveHandoffNotice } = await import('./appRequests');
    const kept = await stampRequestsWithEmail(user.uid, user.email);
    saveHandoffNotice(kept, 0);
  } catch (error) {
    console.error('Could not attach the account email to guest requests', error);
  }
}

/** Signs in to an existing account, taking the guest's requests along; puts them back if the sign-in fails. */
async function moveGuestInto(guest: User, signIn: () => Promise<UserCredential>): Promise<User> {
  const requests = await import('./appRequests');
  const taken = await requests.takeGuestRequests(guest.uid).catch((error) => {
    console.error('Could not lift guest requests before sign-in', error);
    return [];
  });
  let result: UserCredential;
  try {
    result = await signIn();
  } catch (error) {
    if (taken.length) await requests.placeRequests(taken).catch(() => null);
    throw error;
  }
  const placed = await requests.placeRequests(taken).catch((error) => {
    console.error('Could not move guest requests to the account', error);
    return null;
  });
  // Ones the account had already asked for count as kept: the account has them.
  if (placed) requests.saveHandoffNotice(placed.placed + placed.alreadyAsked, placed.overLimit);
  emit(result.user);
  return result.user;
}

export async function loginWithGoogle(
  options: { method?: 'popup' | 'redirect' } = {},
): Promise<AuthUser | null> {
  const method = options.method === 'redirect' ? 'redirect' : 'popup';
  const instance = await ensureReady();
  if (!instance || !provider) return null;

  await configureBestPersistence(instance);
  provider.setCustomParameters({ prompt: 'select_account' });

  // A guest is linked to the account rather than replaced by it, so what they
  // did as a guest (their app requests) stays theirs.
  const guest = instance.currentUser?.isAnonymous ? instance.currentUser : null;
  const googleProvider = provider;

  try {
    if (method === 'redirect') {
      if (guest) await linkWithRedirect(guest, googleProvider);
      else await signInWithRedirect(instance, googleProvider);
      return null;
    }
    if (guest) {
      const linked = await linkWithPopup(guest, googleProvider);
      await afterGuestLinked(linked.user);
      return toAuthUser(linked.user);
    }
    const result = await signInWithPopup(instance, googleProvider);
    const user = result?.user ?? instance.currentUser ?? null;
    emit(user);
    return toAuthUser(user);
  } catch (error) {
    // The Google account already has a Motvin account: sign in to that one
    // and bring the guest's requests along.
    const credential = GoogleAuthProvider.credentialFromError(error as never);
    if (guest && credential && isAccountTaken(error)) {
      try {
        return toAuthUser(await moveGuestInto(guest, () => signInWithCredential(instance, credential)));
      } catch (moveError) {
        throw new Error(buildAuthErrorMessage(moveError));
      }
    }
    const code = String((error as { code?: string })?.code ?? '');
    // Popup blockers and accidental dismissals are common enough that the
    // original silently retried as a full-page redirect.
    if (method === 'popup' && shouldFallbackToRedirect(code)) {
      if (guest) await linkWithRedirect(guest, googleProvider);
      else await signInWithRedirect(instance, googleProvider);
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
    // An existing account: a guest's requests come along with them.
    const guest = instance.currentUser?.isAnonymous ? instance.currentUser : null;
    if (guest) {
      return toAuthUser(await moveGuestInto(guest, () => signInWithEmailAndPassword(instance, email, password)));
    }
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
    // A new account made from a guest session is linked to it, so the guest's
    // requests stay theirs (same uid).
    const guest = instance.currentUser?.isAnonymous ? instance.currentUser : null;
    if (guest) {
      const linked = await linkWithCredential(guest, EmailAuthProvider.credential(email, password));
      await afterGuestLinked(linked.user);
      return toAuthUser(linked.user);
    }
    const result = await createUserWithEmailAndPassword(instance, email, password);
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

/**
 * The uid of this browser's guest session, if it already has one (it is made
 * the first time a visitor sends an app request). Never starts one.
 */
export async function getGuestUid(): Promise<string | null> {
  const instance = await ensureReady();
  if (!instance) return null;
  await initializedPromise;
  return instance.currentUser?.isAnonymous ? instance.currentUser.uid : null;
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
