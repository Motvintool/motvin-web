'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { NO_RECOLOR } from '@/hooks/useDisplaySettings';
import type { CategoryConfig } from '@/lib/config/categories';

/**
 * Search pill, category dropdown and the global recolor control — port of
 * `.mi-toolbar` in the three library pages.
 *
 * The search input is uncontrolled-with-a-mirror: it holds its own draft so
 * typing stays responsive, and only commits to the URL after a pause. Without
 * the debounce every keystroke would be a router navigation and an API call.
 */

const SEARCH_DEBOUNCE_MS = 300;

const RECOLOR_SWATCHES = [
  { color: '#0F1116', title: 'Near Black' },
  { color: '#5C4AE4', title: 'Accent' },
  { color: '#2563EB', title: 'Blue' },
  { color: '#16A34A', title: 'Green' },
  { color: '#DC2626', title: 'Red' },
  { color: '#D97706', title: 'Amber' },
  { color: '#6B7280', title: 'Grey' },
  { color: '#FFFFFF', title: 'White', border: true },
];

/**
 * Below this width the pill leaves the input ~190px wide, which truncates the
 * full-count placeholder — so it falls back to a short label.
 */
const COMPACT_PLACEHOLDER_WIDTH = 560;

type Props = {
  config: CategoryConfig;
  /** Library size, shown in the placeholder. */
  totalItems: number;
  query: string;
  onQueryChange: (query: string) => void;
  categories: string[];
  /** Per-category counts — used to render the badge on each menu item. */
  categoryCounts?: Record<string, number>;
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  color: string;
  onColorChange: (color: string) => void;
  onColorReset: () => void;
};

