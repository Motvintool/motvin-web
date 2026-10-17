'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { libraryAvailable, readLibrary, writeLibrary, type RemoteLibrary } from '@/lib/firebase/library';
import { libraryStore, type LibraryState } from '@/lib/inspirations/store';
import type { Collection, SavedItem } from '@/lib/inspirations/types';
import { useToast } from './Toast';

/**
 * NOT MOUNTED: collections are kept in this browser's localStorage only (they
 * outgrow a single Firestore document), so nothing syncs them to an account.
 * Kept so syncing can be put back by mounting it in InspirationsShell again.
 *
 * Mounted once (InspirationsShell). Renders nothing — it keeps libraryStore
 * (localStorage-backed, see lib/inspirations/store.ts) in sync with the
 * signed-in user's Firestore library, so Save/Collections follow the
 * account rather than the device.
 *
 * Signed out, or signed in only anonymously (same gate AppRating.tsx uses):
 * this does nothing, and libraryStore behaves exactly as it always has —
 * local-only, zero regression for guests.
 */
export function LibrarySync() {
  const { user, ready } = useAuth();
  const syncedUidRef = useRef<string | null>(null);
  const mergingRef = useRef(false);
  // Said once when syncing starts failing, not on every change after.
  const warnedRef = useRef(false);
  const { show } = useToast();

  const uid = ready && user && !user.isAnonymous ? user.uid : null;

  // On sign-in, merge whatever's in Firestore with whatever's local (a save
  // made before this account signed in should not be silently dropped) —
  // once per uid, not on every render.
  useEffect(() => {
    if (!uid || !libraryAvailable() || syncedUidRef.current === uid) return;
    syncedUidRef.current = uid;
    let cancelled = false;
    readLibrary(uid).then((remote) => {
      if (cancelled) return;
      mergingRef.current = true;
      libraryStore.replaceState(mergeLibraries(libraryStore.getState(), remote));
      mergingRef.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) syncedUidRef.current = null;
  }, [uid]);

  // Push local changes upstream while signed in. Skipped for the emit that
  // the merge above itself triggers — that state came from Firestore
  // already, writing it straight back would just be a wasted round trip.
  useEffect(() => {
    if (!uid || !libraryAvailable()) return;
    return libraryStore.subscribe(() => {
      if (mergingRef.current) return;
      void writeLibrary(uid, libraryStore.getState())
        .then(() => {
          warnedRef.current = false;
        })
        .catch(() => {
          // The save stays intact locally either way, and the next local
          // change (or the next sign-in) retries the sync.
          if (warnedRef.current) return;
          warnedRef.current = true;
          show('Couldn’t sync your collections — they’re kept on this device for now', { tone: 'error' });
        });
    });
  }, [uid, show]);

  return null;
}

function mergeLibraries(local: LibraryState, remote: RemoteLibrary): LibraryState {
  const collectionsById = new Map<string, Collection>();
  for (const collection of [...remote.collections, ...local.collections]) {
    const existing = collectionsById.get(collection.id);
    if (!existing || new Date(collection.createdAt) > new Date(existing.createdAt)) {
      collectionsById.set(collection.id, collection);
    }
  }

  return {
    collections: Array.from(collectionsById.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  };
}
