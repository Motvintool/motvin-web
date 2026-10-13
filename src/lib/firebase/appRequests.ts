/**
 * "Request an app", backed by Firestore.
 *
 *   /appRequests/{uid}_{0..4}   { appName, key, platform, link, note, email, createdAtMs, uid, userEmail?, updatedAtMs? }
 *
 * Every request belongs to a user — a signed-in account, or the guest session the site starts for
 * a visitor. The document id is `<uid>_<slot>` with slot 0 to 4, and the rules only accept those ids,
 * so one person can never hold more than MAX_REQUESTS_PER_USER requests: there are only five
 * places to put them. Deleting a request frees its slot. People read, edit and delete their own;
 * the admin reads and deletes all of them (firestore.inspirations.rules).
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { ensureGuestSession, ensureReady } from './auth';
import { firebaseConfig, isFirebaseConfigured } from './config';
import type { Platform } from '@/lib/inspirations/types';

const COLLECTION = 'appRequests';
const PLATFORMS: Platform[] = ['ios', 'webapp', 'web'];

/** How many requests one person may have at a time. */
export const MAX_REQUESTS_PER_USER = 5;

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Case, spacing and punctuation do not make a different app. */
export const requestKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let db: Firestore | null = null;
function firestore(): Firestore {
  if (!isFirebaseConfigured) throw new Error('Requests are not available right now.');
  if (db) return db;
  db = getFirestore(getApps()[0] ?? initializeApp(firebaseConfig));
  return db;
}

export type RequestFields = {
  appName: string;
  platform: Platform;
  link?: string;
  note?: string;
  email?: string;
};

/** Validates and trims what the person typed; throws a message fit to show them. */
function validate(input: RequestFields) {
  const appName = clean(input.appName, 80);
  if (appName.length < 2) throw new Error('Tell us the app’s name.');
  if (!PLATFORMS.includes(input.platform)) throw new Error('Pick iOS, Web Apps or Webs.');
  const link = clean(input.link, 300);
  if (link && !/^https?:\/\/[^\s]+$/i.test(link)) throw new Error('The link should start with http:// or https://');
  const email = clean(input.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email doesn’t look right.');
  const note = clean(input.note, 500);
  return { appName, key: requestKey(appName), platform: input.platform, link, note, email };
}

/** The signed-in user, or a guest session if there is none yet. */
async function currentUser() {
  const auth = await ensureReady().catch(() => null);
  await auth?.authStateReady().catch(() => undefined);
  if (!auth?.currentUser) await ensureGuestSession();
  const user = auth?.currentUser ?? null;
  if (!user) throw new Error('We couldn’t start a session just now — please try again.');
  return user;
}

export async function submitAppRequest(input: RequestFields & { website?: string }): Promise<void> {
  if (clean(input.website, 200)) return; // a bot; pretend it worked
  const fields = validate(input);
  const user = await currentUser();
  const store = firestore();

  const record = {
    ...fields,
    createdAtMs: Date.now(),
    uid: user.uid,
    ...(user.email && !user.isAnonymous ? { userEmail: user.email } : {}),
  };

  try {
    // Take the first free slot. Reading a slot and writing it happen in one transaction, so two
    // tabs sending at once cannot both claim the same one.
    await runTransaction(store, async (tx) => {
      for (let slot = 0; slot < MAX_REQUESTS_PER_USER; slot += 1) {
        const ref = doc(store, COLLECTION, `${user.uid}_${slot}`);
        if (!(await tx.get(ref)).exists()) {
          tx.set(ref, record);
          return;
        }
      }
      throw new RequestLimitError();
    });
  } catch (failure) {
    if (failure instanceof RequestLimitError) throw failure;
    throw new Error(explainFailure(failure, 'send'));
  }
}

/**
 * What went wrong, in words a person can act on, with Firebase's own code in brackets so a report says exactly
 * which failure it was. The full error also goes to the console for debugging.
 */
function explainFailure(failure: unknown, action: 'send' | 'save'): string {
  console.error(`App request ${action} failed`, failure);
  const code = typeof failure === 'object' && failure && 'code' in failure ? String((failure as { code: unknown }).code) : '';
  const short = code.replace(/^firestore\//, '');
  const tag = short ? ` (${short})` : '';
  switch (short) {
    case 'permission-denied':
      return `The request wasn’t accepted${tag}. Try signing out and in again — if it keeps happening, the request rules may need updating.`;
    case 'unauthenticated':
      return `Your session has expired${tag}. Sign in again, then send it.`;
    case 'unavailable':
    case 'deadline-exceeded':
      return `We couldn’t reach the server${tag}. Check your connection and try again.`;
    case 'resource-exhausted':
      return `Too many requests right now${tag}. Please try again in a minute.`;
    case 'aborted':
    case 'failed-precondition':
      return `Something changed while sending${tag}. Please try again.`;
    default:
      return `We couldn’t ${action} that just now${tag || (failure instanceof Error && failure.message ? ` (${failure.message})` : '')} — please try again.`;
  }
}

export class RequestLimitError extends Error {
  constructor() {
    super(`You’ve used all ${MAX_REQUESTS_PER_USER} of your requests. Delete one in Settings to add another.`);
    this.name = 'RequestLimitError';
  }
}

export type MyRequest = RequestFields & {
  id: string;
  link: string;
  note: string;
  email: string;
  createdAtMs: number;
};

/** The signed-in person's own requests, oldest first. */
export async function listMyRequests(uid: string): Promise<MyRequest[]> {
  const snap = await getDocs(query(collection(firestore(), COLLECTION), where('uid', '==', uid)));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<MyRequest, 'id'>), id: d.id }))
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export async function updateMyRequest(id: string, input: RequestFields): Promise<void> {
  const fields = validate(input);
  try {
    await updateDoc(doc(firestore(), COLLECTION, id), { ...fields, updatedAtMs: Date.now() });
  } catch (failure) {
    throw new Error(explainFailure(failure, 'save'));
  }
}

