/**
 * Saved items + collections, synced to Firestore for signed-in accounts.
 *
 * Same conventions as ratings.ts: the modular SDK against the app
 * firebase/auth.ts initialises, Firestore loaded lazily, and reads that never
 * throw (a failed read should show an empty library, not an error — nobody
 * opened this page to see a Firestore error).
 *
 * Reuses the same rule motvin-ui/Firebase/firestore.rules.active.txt already
 * has for palettes/typefaces — one document per user per "collection type",
 * validated only as { uid, entries: list }. No rules change needed:
 *
 *   /users/{uid}/collections/inspirationsSaved   { uid, entries: SavedItem[] }
 *   /users/{uid}/collections/inspirationsBoards  { uid, entries: Collection[] }
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { doc, getDoc, getFirestore, setDoc, type Firestore } from 'firebase/firestore';
import type { Collection, SavedItem } from '../inspirations/types';
import { firebaseConfig, isFirebaseConfigured } from './config';

const COLLECTIONS_ROOT = 'collections';
const SAVED_DOC = 'inspirationsSaved';
const BOARDS_DOC = 'inspirationsBoards';

export type RemoteLibrary = { saved: SavedItem[]; collections: Collection[] };

const EMPTY: RemoteLibrary = { saved: [], collections: [] };

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function ensureFirestore(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  if (db) return db;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  db = getFirestore(app);
  return db;
}

export function libraryAvailable(): boolean {
  return isFirebaseConfigured;
}

function toList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Reads a signed-in user's saved items + collections. Never throws. */
export async function readLibrary(uid: string): Promise<RemoteLibrary> {
  const firestore = ensureFirestore();
  if (!firestore || !uid) return EMPTY;

  try {
    const [savedSnap, boardsSnap] = await Promise.all([
      getDoc(doc(firestore, 'users', uid, COLLECTIONS_ROOT, SAVED_DOC)),
      getDoc(doc(firestore, 'users', uid, COLLECTIONS_ROOT, BOARDS_DOC)),
    ]);
    return {
      saved: toList<SavedItem>(savedSnap.exists() ? savedSnap.data().entries : []),
      collections: toList<Collection>(boardsSnap.exists() ? boardsSnap.data().entries : []),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Writes a signed-in user's saved items + collections, overwriting whatever
 * was there. The caller owns merging — this is a plain write, not a diff.
 *
 * @throws when signed out or the write is refused, so the sync layer can
 * decide whether to retry rather than silently losing a save.
 */
export async function writeLibrary(uid: string, state: RemoteLibrary): Promise<void> {
  const firestore = ensureFirestore();
  if (!firestore) throw new Error('Library sync is unavailable — Firebase is not configured.');
  if (!uid) throw new Error('Sign in to sync your saved items.');

  await Promise.all([
    setDoc(doc(firestore, 'users', uid, COLLECTIONS_ROOT, SAVED_DOC), { uid, entries: state.saved }),
    setDoc(doc(firestore, 'users', uid, COLLECTIONS_ROOT, BOARDS_DOC), { uid, entries: state.collections }),
  ]);
}
