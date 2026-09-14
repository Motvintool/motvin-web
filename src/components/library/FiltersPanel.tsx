'use client';

import { useMemo, useState } from 'react';
import type { FilterCounts } from '@/hooks/useLibraryStats';
import type { Collection } from '@/lib/api/types';
import { styleLabel, type CategoryConfig } from '@/lib/config/categories';

/**
 * The Filters tab of the right panel — port of renderFilters() in
 * motvin-ui/JS/motvin-icons.js.
 *
 * Five facets: source (checkbox list), style (pill list), size and stroke
 * (sliders with presets), and license (checkbox list). Counts come from
 * /stats, so none of this needs the items themselves.
 */

const SOURCES_COLLAPSED_COUNT = 5;

const SIZE_RANGE = { min: 12, max: 64, step: 1 };
const STROKE_RANGE = { min: 1, max: 2, step: 0.25 };
const STROKE_PRESETS = [1, 1.5, 1.75, 2];

const DEFAULT_SOURCE_ICON = 'icons-basic.svg';

/**
 * Source marks the original showed beside the best-known collections.
 * Returns null when there is no brand mark, which also drives the ordering
 * below — collections with a recognisable logo list first.
 */
function sourceIcon(name: string): string | null {
  const label = name.toLowerCase();
  if (label.includes('hero')) return 'Heroicons.svg';
  if (label.includes('lucide')) return 'Lucide.svg';
  if (label.includes('simple')) return 'icons-brand.svg';
  if (label.includes('phosphor')) return 'Phosphor.svg';
  if (label.includes('tabler')) return 'Tabler Icons.svg';
  return null;
}

/** Falls back through the label when a style has no configured swatch. */
function styleSwatch(config: CategoryConfig, value: string, label: string): string {
  const configured = config.styleSwatches[value];
  if (configured) return configured;
  const lower = label.toLowerCase();
  if (lower.includes('duotone solid')) return 'icons-duotone-solid.svg';
  if (lower.includes('duotone')) return 'icons-duotone.svg';
  if (lower.includes('filled') || lower.includes('solid')) return 'icons-filled.svg';
  if (lower.includes('brands') || lower.includes('bold')) return 'icons-brand.svg';
  return 'icons-basic.svg';
}

type SliderProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  presets: readonly number[];
  presetAttr: string;
  onChange: (value: number) => void;
};

function PanelSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  presets,
  presetAttr,
  onChange,
}: SliderProps) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="mi-rp-section" id={id === 'stroke' ? 'rp-stroke-section' : undefined}>
      <div className="mi-rp-header-row">
        <span className="mi-rp-title">{label}</span>
        <span className="mi-rp-val" id={`${id}-panel-val`}>
          {value}
        </span>
      </div>
      <div className="mi-rp-slider-wrapper">
        <input
          type="range"
          id={`ctrl-${id}-panel`}
          className="mi-rp-slider-invisible"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className="mi-rp-slider-container">
          <div className="mi-rp-slider-track">
            <div
              className="mi-rp-slider-fill"
              id={`${id}-panel-fill`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div
            className="mi-rp-slider-thumb"
            id={`${id}-panel-thumb`}
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>
      <div className={`mi-rp-segmented mi-${id}-quick`}>
        {presets.map((preset) => (
          <div
            key={preset}
            className={`mi-rp-seg-item mi-${id}-q-btn${value === preset ? ' is-active' : ''}`}
            {...{ [presetAttr]: preset }}
            onClick={() => onChange(preset)}
          >
            {preset}
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  config: CategoryConfig;
  collections: Collection[];
  counts: {
    source: FilterCounts;
    style: FilterCounts;
    license: FilterCounts;
  };
  totalItems: number;
  sources: string[];
  styles: string[];
  licenses: string[];
  onSourcesChange: (sources: string[]) => void;
  onStylesChange: (styles: string[]) => void;
  onLicensesChange: (licenses: string[]) => void;
  onClearFilters: () => void;
  size: number;
  onSizeChange: (size: number) => void;
  stroke: number;
  onStrokeChange: (stroke: number) => void;
};

export function FiltersPanel({
  config,
  collections,
  counts,
  totalItems,
  sources,
  styles,
  licenses,
  onSourcesChange,
  onStylesChange,
  onLicensesChange,
  onClearFilters,
  size,
  onSizeChange,
  stroke,
  onStrokeChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');

  const selectedSources = useMemo(() => new Set(sources), [sources]);
  const selectedStyles = useMemo(() => new Set(styles), [styles]);
  const selectedLicenses = useMemo(() => new Set(licenses), [licenses]);

  // Selected sources float to the top, most-recently-chosen first, so a
  // selection doesn't disappear when the list is collapsed to five. The
  // unselected remainder puts collections with a brand mark first — with 243
  // collections, the five visible slots should show names people recognise
  // rather than whichever five the API happened to return first.
  const orderedSources = useMemo(() => {
    const byId = new Map(collections.map((c) => [c.id, c]));
    const chosen = [...sources]
      .reverse()
      .map((id) => byId.get(id))
      .filter(Boolean) as Collection[];
    const rest = collections
      .filter((c) => !selectedSources.has(c.id))
      .sort((a, b) => Number(Boolean(sourceIcon(b.name))) - Number(Boolean(sourceIcon(a.name))));
    return [...chosen, ...rest];
  }, [collections, sources, selectedSources]);

  const filteredSources = useMemo(() => {
    const term = sourceSearch.trim().toLowerCase();
    if (!term) return orderedSources;
    return orderedSources.filter((c) => c.name.toLowerCase().includes(term));
  }, [orderedSources, sourceSearch]);

  const visibleSources = expanded
    ? filteredSources
    : filteredSources.slice(0, SOURCES_COLLAPSED_COUNT);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const licenseValues = useMemo(
    () => Object.keys(counts.license).sort((a, b) => counts.license[b] - counts.license[a]),
    [counts.license],
  );

  const anyFilterActive =
    sources.length > 0 || styles.length > 0 || licenses.length > 0;

  return (
    <div id="rp-tab-filters">
      {/* Sources */}
      <div className="mi-rp-section">
        {(() => {
          const hasFilters = sources.length > 0;
          // Selection-order lookup so the avatars and name-list appear in the
          // order they were picked, matching the reference at :52488.
          const byId = new Map(collections.map((c) => [c.id, c]));
          const selectedCollections = sources
            .map((id) => byId.get(id))
            .filter(Boolean) as Collection[];
          const badgeCount = hasFilters
            ? sources.reduce((sum, id) => sum + (counts.source[id] ?? 0), 0)
            : totalItems;
          // Avatars: default cluster when nothing is picked; the selected
          // sources' own marks when narrowed. Capped at 3 to keep the pill
          // stable-width, same as legacy.
          const avatars = hasFilters
            ? selectedCollections.slice(0, 3).map((c) => ({
                key: c.id,
                src: `/ASSET/Icons/${sourceIcon(c.name) ?? DEFAULT_SOURCE_ICON}`,
              }))
            : config.clusterLogos.slice(0, 3).map((src) => ({ key: src, src }));
          return (
            <div
              className={`mi-rp-source-all${hasFilters ? ' has-filters' : ''}`}
              title={hasFilters ? 'Click to clear filters' : 'Showing all sources'}
              style={{ cursor: hasFilters ? 'pointer' : 'default' }}
              onClick={() => {
                if (hasFilters) onSourcesChange([]);
              }}
            >
              <div className="mi-rp-avatars">
                {avatars.map(({ key, src }, index) => (
                  <div
                    key={key}
                    className="mi-rp-avatar"
                    style={{
                      zIndex: 3 - index,
                      ...(index > 0 ? { marginLeft: '-6px' } : {}),
                    }}
                  >
                    <img src={src} alt="" />
                  </div>
                ))}
              </div>
              {/* When narrowed, wrap the label in the two-span structure the
                  reference uses so the CSS can swap "Phosphor, Heroicons" for
                  "Clear Filters" on hover via .mi-rp-title-hover. When clear,
                  the label is plain text, again matching the reference. */}
              <span className="mi-rp-all-title">
                {hasFilters ? (
                  <>
                    <span className="mi-rp-title-text">
                      {selectedCollections.map((c) => c.name).join(', ')}
                    </span>
                    <span className="mi-rp-title-hover">Clear Filters</span>
                  </>
                ) : (
                  'All Sources'
                )}
              </span>
              <span className="mi-rp-badge-lg">{badgeCount.toLocaleString()}</span>
            </div>
          );
        })()}

        <div
          className="mi-rp-source-search"
          id="source-search-wrapper"
          style={{ position: 'relative' }}
        >
          <svg
            id="source-search-icon"
            className={`mi-source-search-icon${sourceSearch ? ' is-hidden' : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            id="source-search-input"
            className={`mi-source-search${sourceSearch ? ' has-text' : ''}`}
            placeholder="Search sources..."
            value={sourceSearch}
            // Searching a collapsed list would hide matches below the fold.
            onFocus={() => setExpanded(true)}
            onChange={(e) => setSourceSearch(e.target.value)}
          />
          <div
            id="source-search-clear"
            className="mi-source-search-clear"
            style={{ display: sourceSearch ? 'block' : 'none' }}
            onClick={() => setSourceSearch('')}
          >
            &times;
          </div>
        </div>

        <div
          className={`mi-rp-list${expanded && filteredSources.length > SOURCES_COLLAPSED_COUNT ? ' is-scrollable' : ''}`}
          id="filter-source"
        >
          {visibleSources.map((collection) => (
            <div
              key={collection.id}
              className={`mi-rp-item${selectedSources.has(collection.id) ? ' is-active' : ''}`}
              data-val={collection.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onSourcesChange(toggle(sources, collection.id))}
            >
              <div className="mi-rp-check-custom" />
              <div className="mi-rp-item-label">
                <img
                  src={`/ASSET/Icons/${sourceIcon(collection.name) ?? DEFAULT_SOURCE_ICON}`}
                  alt=""
                />
                <span>{collection.name}</span>
              </div>
              <span className="mi-rp-badge">
                {(counts.source[collection.id] ?? collection.total ?? 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {filteredSources.length > SOURCES_COLLAPSED_COUNT && (
          <div
            className="mi-rp-more"
            id="source-more-btn"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              if (expanded) setSourceSearch('');
              setExpanded((open) => !open);
            }}
          >
            <span>
              {expanded
                ? 'Show less'
                : `+${filteredSources.length - SOURCES_COLLAPSED_COUNT} more sources`}
            </span>
          </div>
        )}
      </div>

      <div className="mi-rp-divider" />

      {/* Styles */}
      <div className="mi-rp-section">
        <span className="mi-rp-title">Styles</span>
        <div className="mi-rp-list mi-rp-list-gap4" id="filter-style">
          {config.styles
            // Hide a style the library has none of, unless it's already picked.
            .filter((value) => (counts.style[value] ?? 0) > 0 || selectedStyles.has(value))
            .map((value) => {
              const label = styleLabel(config, value);
              return (
                <div
                  key={value}
                  className={`mi-rp-style-item${selectedStyles.has(value) ? ' is-active' : ''}`}
                  data-val={value}
                  style={{ cursor: 'pointer' }}
                  // Styles are single-select: picking one replaces the rest,
                  // clicking the active one clears it.
                  onClick={() =>
                    onStylesChange(selectedStyles.has(value) ? [] : [value])
                  }
                >
                  <div className="mi-rp-style-icon">
                    <img src={`/ASSET/Icons/${styleSwatch(config, value, label)}`} alt="" />
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="mi-rp-divider" />

      <PanelSlider
        id="size"
        label="Size"
        value={size}
        {...SIZE_RANGE}
        presets={config.panelSizes}
        presetAttr="data-panel-size"
        onChange={onSizeChange}
      />

      <div className="mi-rp-divider" />

      {/* Stroke Width is icons-only and further gated to the Outline style —
          the only style with a stroke to adjust. Solid and Bold are fill
          artwork, 3D keeps its own colours, Duotone/Thin are fixed upstream
          weights, and logos/illustrations don't use strokes at all. Hide
          the slider until the visitor explicitly filters to Outline. */}
      {config.slug === 'icons' && styles.includes('outline') && (
        <>
          <PanelSlider
            id="stroke"
            label="Stroke Width"
            value={stroke}
            {...STROKE_RANGE}
            presets={STROKE_PRESETS}
            presetAttr="data-panel-stroke"
            onChange={onStrokeChange}
          />

          <div className="mi-rp-divider" id="rp-stroke-divider" />
        </>
      )}

      {/* License */}
      <div className="mi-rp-section">
        <span className="mi-rp-title">License</span>
        <div
          className={`mi-rp-license-active${anyFilterActive ? '' : ' is-active'}`}
          id="clear-filters"
          style={{ cursor: 'pointer' }}
          title="Clear all filters"
          onClick={onClearFilters}
        >
          <span>All Licenses</span>
        </div>
        <div className="mi-rp-list" id="filter-license">
          {licenseValues.map((value) => (
            <div
              key={value}
              className={`mi-rp-item${selectedLicenses.has(value) ? ' is-active' : ''}`}
              data-val={value}
              style={{ cursor: 'pointer' }}
              onClick={() => onLicensesChange(toggle(licenses, value))}
            >
              <div className="mi-rp-check-custom" />
              <span className="mi-rp-item-text">{value}</span>
              <img className="mi-rp-chevron" src="/ASSET/Icons/icons-navigate.svg" alt="" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
