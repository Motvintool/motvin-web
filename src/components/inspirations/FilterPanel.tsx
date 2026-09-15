'use client';

import { useEffect, useRef } from 'react';
import { toggleValue, type ScreenFilters } from '@/lib/inspirations/filters';
import {
  INDUSTRY_LABEL,
  PLATFORM_LABEL,
  SCREEN_TYPE_LABEL,
  STYLE_LABEL,
} from '@/lib/inspirations/taxonomy';
import type { Industry, Platform, ScreenType, Style } from '@/lib/inspirations/types';
import { CloseIcon } from './Icons';
import { useMeta } from './useMeta';

/**
 * Full filter panel: platform, screen type, industry, style.
 *
 * Each group lists only the values present in the store, so no filter leads to
 * an empty result set. Changes apply immediately to the URL and the gallery
 * responds live.
 */

function FilterGroup<T extends string>({
  title,
  values,
  labels,
  selected,
  onToggle,
}: {
  title: string;
  values: readonly T[];
  labels: Record<string, string>;
  selected: T[];
  onToggle: (v: T) => void;
}) {
  if (values.length === 0) return null;
  return (
    <fieldset className="ins-filter-group">
      <legend className="ins-filter-legend">{title}</legend>
      <div className="ins-filter-options">
        {values.map((v) => {
          const on = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              className={`ins-chip ins-chip--sm ${on ? 'is-active' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(v)}
            >
              {labels[v] ?? v}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FilterPanel({
  filters,
  onChange,
  onClose,
  onClear,
}: {
  filters: ScreenFilters;
  onChange: (patch: Partial<ScreenFilters>) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const meta = useMeta();

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const root = ref.current;
      if (!root) return;
      // The trigger button is the popwrap's other child — clicks there toggle.
      if (root.parentElement?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const empty =
    meta.taxonomy.platforms.length === 0 &&
    meta.taxonomy.screenTypes.length === 0 &&
    meta.taxonomy.industries.length === 0 &&
    meta.taxonomy.styles.length === 0;

  return (
    <div className="ins-popover ins-popover--right ins-filter-panel" role="dialog" aria-label="Filters" ref={ref}>
      <div className="ins-filter-head">
        <span className="ins-popover-title">Filters</span>
        <span className="ins-spacer" />
        <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={onClear}>
          Clear all
        </button>
        <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Close filters" onClick={onClose}>
          <CloseIcon size={15} />
        </button>
      </div>

      {empty ? (
        <p className="ins-popover-empty">Nothing to filter yet — the library has no screens.</p>
      ) : (
        <>
          <FilterGroup
            title="Platform"
            values={meta.taxonomy.platforms as Platform[]}
            labels={PLATFORM_LABEL}
            selected={filters.platforms}
            onToggle={(v) => onChange({ platforms: toggleValue(filters.platforms, v) })}
          />
          <FilterGroup
            title="Screen type"
            values={meta.taxonomy.screenTypes as ScreenType[]}
            labels={SCREEN_TYPE_LABEL}
            selected={filters.screenTypes}
            onToggle={(v) => onChange({ screenTypes: toggleValue(filters.screenTypes, v) })}
          />
          <FilterGroup
            title="Industry"
            values={meta.taxonomy.industries as Industry[]}
            labels={INDUSTRY_LABEL}
            selected={filters.industries}
            onToggle={(v) => onChange({ industries: toggleValue(filters.industries, v) })}
          />
          <FilterGroup
            title="Style"
            values={meta.taxonomy.styles as Style[]}
            labels={STYLE_LABEL}
            selected={filters.styles}
            onToggle={(v) => onChange({ styles: toggleValue(filters.styles, v) })}
          />
        </>
      )}
    </div>
  );
}
