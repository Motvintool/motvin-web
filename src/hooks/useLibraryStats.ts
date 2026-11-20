'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api/client';
import { EMPTY_LIBRARY_STATS, summarizeStats, type LibraryStats } from '@/lib/api/stats';
import type { Category } from '@/lib/config/categories';

/**
 * Library statistics — port of motvin-ui/JS/stats-bridge.js.
 *
 * One call to /stats supplies every filter count in the right panel, which is
 * what keeps the page from having to load 390,000 icons to know how many are
 * MIT-licensed.
 *
 * Loads in parallel with the grid, as the original did: the grid only needs
 * items, the counts only decorate the filters, so neither waits on the other.
 *
 * `initial` is the server render's copy (see lib/api/initialLibrary.ts); when
 * it's there the page already has its counts and nothing is fetched.
 */

export type { FilterCounts, LibraryStats } from '@/lib/api/stats';

export function useLibraryStats(category: Category, initial?: LibraryStats | null): LibraryStats {
  const [result, setResult] = useState<LibraryStats>(
    initial ?? { ...EMPTY_LIBRARY_STATS, loading: true },
  );
  const hasInitial = Boolean(initial);

  useEffect(() => {
    if (hasInitial) return;
    let cancelled = false;

    getApiClient(category)
      .getStats()
      .then((stats) => {
        if (!cancelled) setResult(summarizeStats(stats));
      })
      .catch(() => {
        // Empty stats rather than a thrown error: the filters degrade to
        // showing no counts, and the grid is unaffected.
        if (!cancelled) setResult(EMPTY_LIBRARY_STATS);
      });

    return () => {
      cancelled = true;
    };
  }, [category, hasInitial]);

  return result;
}
