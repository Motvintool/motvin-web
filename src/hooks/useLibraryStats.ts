'use client';

import { useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api/client';
import { totalItems } from '@/lib/api/stats';
import type { Collection, Stats } from '@/lib/api/types';
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
 */

export type FilterCounts = Record<string, number>;

export type LibraryStats = {
  stats: Stats | null;
  /**
   * Collections in the API's own order. The original built its SOURCES array
   * straight from stats.collections and never re-sorted by size; the filter
   * panel does its own ordering.
   */
  collections: Collection[];
  total: number;
  counts: {
    source: FilterCounts;
    style: FilterCounts;
    license: FilterCounts;
    category: FilterCounts;
  };
  loading: boolean;
};

const EMPTY_COUNTS = {
  source: {},
  style: {},
  license: {},
  category: {},
} as const;

export function useLibraryStats(category: Category): LibraryStats {
  const [result, setResult] = useState<LibraryStats>({
    stats: null,
    collections: [],
    total: 0,
    counts: EMPTY_COUNTS,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    getApiClient(category)
      .getStats()
      .then((stats) => {
        if (cancelled) return;
        const collections = [...(stats.collections ?? [])];
        setResult({
          stats,
          collections,
          total: totalItems(stats),
          counts: {
            // The source facet counts by collection, which /stats reports on
            // each collection rather than in a byX map.
            source: Object.fromEntries(
              collections.map((c) => [c.id, c.total ?? 0]),
            ),
            style: stats.byStyle ?? {},
            license: stats.byLicense ?? {},
            category: stats.byCategory ?? {},
          },
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Empty stats rather than a thrown error: the filters degrade to
        // showing no counts, and the grid is unaffected.
        setResult({
          stats: null,
          collections: [],
          total: 0,
          counts: EMPTY_COUNTS,
          loading: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [category]);

  return result;
}
