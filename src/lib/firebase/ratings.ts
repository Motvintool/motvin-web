/**
 * App ratings, backed by Firestore.
 *
 * Follows the same shape as the rest of the Firebase code here: the modular
 * SDK against the app `firebase/auth.ts` initialises, and Firestore loaded
 * lazily so pages that never rate anything don't pay for the SDK.
 *
 * Two documents per app, mirroring the per-user scoping in
 * motvin-ui/FIREBASE_ARCHITECTURE.md:
 *
 *   /inspirationRatings/{appId}                    { sum, count, updatedAtMs }
 *   /inspirationRatings/{appId}/userRatings/{uid}  { uid, value, updatedAtMs }
 *
 * The aggregate is kept as a running sum and count rather than recomputed by
 * reading every user's document: an average is then one document read, which
 * stays constant as the library grows. Keeping the two in step is exactly what
 * a transaction is for — changing your own score from 3 to 5 has to adjust the
 * sum by +2 without touching the count, and two people rating at once must not
 * lose one of the votes.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './config';

/** Root collection. One document per app, keyed by the app's slug. */
const RATINGS_COLLECTION = 'inspirationRatings';
/** Sub-collection of individual votes, keyed by the rater's uid. */
const USER_RATINGS = 'userRatings';

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export type AppRatingSummary = {
  /** Mean score, or null when nobody has rated yet. */
  average: number | null;
  /** How many people have rated. */
  count: number;
  /** The signed-in user's own score, or null when they have not rated. */
  mine: number | null;
};

export const EMPTY_RATING: AppRatingSummary = { average: null, count: 0, mine: null };

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function ensureFirestore(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  if (db) return db;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  db = getFirestore(app);
  return db;
}

/** Whether ratings can work at all — false when Firebase isn't configured. */
export function ratingsAvailable(): boolean {
  return isFirebaseConfigured;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function toSum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Rejects anything that is not a whole 1–5. */
export function isValidRating(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_RATING && (value as number) <= MAX_RATING;
}

/**
 * Reads an app's rating, plus the signed-in user's own score when a uid is
 * given. Never throws: a failed read shows an unrated app rather than an
 * error, because a rating is not why anyone opened the page.
 */
export async function readRating(appId: string, uid?: string | null): Promise<AppRatingSummary> {
  const firestore = ensureFirestore();
  if (!firestore || !appId) return EMPTY_RATING;

  try {
    const aggregateRef = doc(firestore, RATINGS_COLLECTION, appId);
    const [aggregateSnap, mineSnap] = await Promise.all([
      getDoc(aggregateRef),
      uid ? getDoc(doc(aggregateRef, USER_RATINGS, uid)) : Promise.resolve(null),
    ]);

    const data = aggregateSnap.exists() ? aggregateSnap.data() : {};
    const count = toCount(data.count);
    const sum = toSum(data.sum);
    const mineValue = mineSnap?.exists() ? Number(mineSnap.data().value) : null;

    return {
      average: count > 0 ? sum / count : null,
      count,
      mine: isValidRating(mineValue) ? mineValue : null,
    };
  } catch {
    return EMPTY_RATING;
  }
}

/**
 * Records one person's rating and returns the updated summary.
 *
 * Runs in a transaction so the aggregate cannot drift from the votes behind
 * it: re-rating adjusts the sum by the difference and leaves the count alone,
 * and concurrent raters cannot overwrite each other's contribution.
 *
 * @throws when signed out, when the value is out of range, or when the write
 * is refused — all of which the caller should surface rather than swallow.
 */
export async function submitRating(
  appId: string,
  uid: string,
  value: number,
): Promise<AppRatingSummary> {
  const firestore = ensureFirestore();
  if (!firestore) throw new Error('Ratings are unavailable — Firebase is not configured.');
  if (!appId) throw new Error('Missing app.');
  if (!uid) throw new Error('Sign in to rate this app.');
  if (!isValidRating(value)) throw new Error(`A rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}.`);

  const aggregateRef = doc(firestore, RATINGS_COLLECTION, appId);
  const mineRef = doc(aggregateRef, USER_RATINGS, uid);

  return runTransaction(firestore, async (tx) => {
    const [aggregateSnap, mineSnap] = await Promise.all([tx.get(aggregateRef), tx.get(mineRef)]);

    const previous = mineSnap.exists() ? Number(mineSnap.data().value) : null;
    const hadVote = isValidRating(previous);

    const data = aggregateSnap.exists() ? aggregateSnap.data() : {};
    const sum = toSum(data.sum) - (hadVote ? (previous as number) : 0) + value;
    const count = toCount(data.count) + (hadVote ? 0 : 1);
    const updatedAtMs = Date.now();

    tx.set(aggregateRef, { sum, count, updatedAtMs }, { merge: true });
    tx.set(mineRef, { uid, value, updatedAtMs }, { merge: true });

    return { average: count > 0 ? sum / count : null, count, mine: value };
  });
}
