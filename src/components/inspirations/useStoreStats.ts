import { useEffect, useState } from 'react';
import type { Platform } from '@/lib/inspirations/types';
import type { StoreStats } from '@/lib/inspirations/storeStats';

const cache = new Map<string, StoreStats | null>();
const pending = new Map<string, Promise<StoreStats | null>>();

/**
 * An iOS app's store numbers outside a component (the app filters' rating), through the same cache
 * the hook below fills, so a card and a filter never look the same app up twice.
 */
export function loadStoreStats(name: string): Promise<StoreStats | null> {
  const key = `ios:${name}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const promise = fetch(`/api/store-stats?name=${encodeURIComponent(name)}&platform=ios`)
    .then((r) => (r.ok ? (r.json() as Promise<StoreStats>) : null))
    .catch(() => null)
    .then((s) => {
      cache.set(key, s);
      pending.delete(key);
      return s;
    });
  pending.set(key, promise);
  return promise;
}

/** Told when an app's numbers were read again (an upload refreshed its rank), so pages showing it re-read them. */
const refreshed = typeof window !== 'undefined' ? new EventTarget() : null;

/** Drops what this page holds for an app, and has every badge showing it read it again. */
export function forgetStoreStats(name: string) {
  cache.delete(`ios:${name}`);
  refreshed?.dispatchEvent(new CustomEvent('refresh', { detail: name }));
}

/**
 * Live store numbers for an app (see storeStats.ts), fetched once per app and
 * shared by everything on the page that wants them. `stats` is undefined while
 * loading and null when the store has nothing; `store` is null for Web Apps and Webs.
 */
export function useStoreStats(name: string, platform: Platform) {
  // No name yet (the app still loading): nothing to look up.
  const store: 'ios' | null = platform === 'ios' && name ? 'ios' : null;
  const key = `${store}:${name}`;
  const [stats, setStats] = useState<StoreStats | null | undefined>(cache.get(key));
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!refreshed) return;
    const onRefresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail === name) setGeneration((n) => n + 1);
    };
    refreshed.addEventListener('refresh', onRefresh);
    return () => refreshed.removeEventListener('refresh', onRefresh);
  }, [name]);

  useEffect(() => {
    if (!store) return;
    if (cache.has(key)) {
      setStats(cache.get(key));
      return;
    }
    const ctl = new AbortController();
    // Re-read after an upload refreshed the rank: past the browser's cache too.
    fetch(`/api/store-stats?name=${encodeURIComponent(name)}&platform=${store}`, { signal: ctl.signal, ...(generation ? { cache: 'reload' as const } : {}) })
      .then((r) => (r.ok ? (r.json() as Promise<StoreStats>) : null))
      .catch(() => null)
      .then((s) => {
        if (ctl.signal.aborted) return;
        cache.set(key, s);
        setStats(s);
      });
    return () => ctl.abort();
  }, [key, name, store, generation]);

  return { store, stats };
}
