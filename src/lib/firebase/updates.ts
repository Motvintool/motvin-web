/**
 * Release notes — Firestore read/write helpers plus the admin allowlist and
 * Storage image uploads. React ports of the flows in
 * motvin-ui/updates/script.110f497c05.js (public feed) and
 * motvin-ui/updates/admin.8d71fd2002.js (publisher).
 *
 * Uses the modular SDK against the same Firebase app that `firebase/auth.ts`
 * initialises. Firestore, Storage and the Google provider are lazy — pages
 * that don't need them don't pay the SDK load cost.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import { firebaseConfig, isFirebaseConfigured } from './config';

/** Firestore collection the reference publishes to. */
const RELEASE_COLLECTION = 'updates-feed';
/** Read fallbacks — different environments named the same collection differently. */
const READ_COLLECTION_CANDIDATES = ['updates-feed', 'updatesFeed', 'updates'];
/** Owner allowlist mirrors admin.8d71fd2002.js OWNER_ADMIN_EMAILS. */
export const OWNER_ADMIN_EMAILS = ['surendarv638@gmail.com'];
/** Additional admins live in this collection, doc id = lowercased email. */
export const ADMIN_COLLECTION = 'releaseNotesAdmins';
/** Storage path prefix for uploaded release images. */
const STORAGE_PREFIX = 'release-notes';
/** Max upload size — mirrors admin.js MAX_IMAGE_SIZE_BYTES. */
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

export type ReleaseChanges = {
  features?: string[];
  improvements?: string[];
  fixes?: string[];
};

export type ReleaseShare = {
  slug?: string;
  title?: string;
  summary?: string;
};

export type ReleaseNote = {
  id: string;
  title: string;
  date: Date | null;
  description?: string;
  image?: string;
  imageStoragePath?: string;
  changes?: ReleaseChanges;
  share?: ReleaseShare;
  publishedAt?: Date | null;
  publishedBy?: string;
  updatedAt?: Date | null;
  updatedBy?: string;
};

/**
 * The payload the admin form assembles before writing to Firestore. Every
 * server-side field (dates, actor emails) is filled by the write helper.
 */
