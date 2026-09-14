/**
 * Local folder integration — port of the File System Access + IndexedDB
 * helpers from motvin-ui/COMPONENT/Save Collection Modal.js.
 *
 * A "connected" folder is a real directory on the visitor's disk that the
 * browser has granted us read/write access to. We write one JSON file per
 * saved item and re-read them on window focus so files added or removed
 * outside the app show up.
 *
 * Directory handles cannot be stored in localStorage (they don't survive
 * JSON.stringify), so they live in IndexedDB. Everything else stays in
 * localStorage under the folders array so the folder list still round-trips
 * without hitting IndexedDB.
 */

import type { LibraryItem } from './api/normalize';

export type AppType = 'icons' | 'logos' | 'illustrations';

const DB_NAME = 'motvin-folder-handles';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

/** Which storage-key prefix owns a folder — used to reject cross-library reuse. */
export function appTypeFor(prefix: string): AppType {
  if (prefix === 'ml') return 'logos';
  if (prefix === 'mill') return 'illustrations';
  return 'icons';
}

// -----------------------------------------------------------------------------
// IndexedDB
// -----------------------------------------------------------------------------

/**
 * Opens (and if needed, creates) the small store used only for directory
 * handles. Kept as a fresh open per call — the underlying browser handle is
 * cheap and lets us close cleanly.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function handleKey(appType: AppType, folderId: string) {
  return `${appType}:${folderId}`;
}

export async function persistDirectoryHandle(
  appType: AppType,
  folderId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, handleKey(appType, folderId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readDirectoryHandle(
  appType: AppType,
  folderId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(handleKey(appType, folderId));
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

export async function deleteDirectoryHandle(
  appType: AppType,
  folderId: string,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(handleKey(appType, folderId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// -----------------------------------------------------------------------------
// File System Access
// -----------------------------------------------------------------------------

/**
 * Whether this browser can pick a local directory. Firefox and Safari lack
 * `showDirectoryPicker`, so the caller should hide the "Connect Local Folder"
 * option there rather than opening a modal that will fail.
 */
export function localFoldersSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

type PickerCallable = (options?: {
  mode?: 'read' | 'readwrite';
}) => Promise<FileSystemDirectoryHandle>;

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!localFoldersSupported()) return null;
  try {
    const picker = (window as unknown as { showDirectoryPicker: PickerCallable })
      .showDirectoryPicker;
    return await picker({ mode: 'readwrite' });
  } catch (err) {
    // User dismissed the picker — surface as null, not an error.
    if ((err as { name?: string }).name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Verify or request write access. Chrome may have downgraded a previously
 * granted handle to read-only after a browser restart.
 */
export async function ensureWritable(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const permission = handle as unknown as {
    queryPermission: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  const existing = await permission.queryPermission({ mode: 'readwrite' });
  if (existing === 'granted') return true;
  const requested = await permission.requestPermission({ mode: 'readwrite' });
  return requested === 'granted';
}

// -----------------------------------------------------------------------------
// Filename + JSON payload
// -----------------------------------------------------------------------------

/**
 * Filename for one saved item — mirrors legacy `getLocalFileName` so a folder
 * connected on the old site opens cleanly on this port.
 *
 *   `${sourceIconId||source||collection||'item'}-${id}` sanitised to
 *   `[a-z0-9\-_]`, extension `.json`.
 */
export function localFileName(item: LibraryItem): string {
  const prefix =
    item.sourceItemId || item.source || item.category || 'item';
  const raw = `${prefix}-${item.id}`.toLowerCase();
  const sanitised = raw.replace(/[^a-z0-9\-_]+/g, '-').replace(/-+/g, '-');
  return `${sanitised}.json`;
}

/**
 * Serialisable copy of an item for on-disk storage. Kept small — only the
 * fields legacy wrote — so the folder stays readable across versions.
 */
export function itemToJson(item: LibraryItem, appType: AppType): string {
  return JSON.stringify(
    {
      id: item.id,
      name: item.name,
      collection: item.source,
      collectionName: item.sourceName,
      category: item.category,
      tags: item.tags,
      style: item.style,
      license: item.license,
      viewBox: item.viewBox,
      svg: item.svg,
      _appType: appType,
    },
    null,
    2,
  );
}

export async function writeItemToFolder(
  handle: FileSystemDirectoryHandle,
  item: LibraryItem,
  appType: AppType,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(localFileName(item), { create: true });
  const writable = await (fileHandle as unknown as {
    createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  }).createWritable();
  await writable.write(itemToJson(item, appType));
  await writable.close();
}

export async function removeItemFromFolder(
  handle: FileSystemDirectoryHandle,
  item: LibraryItem,
): Promise<void> {
  try {
    await (handle as unknown as {
      removeEntry: (name: string) => Promise<void>;
    }).removeEntry(localFileName(item));
  } catch (err) {
    // Missing files aren't an error — the folder is already in the desired state.
    if ((err as { name?: string }).name !== 'NotFoundError') throw err;
  }
}

/**
 * Read the ids of every JSON item currently in the folder. Skips files that
 * don't parse as our shape — the folder may hold other files the user put
 * there and legacy leaves those alone.
 */
export async function readFolderItemIds(
  handle: FileSystemDirectoryHandle,
): Promise<string[]> {
  const ids: string[] = [];
  const values = (handle as unknown as {
    values: () => AsyncIterable<{ kind: string; name: string; getFile?: () => Promise<File> }>;
  }).values();
  for await (const entry of values) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    try {
      const file = await entry.getFile!();
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.id === 'string') ids.push(parsed.id);
    } catch {
      // Skip parse failures rather than aborting the whole sync.
    }
  }
  return ids;
}
