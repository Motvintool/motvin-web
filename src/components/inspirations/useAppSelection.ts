'use client';

import { useCallback, useState } from 'react';

/**
 * Which apps are checked via each card's selection ring, for the
 * float-collection bar's "create a collection from these" flow. Local to
 * wherever it's used (AppsGrid) rather than a shared store — the Apps page
 * and Explore's app browsing are separate selection sessions, and nothing
 * needs to persist a half-made selection across a navigation.
 *
 * Backed by a Set, which iterates in insertion order — the bar's logo stack
 * relies on that to show the most recently selected apps frontmost.
 */
export function useAppSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, clear };
}
