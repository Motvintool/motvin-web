import type { Collection, CollectionItem, SavedItem, SavedItemType } from './types';

/**
 * Saved items + collections, persisted in localStorage.
 *
 * A tiny external store (subscribe/getSnapshot) rather than React state so
 * every SaveButton on a 100-card page reads the same snapshot without prop
 * drilling, and so the snapshot identity is stable between writes — which is
 * what `useSyncExternalStore` needs. When accounts land, `persist`/`hydrate`
 * become the sync points with the user's remote library.
 */

const COLLECTIONS_KEY = 'motvin-inspirations-collections';
const LOCAL_USER = 'local';

/**
 * The board a plain "Save" (the bookmark button — no board chosen) lands in.
 * `/inspirations/saved`, the flat list that used to show these, is gone —
 * Collections is the only place anything saved is ever visible, so a bookmark
 * has to land somewhere inside it, not in a separate pool nothing renders.
 * Auto-created on first use; reused by matching this exact name afterwards.
 */
export const DEFAULT_COLLECTION_NAME = 'My Favourite Collection';

export type LibraryState = {
  collections: Collection[];
};

const EMPTY: LibraryState = { collections: [] };

let state: LibraryState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const collections = safeParse<Collection[]>(window.localStorage.getItem(COLLECTIONS_KEY), []);
    state = { collections };
  } catch {
    state = EMPTY;
  }
}

