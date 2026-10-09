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
    throw new Error('We couldn’t send that just now — please try again.');
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
  } catch {
    throw new Error('We couldn’t save that just now — please try again.');
  }
}

/** Removes one request; the rules allow it for its owner and for the admin. */
export async function deleteMyRequest(id: string): Promise<void> {
  await deleteDoc(doc(firestore(), COLLECTION, id));
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