/** Removes one request; the rules allow it for its owner and for the admin. */
export async function deleteMyRequest(id: string): Promise<void> {
  await deleteDoc(doc(firestore(), COLLECTION, id));
}

// ---------------------------------------------------------------------------
// A guest's requests follow them into the account they sign in to.
//
// Linking a guest session to a new account keeps its uid, so its requests stay
// put and only need the account's email stamped on (stampRequestsWithEmail).
// Signing in to an account that already exists swaps the uid, so the requests
// are lifted out while still the guest (takeGuestRequests), then written into
// the account's free slots (placeRequests), or put back if the sign-in fails.
// ---------------------------------------------------------------------------

/** Signed in as the guest: reads and removes their requests, returning what was taken. */
export async function takeGuestRequests(guestUid: string): Promise<RequestFields[]> {
  const mine = await listMyRequests(guestUid);
  for (const request of mine) await deleteMyRequest(request.id);
  return mine.map(({ appName, platform, link, note, email }) => ({ appName, platform, link, note, email }));
}

export type PlaceResult = { placed: number; alreadyAsked: number; overLimit: number };

/**
 * Writes requests into the current user's free slots, skipping any app they have already asked for.
 * Ones that don't fit (all five slots used) are dropped, and counted as overLimit.
 */
export async function placeRequests(items: RequestFields[]): Promise<PlaceResult> {
  const result: PlaceResult = { placed: 0, alreadyAsked: 0, overLimit: 0 };
  if (!items.length) return result;
  const auth = await ensureReady().catch(() => null);
  const user = auth?.currentUser;
  if (!user) return result;
  const store = firestore();
  const asked = new Set((await listMyRequests(user.uid)).map((r) => `${r.platform}__${requestKey(r.appName)}`));

  for (const [index, item] of items.entries()) {
    let fields;
    try {
      fields = validate(item);
    } catch {
      continue;
    }
    if (asked.has(`${fields.platform}__${fields.key}`)) {
      result.alreadyAsked += 1;
      continue;
    }
    // The rules only take a request dated within ten minutes of now, so a moved one starts afresh.
    const record = {
      ...fields,
      createdAtMs: Date.now(),
      uid: user.uid,
      ...(user.email && !user.isAnonymous ? { userEmail: user.email } : {}),
    };
    const ok = await runTransaction(store, async (tx) => {
      for (let slot = 0; slot < MAX_REQUESTS_PER_USER; slot += 1) {
        const ref = doc(store, COLLECTION, `${user.uid}_${slot}`);
        if (!(await tx.get(ref)).exists()) {
          tx.set(ref, record);
          return true;
        }
      }
      return false;
    });
    if (!ok) {
      result.overLimit = items.length - index;
      break;
    }
    asked.add(`${fields.platform}__${fields.key}`);
    result.placed += 1;
  }
  return result;
}