export type ReleaseNoteInput = {
  title: string;
  date: Date;
  description: string;
  image?: string;
  imageStoragePath?: string;
  changes: Required<ReleaseChanges>;
  share: Required<Pick<ReleaseShare, 'slug' | 'summary' | 'title'>>;
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

function ensureFirestore(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  if (db) return db;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  db = getFirestore(app);
  return db;
}

function ensureStorage(): FirebaseStorage | null {
  if (!isFirebaseConfigured) return null;
  if (storage) return storage;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  storage = getStorage(app);
  return storage;
}

function coerceDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normaliseReleaseNote(id: string, raw: Record<string, unknown>): ReleaseNote {
  return {
    id,
    title: String(raw.title ?? 'Untitled Update'),
    date: coerceDate(raw.date),
    description: raw.description ? String(raw.description) : undefined,
    image: raw.image ? String(raw.image) : undefined,
    imageStoragePath: raw.imageStoragePath ? String(raw.imageStoragePath) : undefined,
    changes: (raw.changes as ReleaseChanges) ?? undefined,
    share: (raw.share as ReleaseShare) ?? undefined,
    publishedAt: coerceDate(raw.publishedAt),
    publishedBy: raw.publishedBy ? String(raw.publishedBy) : undefined,
    updatedAt: coerceDate(raw.updatedAt),
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
  };
}

// -----------------------------------------------------------------------------
// Public feed
// -----------------------------------------------------------------------------

/**
 * Public feed — tries each candidate collection until one returns a snapshot;
 * `null` when Firestore isn't configured. Missing indexes and permission
 * errors are thrown so the caller can show the right message.
 */
export async function fetchReleaseNotes(): Promise<ReleaseNote[] | null> {
  const instance = ensureFirestore();
  if (!instance) return null;

  let missingIndex = false;
  for (const name of READ_COLLECTION_CANDIDATES) {
    try {
      const snapshot = await getDocs(
        query(collection(instance, name), orderBy('date', 'desc')),
      );
      return snapshot.docs.map((d) => normaliseReleaseNote(d.id, d.data()));
    } catch (err) {
      const code = String((err as { code?: unknown })?.code ?? '');
      if (code === 'failed-precondition') {
        missingIndex = true;
        continue;
      }
      if (code === 'permission-denied' || code === 'unauthenticated') throw err;
    }
  }
  if (missingIndex) throw new Error('missing-firestore-index');
  return [];
}

// -----------------------------------------------------------------------------
// Admin — read helpers
// -----------------------------------------------------------------------------

/** Newest-first list of every release note in the primary collection. */
export async function fetchAllReleaseNotes(): Promise<ReleaseNote[]> {
  const instance = ensureFirestore();
  if (!instance) return [];
  const snapshot = await getDocs(
    query(collection(instance, RELEASE_COLLECTION), orderBy('date', 'desc')),
  );
  return snapshot.docs.map((d) => normaliseReleaseNote(d.id, d.data()));
}

export async function fetchReleaseNote(id: string): Promise<ReleaseNote | null> {
  const instance = ensureFirestore();
  if (!instance) return null;
  const snap = await getDoc(doc(instance, RELEASE_COLLECTION, id));
  return snap.exists() ? normaliseReleaseNote(snap.id, snap.data()) : null;
}

// -----------------------------------------------------------------------------
// Admin gating
// -----------------------------------------------------------------------------

export function normaliseEmail(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isOwnerAdmin(email: string | null | undefined): boolean {
  return OWNER_ADMIN_EMAILS.includes(normaliseEmail(email));
}

/** True when the account is owner OR appears in the releaseNotesAdmins doc set. */
export async function hasAdminAccess(email: string | null | undefined): Promise<boolean> {
  const normalised = normaliseEmail(email);
  if (!normalised) return false;
  if (isOwnerAdmin(normalised)) return true;
  const instance = ensureFirestore();
  if (!instance) return false;
  try {
    const snap = await getDoc(doc(instance, ADMIN_COLLECTION, normalised));
    return snap.exists();
  } catch {
    return false;
  }
}

export type AdminRecord = {
  email: string;
  addedAt: Date | null;
  addedBy?: string;
};

/** Owner-only list — reference lets owners manage the admin allowlist. */
export async function fetchAdmins(): Promise<AdminRecord[]> {
  const instance = ensureFirestore();
  if (!instance) return [];
  const snapshot = await getDocs(collection(instance, ADMIN_COLLECTION));
  return snapshot.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      email: String(data.email ?? d.id),
      addedAt: coerceDate(data.addedAt),
      addedBy: data.addedBy ? String(data.addedBy) : undefined,
    };
  });
}

export async function addAdmin(email: string, addedBy: string): Promise<void> {
  const instance = ensureFirestore();
  if (!instance) throw new Error('Firebase not configured');
  const normalised = normaliseEmail(email);
  if (!normalised) throw new Error('Email is required');
  await setDoc(
    doc(instance, ADMIN_COLLECTION, normalised),
    { email: normalised, addedAt: serverTimestamp(), addedBy: normaliseEmail(addedBy) },
    { merge: true },
  );
}

export async function removeAdmin(email: string): Promise<void> {
  const instance = ensureFirestore();
  if (!instance) throw new Error('Firebase not configured');
  await deleteDoc(doc(instance, ADMIN_COLLECTION, normaliseEmail(email)));
}

// -----------------------------------------------------------------------------
// Admin — write / update / delete release notes
// -----------------------------------------------------------------------------

