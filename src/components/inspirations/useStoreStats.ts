import { useEffect, useState } from 'react';
import type { Platform } from '@/lib/inspirations/types';
import type { StoreStats } from '@/lib/inspirations/storeStats';

const cache = new Map<string, StoreStats | null>();

/**
 * Live store numbers for an app (see storeStats.ts), fetched once per app and
 * shared by everything on the page that wants them. `stats` is undefined while
 * loading and null when the store has nothing; `store` is null for Web.
 */
export function useStoreStats(name: string, platform: Platform) {
  const store: 'ios' | 'android' | null = platform === 'android' ? 'android' : platform === 'ios' ? 'ios' : null;
  const key = `${store}:${name}`;
  const [stats, setStats] = useState<StoreStats | null | undefined>(cache.get(key));

  useEffect(() => {
    if (!store) return;
    if (cache.has(key)) {
      setStats(cache.get(key));
      return;
    }
    const ctl = new AbortController();
    fetch(`/api/store-stats?name=${encodeURIComponent(name)}&platform=${store}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<StoreStats>) : null))
      .catch(() => null)
      .then((s) => {
        if (ctl.signal.aborted) return;
        cache.set(key, s);
        setStats(s);
      });
    return () => ctl.abort();
  }, [key, name, store]);

  return { store, stats };
}
