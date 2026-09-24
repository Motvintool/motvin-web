'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { libraryStore } from '@/lib/inspirations/store';
import type { SavedItemType } from '@/lib/inspirations/types';

/**
 * React binding for the saved/collections store. Snapshot identity only
 * changes on writes, so a page of 100 SaveButtons re-renders only when
 * something was actually saved.
 */
export function useLibrary() {
  const state = useSyncExternalStore(
    libraryStore.subscribe,
    libraryStore.getSnapshot,
    libraryStore.getServerSnapshot,
  );

  const collectionsContaining = useCallback(
    (type: SavedItemType, id: string) =>
      state.collections.filter((c) => c.items.some((i) => i.type === type && i.id === id)),
    [state.collections],
  );

  return {
    collections: state.collections,
    collectionsContaining,
    createCollection: libraryStore.createCollection,
    getOrCreateCollectionByName: libraryStore.getOrCreateCollectionByName,
    renameCollection: libraryStore.renameCollection,
    deleteCollection: libraryStore.deleteCollection,
    toggleInCollection: libraryStore.toggleInCollection,
    addToCollection: libraryStore.addToCollection,
    removeFromCollection: libraryStore.removeFromCollection,
  };
}