export function slugifyRelease(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Returns a unique share slug — appends -2, -3, … until Firestore has no
 * existing doc with the same `share.slug`. Excludes `excludeId` so an edit
 * doesn't clash with the doc it's about to overwrite. Mirrors legacy at
 * admin.8d71fd2002.js's uniqueShareSlug.
 */
export async function uniqueShareSlug(
  candidate: string,
  excludeId?: string,
): Promise<string> {
  const instance = ensureFirestore();
  if (!instance) return candidate;
  const base = slugifyRelease(candidate) || 'release';
  let attempt = base;
  let counter = 2;
  // Reasonable upper bound to avoid an infinite loop against corrupt data.
  for (let i = 0; i < 500; i++) {
    const snapshot = await getDocs(
      query(
        collection(instance, RELEASE_COLLECTION),
        where('share.slug', '==', attempt),
      ),
    );
    const clash = snapshot.docs.find((d) => d.id !== excludeId);
    if (!clash) return attempt;
    attempt = `${base}-${counter++}`;
  }
  return attempt;
}

/** Sanitises a filename for a Storage object path. */
function sanitiseFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/** Uploads an image under `release-notes/{slug}-{ts}/{name}`. */
export async function uploadReleaseImage(
  file: File,
  slugHint: string,
): Promise<{ url: string; path: string }> {
  const s = ensureStorage();
  if (!s) throw new Error('Firebase Storage not configured');
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image is too large — 8 MB maximum');
  }
  const path = `${STORAGE_PREFIX}/${slugifyRelease(slugHint) || 'update'}-${Date.now()}/${sanitiseFileName(file.name)}`;
  const ref = storageRef(s, path);
  await uploadBytes(ref, file, {
    contentType: file.type,
    cacheControl: 'public,max-age=31536000',
  });
  const url = await getDownloadURL(ref);
  return { url, path };
}

/** Deletes a managed image — silent on missing files, matches admin.js. */
export async function deleteReleaseImage(path?: string | null): Promise<void> {
  if (!path || !path.startsWith(`${STORAGE_PREFIX}/`)) return;
  const s = ensureStorage();
  if (!s) return;
  try {
    await deleteObject(storageRef(s, path));
  } catch (err) {
    if (String((err as { code?: unknown })?.code ?? '') !== 'storage/object-not-found') {
      throw err;
    }
  }
}

type WriteFields = {
  title: string;
  date: FieldValue | Timestamp;
  description: string;
  changes: Required<ReleaseChanges>;
  share: Required<Pick<ReleaseShare, 'slug' | 'summary' | 'title'>>;
  publishedBy: string;
  publishedAt: FieldValue | Timestamp | Date;
  updatedAt: FieldValue;
  updatedBy: string;
  image?: string;
  imageStoragePath?: string;
};

export async function publishReleaseNote(input: {
  data: ReleaseNoteInput;
  actorEmail: string;
  /** When set, updates that doc; otherwise creates a new one. */
  editingId?: string | null;
  /** Preserve the original publish timestamp on edit. */
  originalPublishedAt?: Date | null;
}): Promise<{ id: string; slug: string }> {
  const instance = ensureFirestore();
  if (!instance) throw new Error('Firebase not configured');

  const uniqSlug = await uniqueShareSlug(
    input.data.share.slug || input.data.title,
    input.editingId ?? undefined,
  );

  const payload: WriteFields = {
    title: input.data.title.trim(),
    date: Timestamp.fromDate(input.data.date),
    description: input.data.description.trim(),
    changes: input.data.changes,
    share: {
      slug: uniqSlug,
      summary: input.data.share.summary?.trim() || input.data.description.trim(),
      title: input.data.share.title?.trim() || input.data.title.trim(),
    },
    publishedBy: normaliseEmail(input.actorEmail),
    publishedAt: input.editingId && input.originalPublishedAt
      ? input.originalPublishedAt
      : serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: normaliseEmail(input.actorEmail),
  };
  if (input.data.image) payload.image = input.data.image;
  if (input.data.imageStoragePath) payload.imageStoragePath = input.data.imageStoragePath;

  const id = input.editingId
    ? input.editingId
    : doc(collection(instance, RELEASE_COLLECTION)).id;
  await setDoc(doc(instance, RELEASE_COLLECTION, id), payload, { merge: true });
  return { id, slug: uniqSlug };
}

export async function deleteReleaseNote(id: string): Promise<void> {
  const instance = ensureFirestore();
  if (!instance) throw new Error('Firebase not configured');
  await deleteDoc(doc(instance, RELEASE_COLLECTION, id));
}