// What happened to a guest's requests when they signed in, kept for a day so the library can say
// so on the next page (GuestRequestsNotice) — sign-in itself happens on a page without one.
const HANDOFF_NOTICE_KEY = 'motvin:guest-requests-handoff';
const HANDOFF_NOTICE_TTL = 86_400_000;
/** Raised when a note is saved, for a library page that is already open (sign-in returns to it before the move ends). */
export const HANDOFF_NOTICE_EVENT = 'motvin:guest-requests-handoff';

export type HandoffNotice = { kept: number; overLimit: number; at: number };

export function saveHandoffNotice(kept: number, overLimit: number): void {
  if (!kept && !overLimit) return;
  try {
    localStorage.setItem(HANDOFF_NOTICE_KEY, JSON.stringify({ kept, overLimit, at: Date.now() } satisfies HandoffNotice));
    window.dispatchEvent(new Event(HANDOFF_NOTICE_EVENT));
  } catch {
    // No storage (private mode): the requests still moved, there's just no note.
  }
}

/** Reads the note once and clears it. */
export function takeHandoffNotice(): HandoffNotice | null {
  try {
    const raw = localStorage.getItem(HANDOFF_NOTICE_KEY);
    if (!raw) return null;
    localStorage.removeItem(HANDOFF_NOTICE_KEY);
    const notice = JSON.parse(raw) as HandoffNotice;
    return Date.now() - notice.at < HANDOFF_NOTICE_TTL ? notice : null;
  } catch {
    return null;
  }
}

/** After a guest session is linked to an account (same uid): puts the account's email on its requests. Returns how many. */
export async function stampRequestsWithEmail(uid: string, email: string): Promise<number> {
  const mine = await listMyRequests(uid);
  for (const request of mine) {
    await updateDoc(doc(firestore(), COLLECTION, request.id), { userEmail: email, updatedAtMs: Date.now() });
  }
  return mine.length;
}

export type AppRequestGroup = {
  /** Ids of every document folded into this row, so deleting the row removes them all. */
  ids: string[];
  appName: string;
  platform: Platform;
  link: string;
  count: number;
  lastRequestedAt: number;
  entries: { note: string; email: string; at: number; by: string }[];
};

/** Admin only: the rules refuse everyone else. Grouped by app + platform, most-asked first. */
export async function listAppRequests(): Promise<AppRequestGroup[]> {
  const snap = await getDocs(collection(firestore(), COLLECTION));
  const groups = new Map<string, AppRequestGroup>();
  for (const d of snap.docs) {
    const r = d.data() as { appName: string; key: string; platform: Platform; link: string; note: string; email: string; createdAtMs: number; uid?: string; userEmail?: string };
    const id = `${r.platform}__${r.key}`;
    const group = groups.get(id) ?? { ids: [], appName: r.appName, platform: r.platform, link: '', count: 0, lastRequestedAt: 0, entries: [] };
    group.ids.push(d.id);
    group.count += 1;
    group.link ||= r.link;
    group.lastRequestedAt = Math.max(group.lastRequestedAt, r.createdAtMs);
    group.entries.push({ note: r.note, email: r.email, at: r.createdAtMs, by: r.userEmail || (r.uid ? 'Guest' : 'Anonymous') });
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastRequestedAt - a.lastRequestedAt);
}

export async function deleteAppRequestGroup(ids: string[]): Promise<void> {
  const store = firestore();
  await Promise.all(ids.map((id) => deleteDoc(doc(store, COLLECTION, id))));
}
