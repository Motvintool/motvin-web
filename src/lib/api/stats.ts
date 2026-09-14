import type { Stats } from './types';

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
