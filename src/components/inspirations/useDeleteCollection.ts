'use client';

import { useCallback } from 'react';
import { libraryStore } from '@/lib/inspirations/store';
import { useToast } from './Toast';
import { useLibrary } from './useLibrary';

/**
 * Deletes a collection (after the caller has asked) and says so with an Undo
 * that puts it back, everything in it, where it was in the list. Shared by
 * every place a collection can be deleted, so they all behave alike.
 */
export function useDeleteCollection() {
  const { deleteCollection, restoreCollection } = useLibrary();
  const { show } = useToast();

  return useCallback(
    (id: string) => {
      const all = libraryStore.getSnapshot().collections;
      const index = all.findIndex((c) => c.id === id);
      const target = all[index];
      if (!target) return;
      deleteCollection(id);
      show('Collection deleted', {
        label: 'Undo',
        onClick: () => {
          restoreCollection(target, index);
          show(`Restored “${target.name}”`);
        },
      });
    },
    [deleteCollection, restoreCollection, show],
  );
}
