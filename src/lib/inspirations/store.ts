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

const SAVED_KEY = 'motvin-inspirations-saved';
const COLLECTIONS_KEY = 'motvin-inspirations-collections';
const LOCAL_USER = 'local';

export type LibraryState = {
  saved: SavedItem[];
  collections: Collection[];
};

const EMPTY: LibraryState = { saved: [], collections: [] };

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
    const saved = safeParse<SavedItem[]>(window.localStorage.getItem(SAVED_KEY), []);
    const collections = safeParse<Collection[]>(window.localStorage.getItem(COLLECTIONS_KEY), []);
    state = { saved, collections };
  } catch {
    state = EMPTY;
  }
}

function persist() {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
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

export const libraryStore = {
  subscribe(listener: () => void) {
    hydrate();
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SAVED_KEY || e.key === COLLECTIONS_KEY) {
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

  isSaved(type: SavedItemType, id: string): boolean {
    return state.saved.some((s) => s.type === type && s.id === id);
  },

  toggleSaved(type: SavedItemType, id: string): boolean {
    hydrate();
    const exists = libraryStore.isSaved(type, id);
    state = {
      ...state,
      saved: exists
        ? state.saved.filter((s) => !(s.type === type && s.id === id))
        : [{ type, id, addedAt: new Date().toISOString() }, ...state.saved],
    };
    emit();
    return !exists;
  },

  markViewed(type: SavedItemType, id: string) {
    hydrate();
    const idx = state.saved.findIndex((s) => s.type === type && s.id === id);
    if (idx === -1) return;
    const next = [...state.saved];
    next[idx] = { ...next[idx], viewedAt: new Date().toISOString() };
    state = { ...state, saved: next };
    emit();
  },

  createCollection(name: string): Collection {
    hydrate();
    const collection: Collection = {
      id: newId('col'),
      userId: LOCAL_USER,
      name: name.trim() || 'Untitled',
      items: [],
      createdAt: new Date().toISOString(),
    };
    state = { ...state, collections: [collection, ...state.collections] };
    emit();
    return collection;
  },

  renameCollection(id: string, name: string) {
    hydrate();
    state = {
      ...state,
      collections: state.collections.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)),
    };
    emit();
  },

  deleteCollection(id: string) {
    hydrate();
    state = { ...state, collections: state.collections.filter((c) => c.id !== id) };
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
