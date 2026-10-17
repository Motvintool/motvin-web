'use client';

import { useCallback } from 'react';
import { libraryStore } from '@/lib/inspirations/store';
import type { CollectionItem } from '@/lib/inspirations/types';
import { useToast } from './Toast';
import { useLibrary } from './useLibrary';

/** Which saved items to take out: in this collection, those `match` picks. */
export type RemoveTarget = { collectionId: string; match: (item: CollectionItem) => boolean };

/**
 * Takes items out of collections and says so with an Undo that puts each
 * back where it was, with its original save date. Shared by every place an
 * item can be removed (a collection's ×, unsaving, the collection menu), so
 * they all behave alike.
 */
export function useRemoveWithUndo() {
  const { removeFromCollection, restoreItems } = useLibrary();
  const { show } = useToast();

  return useCallback(
    (targets: RemoveTarget[], message = 'Removed from collection') => {
      const collections = libraryStore.getSnapshot().collections;
      const entries = targets.flatMap(({ collectionId, match }) => {
        const collection = collections.find((c) => c.id === collectionId);
        return (collection?.items ?? []).flatMap((item, index) => (match(item) ? [{ collectionId, item, index }] : []));
      });
      if (!entries.length) return;
      for (const { collectionId, item } of entries) removeFromCollection(collectionId, item);
      show(message, {
        label: 'Undo',
        onClick: () => {
          restoreItems(entries);
          show('Restored');
        },
      });
    },
    [removeFromCollection, restoreItems, show],
  );
}

/** Matches one item by its type and id. */
export const sameItem = (type: CollectionItem['type'], id: string) => (item: CollectionItem) => item.type === type && item.id === id;
