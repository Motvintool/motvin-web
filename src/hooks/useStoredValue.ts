'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

/**
 * Reads a localStorage-backed value on the client without a post-mount
 * setState.
 *
 * The obvious approach — `useState(fallback)` plus an effect that reads storage
 * and sets state — renders twice on every visit and trips React's
 * cascading-render rule. useSyncExternalStore is the primitive built for this:
 * the server snapshot is the fallback, the client snapshot is the stored value,
 * and React reconciles the two during hydration.
 *
 * `parse` maps the raw string to the value and must reject anything invalid by
 * returning the fallback. It MUST return a primitive — useSyncExternalStore
 * compares snapshots by identity, so returning a fresh object each call would
 * loop forever.
 *
 * Returns the value plus `refresh`, which callers invoke after writing to
 * storage themselves; the `storage` event only fires for other tabs, never the
 * one that made the write.
 */
export function useStoredValue<T extends string | number | boolean | null>(
  key: string,
  fallback: T,
  parse: (raw: string | null) => T,
): [T, () => void] {
  const [version, setVersion] = useState(0);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onStoreChange();
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    // Referenced so this callback's identity changes after refresh(), which is
    // what makes React re-read the snapshot.
    void version;
    try {
      return parse(window.localStorage.getItem(key));
    } catch {
      return fallback;
    }
  }, [key, fallback, parse, version]);

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return [value, refresh];
}

/** Writes to localStorage, ignoring failures (private mode, blocked storage). */
export function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted; the caller's in-memory state still applies for this visit.
  }
}
