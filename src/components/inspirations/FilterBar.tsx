'use client';

import { useState } from 'react';
import { countActiveFilters, toggleValue, type ScreenFilters } from '@/lib/inspirations/filters';
import { INDUSTRY_LABEL, QUICK_INDUSTRIES } from '@/lib/inspirations/taxonomy';
import { FilterPanel } from './FilterPanel';
import { CloseIcon, SlidersIcon } from './Icons';

/**
 * Horizontal quick filters (industries) plus the "Filters" button that opens
 * the full panel. Scrolls sideways on narrow screens instead of wrapping.
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
  const allActive = filters.industries.length === 0;

  return (
    <div className="ins-filterbar">
      <div className="ins-chips" role="group" aria-label="Industry">
        <button
          type="button"
          className={`ins-chip ${allActive ? 'is-active' : ''}`}
          aria-pressed={allActive}
          onClick={() => onChange({ industries: [] })}
        >
          All
        </button>
        {QUICK_INDUSTRIES.map((industry) => {
          const on = filters.industries.includes(industry);
          return (
            <button
              key={industry}
              type="button"
              className={`ins-chip ${on ? 'is-active' : ''}`}
              aria-pressed={on}
              onClick={() => onChange({ industries: toggleValue(filters.industries, industry) })}
            >
              {INDUSTRY_LABEL[industry]}
            </button>
          );
        })}
      </div>

      <div className="ins-filterbar-right">
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
          {panelOpen && <FilterPanel filters={filters} onChange={onChange} onClose={() => setPanelOpen(false)} onClear={onClear} />}
        </div>
      </div>
    </div>
  );
}
