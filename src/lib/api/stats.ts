import type { Collection, Stats } from './types';

/**
 * Total number of items in a library.
 *
 * `/api/logos/stats` doesn't return a `total` field, while `/api/icons/stats`
 * and `/api/illustrations/stats` do. The static site's getTotalIconCount()
 * handled that with `stats.total || ICONS.length`, so on the logos page it fell
 * through to the length of the *currently loaded page* — reporting 60 logos
 * instead of 10,582.
 *
 * Summing the per-collection totals gives the right answer for all three:
 * verified against /search, which reports 390,508 / 10,582 / 678 respectively.
 */
export function totalItems(stats: Stats | null | undefined): number {
  if (!stats) return 0;
  if (typeof stats.total === 'number') return stats.total;
  return (stats.collections ?? []).reduce((sum, c) => sum + (c.total ?? 0), 0);
}

/** Collections sorted by size, largest first — the order the source list uses. */
export function collectionsBySize(stats: Stats | null | undefined) {
  return [...(stats?.collections ?? [])].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
}

export type FilterCounts = Record<string, number>;

/** What the library page needs from /stats, shaped once for every consumer. */
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

export const EMPTY_LIBRARY_STATS: LibraryStats = {
  stats: null,
  collections: [],
  total: 0,
  counts: { source: {}, style: {}, license: {}, category: {} },
  loading: false,
};

/**
 * Collections dropped everywhere — sidebar counts, filter chips, source
 * pickers, and the raw stats payload. Kept in sync with `HIDDEN_SOURCES` in
 * lib/api/normalize.ts, which drops the same sources from the items feed.
 */
const HIDDEN_SOURCES = new Set(['ira']);

/** Shapes a /stats response for the page. Shared by useLibraryStats and the server render. */
export function summarizeStats(stats: Stats): LibraryStats {
  const isHidden = (c: Collection) => HIDDEN_SOURCES.has(String(c.id ?? '').toLowerCase());
  const collections = (stats.collections ?? []).filter((c) => !isHidden(c));
  const hiddenTotal = (stats.collections ?? []).reduce(
    (sum, c) => (isHidden(c) ? sum + (c.total ?? 0) : sum),
    0,
  );
  return {
    stats: { ...stats, collections },
    collections,
    // Deduct the hidden collections' items so the total in the header matches
    // what the grid actually shows.
    total: totalItems(stats) - hiddenTotal,
    counts: {
      // The source facet counts by collection, which /stats reports on each
      // collection rather than in a byX map.
      source: Object.fromEntries(collections.map((c) => [c.id, c.total ?? 0])),
      style: stats.byStyle ?? {},
      license: stats.byLicense ?? {},
      category: stats.byCategory ?? {},
    },
    loading: false,
  };
}