function persist() {
  try {
    window.localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(state.collections));
  } catch {
    // Storage unavailable — in-memory state still applies for this visit.
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * The given name, or "<name> copy", "<name> copy 2", … when another board
 * already has it (letter case aside) — two boards named alike are
 * indistinguishable in the grid, so an intentionally-NEW or renamed board
 * (createCollection, renameCollection) never reuses a name; only
 * `getOrCreateCollectionByName`'s "same name = same board" merge matches an
 * existing one. `excludeId` skips one collection's own current name when
 * renaming, so renaming "Foo" to "Foo" isn't a collision with itself.
 */
function uniqueCollectionName(name: string, excludeId?: string): string {
  const base = name.trim() || 'Untitled';
  const taken = new Set(state.collections.filter((c) => c.id !== excludeId).map((c) => c.name.trim().toLowerCase()));
  const free = (candidate: string) => !taken.has(candidate.toLowerCase());
  if (free(base)) return base;
  if (free(`${base} copy`)) return `${base} copy`;
  let n = 2;
  while (!free(`${base} copy ${n}`)) n += 1;
  return `${base} copy ${n}`;
}

/**
 * Finds a board by exact name, creating it (in-memory, on `state` directly —
 * the caller emits) if none matches yet. Saving into a collection is always
 * "the board called X" rather than "a new board" — the float-collection bar
 * pre-fills the default board's name specifically so leaving it untouched
 * lands back in the SAME board, not a lookalike duplicate every time it's
 * submitted unchanged; typing an existing board's exact name does the same.
 */
function getOrCreateCollectionByName(name: string): Collection {
  const trimmed = name.trim() || 'Untitled';
  const existing = state.collections.find((c) => c.name === trimmed);
  if (existing) return existing;
  const collection: Collection = {
    id: newId('col'),
    userId: LOCAL_USER,
    name: trimmed,
    items: [],
    createdAt: new Date().toISOString(),
  };
  state = { ...state, collections: [collection, ...state.collections] };
  return collection;
}

export const libraryStore = {
  subscribe(listener: () => void) {
    hydrate();
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === COLLECTIONS_KEY) {
        hydrated = false;
        hydrate();
        listener();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },

  getSnapshot(): LibraryState {
    hydrate();
    return state;
  },

  getServerSnapshot(): LibraryState {
    return EMPTY;
  },


  createCollection(name: string): Collection {
    hydrate();
    const collection: Collection = {
      id: newId('col'),
      userId: LOCAL_USER,
      name: uniqueCollectionName(name),
      items: [],
      createdAt: new Date().toISOString(),
    };
    state = { ...state, collections: [collection, ...state.collections] };
    emit();
    return collection;
  },

  /**
   * Saving into a NAMED board — the float-collection bar's flow — reuses an
   * existing board with that exact name instead of always minting a new one,
   * so submitting the pre-filled default name twice lands both saves in the
   * one board, not two identically-named lookalikes. `createCollection`
   * above stays a plain always-new constructor for the explicit "+ New
   * collection" affordance, which should make a fresh board every time.
   */
  getOrCreateCollectionByName(name: string): Collection {
    hydrate();
    const before = state.collections;
    const collection = getOrCreateCollectionByName(name);
    // The helper only touches `state` when it actually creates a new board;
    // reusing an existing one is a no-op read, so skip the write/notify then.
    if (state.collections !== before) emit();
    return collection;
  },

  /** Returns the name it ended up with ("Foo copy" when "Foo" was taken). */
  renameCollection(id: string, name: string): string | undefined {
    hydrate();
    const trimmed = name.trim();
    let finalName: string | undefined;
    state = {
      ...state,
      collections: state.collections.map((c) => {
        if (c.id !== id) return c;
        finalName = trimmed ? uniqueCollectionName(trimmed, id) : c.name;
        return { ...c, name: finalName };
      }),
    };
    emit();
    return finalName;
  },

  deleteCollection(id: string) {
    hydrate();
    state = { ...state, collections: state.collections.filter((c) => c.id !== id) };
    emit();
  },

  /**
   * Undo for removing items: each goes back into its collection at the place
   * it had, with its original save date. One already back, or whose
   * collection has since gone, is skipped.
   */
  restoreItems(entries: { collectionId: string; item: CollectionItem; index: number }[]) {
    hydrate();
    let changed = false;
    state = {
      ...state,
      collections: state.collections.map((c) => {
        const mine = entries.filter((e) => e.collectionId === c.id).sort((a, b) => a.index - b.index);
        if (!mine.length) return c;
        const items = [...c.items];
        for (const { item, index } of mine) {
          if (items.some((i) => i.type === item.type && i.id === item.id)) continue;
          items.splice(Math.min(index, items.length), 0, item);
          changed = true;
        }
        return { ...c, items };
      }),
    };
    if (changed) emit();
  },

  /**
   * Undo for deleteCollection: puts the very collection back, everything in
   * it, at the place it had in the list. Nothing happens if it's back already.
   */
  restoreCollection(collection: Collection, index: number) {
    hydrate();
    if (state.collections.some((c) => c.id === collection.id)) return;
    const collections = [...state.collections];
    collections.splice(Math.max(0, Math.min(index, collections.length)), 0, collection);
    state = { ...state, collections };
    emit();
  },

  toggleInCollection(collectionId: string, item: Omit<CollectionItem, 'addedAt'>): boolean {
    hydrate();
    let added = false;
    state = {
      ...state,
      collections: state.collections.map((c) => {
        if (c.id !== collectionId) return c;
        const exists = c.items.some((i) => i.type === item.type && i.id === item.id);
        added = !exists;
        return {
          ...c,
          items: exists
            ? c.items.filter((i) => !(i.type === item.type && i.id === item.id))
            : [{ ...item, addedAt: new Date().toISOString() }, ...c.items],
        };
      }),
    };
    emit();
    return added;
  },

  addToCollection(collectionId: string, item: Omit<CollectionItem, 'addedAt'>): boolean {
    hydrate();
    let added = false;
    state = {
      ...state,
      collections: state.collections.map((c) => {
        if (c.id !== collectionId) return c;
        const exists = c.items.some((i) => i.type === item.type && i.id === item.id);
        if (exists) return c;
        added = true;
        return {
          ...c,
          items: [{ ...item, addedAt: new Date().toISOString() }, ...c.items],
        };
      }),
    };
    if (added) emit();
    return added;
  },

  removeFromCollection(collectionId: string, item: Omit<CollectionItem, 'addedAt'>): boolean {
    hydrate();
    let removed = false;
    state = {
      ...state,
      collections: state.collections.map((c) => {
        if (c.id !== collectionId) return c;
        const exists = c.items.some((i) => i.type === item.type && i.id === item.id);
        if (!exists) return c;
        removed = true;
        return {
          ...c,
          items: c.items.filter((i) => !(i.type === item.type && i.id === item.id)),
        };
      }),
    };
    if (removed) emit();
    return removed;
  },

  /** Current state, for a sync layer to read what to push remotely. */
  getState(): LibraryState {
    hydrate();
    return state;
  },

  /**
   * Replaces the whole state — e.g. after merging in a signed-in user's
   * remote library — and notifies subscribers same as any other write.
   */
  replaceState(next: LibraryState) {
    state = next;
    emit();
  },
};
