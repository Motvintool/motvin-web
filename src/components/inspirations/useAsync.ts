'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSeed } from './SeedProvider';

/**
 * Minimal async-data hook for the service layer. `key` identifies the request:
 * when it changes the previous result is discarded and a new load starts.
 * Late responses from superseded requests are ignored, and a result is only
 * surfaced when its key matches the current one.
 *
 * A page the server seeded (SeedProvider) starts from its seed for this key —
 * already loaded, in the server's HTML too — and still asks for the fresh
 * answer once mounted.
 */
export function useAsync<T>(load: () => Promise<T>, key: string) {
  const seed = useSeed<T>(key);
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(() =>
    seed === undefined ? null : { key, data: seed, error: null },
  );
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);

  // Keep the latest loader without re-running the fetch on every render.
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key, data: null, error: err instanceof Error ? err.message : 'Failed to load' });
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const current = result && result.key === key ? result : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    reload,
  };
}
