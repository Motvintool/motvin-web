'use client';

import type { Density } from '@/hooks/useDisplaySettings';
import type { LibraryItem } from '@/lib/api/normalize';
import type { CategoryConfig } from '@/lib/config/categories';
import { ItemCard } from './ItemCard';

/**
 * Results grid — port of renderGridContent() in motvin-ui/JS/motvin-icons.js.
 *
 * Column count comes from `--mi-grid-columns`, set per category by the route
 * (icons 10, logos 8, illustrations 6 — the one substantial layout difference
 * between the three original stylesheets).
 */

type Props = {
  items: LibraryItem[];
  loading: boolean;
  config: CategoryConfig;
  density: Density;
  globals: { size: number; stroke: number; color: string };
  selectedIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  onOpen: (item: LibraryItem) => void;
  onToggleSelect: (item: LibraryItem) => void;
  onCopy: (item: LibraryItem) => void;
  onToggleSave: (item: LibraryItem) => void;
};

const SKELETON_COUNT = 60;

export function LibraryGrid({
  items,
  loading,
  config,
  density,
  globals,
  selectedIds,
  savedIds,
  onOpen,
  onToggleSelect,
  onCopy,
  onToggleSave,
}: Props) {
  // React 19 + useSearchParams-driven re-renders can leave stale card DOM
  // inside `.mi-empty` when the root element type stays a `<div>` but its
  // className flips from `mi-grid` → `mi-empty`. Force a proper unmount by
  // tagging each variant with a distinct key so the reconciler treats them
  // as separate subtrees.
  if (loading) {
    return (
      <div
        key="grid-loading"
        className={`mi-grid density-${density}`}
        id="icon-grid"
        role="list"
      >
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div className="mi-card is-skeleton" key={`skeleton-${index}`} aria-hidden="true">
            <div className="mi-card-preview" />
            <div className="mi-card-name" />
            <div className="mi-card-source" />
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div key="grid-empty" className="mi-empty" role="status">
        <p>No {config.nounPlural} match your filters.</p>
      </div>
    );
  }

  return (
    <div
      key="grid-items"
      className={`mi-grid density-${density}`}
      id="icon-grid"
      role="list"
    >
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          category={config.slug}
          selected={selectedIds.has(item.id)}
          saved={savedIds.has(item.id)}
          globals={globals}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onCopy={onCopy}
          onToggleSave={onToggleSave}
        />
      ))}
    </div>
  );
}
