'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { storageKey, type CategoryConfig } from '@/lib/config/categories';
import type { LibraryItem } from '@/lib/api/normalize';
import {
  appTypeFor,
  deleteDirectoryHandle,
  ensureWritable,
  persistDirectoryHandle,
  readDirectoryHandle,
  readFolderItemIds,
  removeItemFromFolder,
  writeItemToFolder,
  type AppType,
} from '@/lib/localFolders';
import { useStoredValue, writeStoredValue } from './useStoredValue';

/**
 * Saved items, grouped into folders — port of the folder handling in
 * motvin-ui/JS/motvin-icons.js (saveLS, isIconSaved, getActiveFolderIconIds).
 *
 * Stored under the original's per-category keys so anyone who saved items on
 * the static site still has them after the cutover. As there, only
 * `{id, name, iconIds}` is persisted: the original also carried an `_itemCache`
 * of full SVG data that could blow past the 5MB localStorage limit on its own.
 */

export type SavedFolder = {
  id: string;
  name: string;
  iconIds: string[];
};

const DEFAULT_FOLDER_ID = 'default';

function parseFolders(raw: string | null): string {
  // The store hook compares snapshots by identity, so this returns the raw
  // JSON string and the parsing happens in a memo below.
  return raw ?? '[]';
}

function safeParse(json: string): SavedFolder[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f): f is SavedFolder => Boolean(f) && typeof f === 'object')
      .map((f) => ({
        id: String(f.id ?? ''),
        name: String(f.name ?? 'Untitled'),
        iconIds: Array.isArray(f.iconIds) ? f.iconIds.map(String) : [],
      }))
      .filter((f) => f.id);
  } catch {
    return [];
  }
}

