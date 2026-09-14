'use client';

import type { Density } from '@/hooks/useDisplaySettings';

/**
 * Sort tabs, compare badge and density toggle — port of `.mi-sort-bar`.
 *
 * Note on sorting: the original sorted only the items already on screen, not
 * the whole result set, because sorting happens client-side after the API has
 * returned one page. Sorting 60 of 390,508 icons by name doesn't give you the
 * alphabetical first page — it reorders the page you happen to be on. That
 * behaviour is preserved here; fixing it properly means a sort parameter on the
 * API, which the backend doesn't currently accept.
 */

export const SORT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'relevance', label: 'Relevant' },
  { value: 'popular', label: 'Popular' },
  { value: 'trending', label: 'Trending' },
  { value: 'name-asc', label: 'Name A to Z' },
  { value: 'name-desc', label: 'Name Z to A' },
] as const;

type Props = {
  sort: string;
  onSortChange: (sort: string) => void;
  total: number;
  loading: boolean;
  compareCount: number;
  onOpenCompare: () => void;
  density: Density;
  onDensityChange: (density: Density) => void;
};

export function SortBar({
  sort,
  onSortChange,
  total,
  loading,
  compareCount,
  onOpenCompare,
  density,
  onDensityChange,
}: Props) {
  return (
    <div className="mi-sort-bar">
        <div className="mi-sort-tabs" role="tablist" aria-label="Sort by">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`mi-sort-tab${sort === option.value ? ' is-active' : ''}`}
              data-sort={option.value}
              role="tab"
              aria-selected={sort === option.value}
              onClick={() => onSortChange(option.value)}
            >
              {option.label}
              {option.value === 'all' && (
                <span className="mi-sort-tab-count" aria-hidden="true">
                  {loading ? '—' : total.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mi-sort-bar-right">
          <button
            id="compare-btn"
            className="mi-compare-link"
            onClick={onOpenCompare}
            // Legacy Compare needs 2+ items — one card is nothing to compare.
            disabled={compareCount < 2}
          >
            <div className="mi-compare-inner">
              <img src="/ASSET/Icons/icon-compare.svg" alt="" />
              <span>Compare</span>
            </div>
            <span id="compare-count" className="mi-badge">
              {compareCount}
            </span>
          </button>

          <div className="mi-view-tabs-container">
            <div className="mi-view-tabs" role="tablist" aria-label="View density">
              <button
                className={`mi-view-btn${density === 'detailed' ? ' is-active' : ''}`}
                data-density="detailed"
                title="Detailed"
                aria-pressed={density === 'detailed'}
                onClick={() => onDensityChange('detailed')}
              >
                <img src="/ASSET/Icons/icon-detailed.svg" alt="" />
              </button>
              <button
                className={`mi-view-btn${density === 'compact' ? ' is-active' : ''}`}
                data-density="compact"
                title="Compact"
                aria-pressed={density === 'compact'}
                onClick={() => onDensityChange('compact')}
              >
                <img src="/ASSET/Icons/icon-compact.svg" alt="" />
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}

/** Client-side reorder of the current page — port of sortGridItems(). */
export function sortItems<T extends { name: string; popularity: number; id: string }>(
  items: T[],
  sort: string,
): T[] {
  const list = items.filter(Boolean);
  switch (sort) {
    case 'popular':
      return [...list].sort((a, b) => b.popularity - a.popularity);
    case 'trending':
      // Deterministic pseudo-shuffle weighted by popularity, as in the original.
      return [...list].sort(
        (a, b) =>
          b.popularity * Math.sin(b.id.length) - a.popularity * Math.sin(a.id.length),
      );
    case 'name-asc':
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return [...list].sort((a, b) => b.name.localeCompare(a.name));
    default:
      // "all" and "relevance" keep the API's own ordering.
      return list;
  }
}