export function LibraryToolbar({
  config,
  totalItems,
  query,
  onQueryChange,
  categories,
  categoryCounts = {},
  activeCategory,
  onCategoryChange,
  color,
  onColorChange,
  onColorReset,
}: Props) {
  const [draft, setDraft] = useState(query);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [recolorOpen, setRecolorOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(color === NO_RECOLOR ? '' : color);
  // Starts compact so the server render doesn't assume a width; the effect
  // below corrects it before paint on wider viewports.
  const [compact, setCompact] = useState(true);

  const catRef = useRef<HTMLDivElement>(null);
  const recolorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pillActive, setPillActive] = useState(false);

  // Keep the draft in step when the query changes from elsewhere — a back
  // navigation, or the category dropdown clearing it. This is React's
  // adjust-state-during-render pattern: state, not a ref, so the re-render
  // happens before anything is painted.
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    if (draft !== query) setDraft(query);
  }

  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => onQueryChange(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, query, onQueryChange]);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${COMPACT_PLACEHOLDER_WIDTH}px)`);
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  /**
   * Toggle `.is-scrolled` on the toolbar wrapper once the main column scrolls
   * past 8 px. That class is defined in library.css:926 (and 4482 for mobile)
   * and adds vertical padding so the sticky toolbar sits away from both the
   * top of the viewport and the scrolled content. Port of the handler at
   * icons.html:1938-1948.
   */
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.mi-main');
    const wrap = document.querySelector<HTMLElement>('.mi-toolbar-wrapper');
    if (!main || !wrap) return;
    const onScroll = () => {
      wrap.classList.toggle('is-scrolled', main.scrollTop > 8);
    };
    // Reflect the current scroll position on mount so a mid-scroll navigation
    // doesn't paint one frame at the default padding.
    onScroll();
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  /**
   * Scroll `.mi-main` so the toolbar sits at the top of the viewport — port of
   * revealSearchToolbar() in motvin-icons.js:2983-2989. Called on search-pill
   * click and on input focus.
   */
  const revealSearchToolbar = useCallback(() => {
    const main = document.querySelector<HTMLElement>('.mi-main');
    const wrap = wrapperRef.current;
    if (!main || !wrap) return;
    main.scrollTo({ top: wrap.offsetTop, behavior: 'smooth' });
  }, []);

  /**
   * Outside-pointerdown drops `.is-active` from the pill — matches
   * motvin-icons.js:2999-3002. Uses pointerdown so it fires before click,
   * which lets a fresh focus on a different pill area still register.
   */
  useEffect(() => {
    if (!pillActive) return;
    const onDown = (e: PointerEvent) => {
      if (!pillRef.current?.contains(e.target as Node)) setPillActive(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pillActive]);

  // ⌘K / Ctrl+K focuses search, as the shortcut hint in the pill advertises.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!catRef.current?.contains(target)) setCatMenuOpen(false);
      if (!recolorRef.current?.contains(target)) setRecolorOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onQueryChange(draft);
  };

  const applyHex = (value: string) => {
    setHexDraft(value);
    // Only commit a complete hex, so the grid doesn't flicker through
    // "#2", "#25", "#256"… as it's typed.
    if (/^#[0-9a-f]{6}$/i.test(value)) onColorChange(value);
  };

  const recolorActive = color !== NO_RECOLOR;
  const capitalizedNoun =
    config.nounPlural.charAt(0).toUpperCase() + config.nounPlural.slice(1);

  return (
    // Turbopack's CSS pipeline strips `backdrop-filter` off this specific rule
    // (verified: same property survives on .mi-canvas-tool, .mi-pagination-bar,
    // etc.), so we set it inline to force the glass effect that library.css:921
    // is supposed to provide.
    <div
      className="mi-toolbar-wrapper"
      ref={wrapperRef}
      style={{
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div className="mi-toolbar">
        <div
          ref={pillRef}
          className={`mi-search-pill${pillActive ? ' is-active' : ''}`}
          style={{ position: 'relative' }}
          onClickCapture={(e) => {
            // Legacy uses capture so the click still fires even when the
            // target is a nested control. Clicking the clear button is
            // exempt — it needs its own onClick to still run.
            if ((e.target as HTMLElement).closest('#search-clear')) return;
            setPillActive(true);
            revealSearchToolbar();
          }}
        >
          {/* Category dropdown */}
          <div
            className="mi-cat-dropdown"
            id="cat-dropdown"
            role="button"
            tabIndex={0}
            aria-haspopup="listbox"
            aria-expanded={catMenuOpen}
            ref={catRef}
            onClick={() => setCatMenuOpen((open) => !open)}
          >
            <span className="mi-cat-dropdown-label">Category:</span>
            <span className="mi-cat-dropdown-val" id="cat-dropdown-val">
              {activeCategory ?? `All ${capitalizedNoun}`}
            </span>
            <img src="/ASSET/Icons/icon-down-arrow.svg" className="mi-cat-icon" alt="" />
          </div>

          <div
            className={`mi-category-menu${catMenuOpen ? ' is-open' : ''}`}
            id="cat-menu"
            role="listbox"
          >
            <div className="mi-category-menu-inner" id="cat-menu-list">
              {/* Every menu item wraps its label + count in the .mi-category-menu-label
                  / .mi-category-menu-badge spans the legacy CSS keys off — otherwise
                  the badge doesn't align and the active state loses its highlight. */}
              <div
                className={`mi-category-menu-item${activeCategory === null ? ' is-active' : ''}`}
                role="option"
                aria-selected={activeCategory === null}
                onClick={() => {
                  onCategoryChange(null);
                  setCatMenuOpen(false);
                }}
              >
                <span className="mi-category-menu-label">All {capitalizedNoun}</span>
                <span className="mi-category-menu-badge">{totalItems.toLocaleString()}</span>
              </div>
              {categories.map((name) => (
                <div
                  key={name}
                  className={`mi-category-menu-item${activeCategory === name ? ' is-active' : ''}`}
                  role="option"
                  aria-selected={activeCategory === name}
                  onClick={() => {
                    onCategoryChange(name);
                    setCatMenuOpen(false);
                  }}
                >
                  <span className="mi-category-menu-label">{name}</span>
                  <span className="mi-category-menu-badge">
                    {(categoryCounts[name] ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <form
            className="mi-search"
            id="search-form"
            autoComplete="off"
            role="search"
            onSubmit={submit}
          >
            <span className="mi-search-icon" aria-hidden="true">
              <img src="/ASSET/Icons/icon-search.svg" alt="" />
            </span>
            <input
              id="search-input"
              className="mi-search-input"
              type="text"
              placeholder={
                compact || !totalItems
                  ? `Search ${config.nounPlural}...`
                  : `Search ${totalItems.toLocaleString()}+ ${config.nounPlural}...`
              }
              aria-label={`Search ${config.nounPlural}`}
              value={draft}
              ref={inputRef}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={revealSearchToolbar}
              onBlur={(e) => {
                // Legacy scrolls back to top only when the search is empty —
                // if there's a query, staying scrolled keeps the results in
                // view. Port of motvin-icons.js:3004-3008.
                if (e.currentTarget.value) return;
                document
                  .querySelector<HTMLElement>('.mi-main')
                  ?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
            <button
              type="button"
              className="mi-search-clear"
              id="search-clear"
              aria-label="Clear search"
              style={{ display: draft ? 'block' : 'none' }}
              onClick={() => {
                setDraft('');
                onQueryChange('');
                inputRef.current?.focus();
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </form>

          <div className="mi-search-shortcut" aria-hidden="true">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </div>
        </div>

        {/* Recolor */}
        <div className="mi-recolor-wrap" id="recolor-wrap" ref={recolorRef}>
          <div
            className="mi-recolor-btn"
            id="btn-recolor"
            role="button"
            tabIndex={0}
            aria-haspopup="true"
            aria-label="Recolor"
            onClick={() => setRecolorOpen((open) => !open)}
          >
            <img
              src="/ASSET/Icons/icon-color-wheel.svg"
              className="mi-color-wheel"
              id="recolor-wheel"
              alt=""
              style={recolorActive ? { background: color, borderRadius: '50%' } : undefined}
            />
            <span className="mi-recolor-label" id="recolor-label">
              {recolorActive ? color.toUpperCase() : 'Recolor'}
            </span>
            <button
              className="mi-recolor-reset-inline"
              id="btn-recolor-reset-inline"
              aria-label="Reset color"
              hidden={!recolorActive}
              onClick={(e) => {
                e.stopPropagation();
                setHexDraft('');
                onColorReset();
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <img
              src="/ASSET/Icons/icon-down-arrow.svg"
              className="mi-recolor-arrow"
              alt=""
            />
          </div>

          <div className="mi-recolor-dropdown" id="recolor-dropdown" hidden={!recolorOpen}>
            <div className="mi-recolor-color-input">
              <input
                type="color"
                id="recolor-color-input"
                value={recolorActive ? color : '#0F1116'}
                onChange={(e) => {
                  setHexDraft(e.target.value);
                  onColorChange(e.target.value);
                }}
              />
              <input
                type="text"
                id="recolor-hex-input"
                className="mi-recolor-hex"
                maxLength={7}
                placeholder="#0F1116"
                value={hexDraft}
                onChange={(e) => applyHex(e.target.value)}
              />
            </div>
            <div className="mi-recolor-swatches" id="recolor-swatches">
              {RECOLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.color}
                  className="mi-recolor-swatch-btn"
                  data-color={swatch.color}
                  title={swatch.title}
                  aria-label={swatch.title}
                  style={{
                    background: swatch.color.toLowerCase(),
                    ...(swatch.border ? { border: '1px solid #e5e5eb' } : {}),
                  }}
                  onClick={() => {
                    setHexDraft(swatch.color);
                    onColorChange(swatch.color);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
