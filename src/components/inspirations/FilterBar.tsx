'use client';

import { useState } from 'react';
import { countActiveFilters, type ScreenFilters } from '@/lib/inspirations/filters';
import { FilterPanel } from './FilterPanel';
import { CloseIcon, SlidersIcon } from './Icons';

/**
 * The screen count and the "Filters" button that opens the full panel.
 *
 * Used as ContentTabs's `right` slot on Explore and Screens, so it renders
 * bare — no wrapping row of its own — and relies on .ins-tabs-right to push
 * itself to the far edge of the tab row it sits inside.
 *
 * This used to also render a row of quick industry chips above the button.
 * They covered one filter dimension (industry) out of several the full panel
 * already exposes, so removing them drops a shortcut, not a capability — every
 * filter they offered is still reachable from Filters.
 */
export function FilterBar({
  filters,
  onChange,
  onClear,
  total,
}: {
  filters: ScreenFilters;
  onChange: (patch: Partial<ScreenFilters>) => void;
  onClear: () => void;
  total: number | null;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const active = countActiveFilters(filters);

  return (
    <div className="ins-tabs-right">
      {total !== null && (
        <span className="ins-filterbar-count" aria-live="polite">
          {total.toLocaleString()} {total === 1 ? 'screen' : 'screens'}
        </span>
      )}
      {active > 0 && (
        <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={onClear}>
          <CloseIcon size={13} />
          Clear
        </button>
      )}
      <div className="ins-popwrap">
        <button
          type="button"
          className={`ins-btn ins-btn--sm ${active ? 'is-active' : ''}`}
          aria-expanded={panelOpen}
          aria-haspopup="dialog"
          onClick={() => setPanelOpen((o) => !o)}
        >
          <SlidersIcon size={14} />
          Filters
          {active > 0 && <span className="ins-badge">{active}</span>}
        </button>
        {panelOpen && (
          <FilterPanel
            filters={filters}
            onChange={onChange}
            onClose={() => setPanelOpen(false)}
            onClear={onClear}
          />
        )}
      </div>
    </div>
  );
}