export function useSavedCollections(config: CategoryConfig) {
  const foldersKey = storageKey(config, 'folders');
  const appType: AppType = appTypeFor(config.storagePrefix);
  const [foldersJson, refresh] = useStoredValue(foldersKey, '[]', parseFolders);
  const [activeFolderId, setActiveFolder] = useState<string | null>(null);
  /** Folder ids we've verified have a live directory handle in IndexedDB. */
  const [connectedFolderIds, setConnectedFolderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const folders = useMemo(() => safeParse(foldersJson), [foldersJson]);

  /**
   * Read-modify-write against localStorage rather than the React snapshot.
   *
   * Two saves in quick succession both render from the same `folders` value,
   * so an updater closing over it would have the second write overwrite the
   * first — clicking save on two cards in a row kept only the second. Reading
   * current storage inside the update makes each write build on the last one,
   * and also picks up anything another tab wrote.
   */
  const update = useCallback(
    (change: (current: SavedFolder[]) => SavedFolder[]) => {
      let current: SavedFolder[] = [];
      try {
        current = safeParse(window.localStorage.getItem(foldersKey) ?? '[]');
      } catch {
        current = [];
      }
      const next = change(current);
      writeStoredValue(
        foldersKey,
        JSON.stringify(next.map((f) => ({ id: f.id, name: f.name, iconIds: f.iconIds }))),
      );
      refresh();
      return next;
    },
    [foldersKey, refresh],
  );

  /** Every saved id across all folders, deduped. */
  const allSavedIds = useMemo(
    () => [...new Set(folders.flatMap((f) => f.iconIds))],
    [folders],
  );

  const savedIdSet = useMemo(() => new Set(allSavedIds), [allSavedIds]);

  /** Ids in the selected folder, or all of them when none is selected. */
  const activeFolderIds = useMemo(() => {
    if (!activeFolderId) return allSavedIds;
    return folders.find((f) => f.id === activeFolderId)?.iconIds ?? [];
  }, [folders, activeFolderId, allSavedIds]);

  /**
   * Saving with no folders yet creates "Favorites", matching the original's
   * implicit default rather than making the visitor name a folder first.
   */
  const toggleItem = useCallback(
    (itemId: string, folderId?: string) => {
      const targetId = folderId ?? activeFolderId ?? DEFAULT_FOLDER_ID;
      update((current) => {
        const next = current.map((f) => ({ ...f, iconIds: [...f.iconIds] }));

        let target = next.find((f) => f.id === targetId);
        if (!target) {
          target = { id: targetId, name: 'Favorites', iconIds: [] };
          next.push(target);
        }

        const index = target.iconIds.indexOf(itemId);
        if (index >= 0) target.iconIds.splice(index, 1);
        else target.iconIds.push(itemId);

        return next;
      });
    },
    [activeFolderId, update],
  );

  /**
   * Toggle a full item into a specific folder, and mirror to disk if the
   * folder is backed by a connected directory. Pass the whole LibraryItem so
   * the on-disk write has the SVG payload — the folder still stores just ids.
   */
  const toggleItemInFolder = useCallback(
    (item: LibraryItem, folderId: string) => {
      let willRemove = false;
      update((current) => {
        const next = current.map((f) => ({ ...f, iconIds: [...f.iconIds] }));
        const target = next.find((f) => f.id === folderId);
        if (!target) return next;
        const index = target.iconIds.indexOf(item.id);
        if (index >= 0) {
          target.iconIds.splice(index, 1);
          willRemove = true;
        } else {
          target.iconIds.push(item.id);
        }
        return next;
      });

      if (!connectedFolderIds.has(folderId)) return;
      // Mirror to disk best-effort. Failures don't roll back the localStorage
      // change — the folder view is authoritative, and next window focus will
      // sync from disk anyway.
      void (async () => {
        const handle = await readDirectoryHandle(appType, folderId);
        if (!handle) return;
        if (!(await ensureWritable(handle))) return;
        try {
          if (willRemove) await removeItemFromFolder(handle, item);
          else await writeItemToFolder(handle, item, appType);
        } catch {
          /* ignore — sync-on-focus will reconcile */
        }
      })();
    },
    [appType, connectedFolderIds, update],
  );

  const createFolder = useCallback(
    (name: string) => {
      const id = `f_${Date.now().toString(36)}`;
      update((current) => [...current, { id, name: name.trim() || 'Untitled', iconIds: [] }]);
      return id;
    },
    [update],
  );

  const deleteFolder = useCallback(
    (folderId: string) => {
      update((current) => current.filter((f) => f.id !== folderId));
      setActiveFolder((current) => (current === folderId ? null : current));
    },
    [update],
  );

  const renameFolder = useCallback(
    (folderId: string, name: string) => {
      update((current) => current.map((f) => (f.id === folderId ? { ...f, name } : f)));
    },
    [update],
  );

  /**
   * Connect an on-disk directory as a new folder. Existing JSON files in the
   * directory are imported so a returning visitor's saved items surface
   * automatically. Returns the new folder id.
   */
  const connectLocalFolder = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      if (!(await ensureWritable(handle))) {
        throw new Error('Write permission was not granted.');
      }
      const importedIds = await readFolderItemIds(handle);
      const id = `f_${Date.now().toString(36)}`;
      update((current) => [
        ...current,
        { id, name: handle.name || 'Untitled', iconIds: importedIds },
      ]);
      await persistDirectoryHandle(appType, id, handle);
      setConnectedFolderIds((prev) => new Set(prev).add(id));
      return id;
    },
    [appType, update],
  );

  const disconnectLocalFolder = useCallback(
    async (folderId: string) => {
      await deleteDirectoryHandle(appType, folderId);
      setConnectedFolderIds((prev) => {
        if (!prev.has(folderId)) return prev;
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    },
    [appType],
  );

  // Discover which existing folders are still backed by an IndexedDB handle.
  // Runs once per folder set change, not on every render.
  const folderIdsKey = folders.map((f) => f.id).join(',');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = new Set<string>();
      await Promise.all(
        folders.map(async (folder) => {
          try {
            const handle = await readDirectoryHandle(appType, folder.id);
            if (handle) found.add(folder.id);
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setConnectedFolderIds(found);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- folderIdsKey stands in for the folder array identity
  }, [folderIdsKey, appType]);

  // Sync connected folders' membership from disk on window focus. A file the
  // user added or removed in the OS surfaces without a reload.
  useEffect(() => {
    if (connectedFolderIds.size === 0) return;
    const sync = async () => {
      const perFolder: Array<{ id: string; ids: string[] }> = [];
      await Promise.all(
        [...connectedFolderIds].map(async (folderId) => {
          try {
            const handle = await readDirectoryHandle(appType, folderId);
            if (!handle) return;
            const ids = await readFolderItemIds(handle);
            perFolder.push({ id: folderId, ids });
          } catch {
            /* ignore */
          }
        }),
      );
      if (perFolder.length === 0) return;
      update((current) =>
        current.map((folder) => {
          const found = perFolder.find((f) => f.id === folder.id);
          return found ? { ...folder, iconIds: found.ids } : folder;
        }),
      );
    };
    const onFocus = () => void sync();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [connectedFolderIds, appType, update]);

  const isSavedInFolder = useCallback(
    (itemId: string, folderId: string) => {
      const folder = folders.find((f) => f.id === folderId);
      return folder ? folder.iconIds.includes(itemId) : false;
    },
    [folders],
  );

  return {
    folders,
    activeFolderId,
    setActiveFolder,
    allSavedIds,
    savedIdSet,
    activeFolderIds,
    toggleItem,
    toggleItemInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    isSavedInFolder,
    connectLocalFolder,
    disconnectLocalFolder,
    connectedFolderIds,
  };
}
