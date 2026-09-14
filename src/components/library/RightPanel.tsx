'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FilterCounts } from '@/hooks/useLibraryStats';
import type { SidebarTab } from './LibrarySidebar';

/**
 * The right panel shell — port of `.mi-rp-filters` in the library pages.
 *
 * The left rail picks which tab shows. Every tab stays mounted and is hidden
 * with `display:none`, as the original did, so switching tabs doesn't discard
 * scroll position or in-progress input.
 */

const TAB_TITLES: Record<SidebarTab, string> = {
  filters: 'Filters',
  categories: 'Packs',
  saved: 'Saved',
  plugins: 'Plugins',
  help: 'Help',
};

type Props = {
  activeTab: SidebarTab;
  onSelect?: (tab: SidebarTab) => void;
  /** Below the panel's breakpoint it slides over the grid rather than sitting beside it. */
  open: boolean;
  onClose: () => void;
  activeFilterCount: number;
  filters: ReactNode;
  categoryCounts: FilterCounts;
  /** Total library size — shown as the count on the "All" row of the packs list. */
  totalItems: number;
  activeCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  saved: ReactNode;
};

export function RightPanel({
  activeTab,
  onSelect,
  open,
  onClose,
  activeFilterCount,
  filters,
  categoryCounts,
  totalItems,
  activeCategories,
  onCategoriesChange,
  saved,
}: Props) {
  const show = (tab: SidebarTab) => ({ display: activeTab === tab ? 'block' : 'none' });

  const resizerRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const [floating, setFloating] = useState(false);

  /**
   * Detach ⇄ dock — port of the detach handler in motvin-icons.js:4340–4370.
   *
   * Detaching adds `body.is-panel-floating` and positions the aside as a
   * fixed 360×600 card near the top-right of the main column; docking clears
   * both. Position is computed from `.mi-main`'s rect (right edge minus 20px
   * padding minus 360px width, 20px below the header) so it lands over the
   * grid rather than at 0,0.
   */
  const toggleFloating = useCallback(() => {
    const aside = asideRef.current;
    if (!aside) return;
    setFloating((wasFloating) => {
      const nextFloating = !wasFloating;
      if (nextFloating) {
        document.body.classList.add('is-panel-floating');
        const mainRect = document
          .querySelector('.mi-main')
          ?.getBoundingClientRect();
        const PADDING = 20;
        const width = 360;
        const height = 600;
        aside.style.width = `${width}px`;
        aside.style.height = `${height}px`;
        if (mainRect) {
          aside.style.left = `${Math.max(20, mainRect.right - PADDING - width)}px`;
          aside.style.top = `${mainRect.top + PADDING}px`;
        } else {
          aside.style.left = '20px';
          aside.style.top = '90px';
        }
        aside.style.right = 'auto';
      } else {
        document.body.classList.remove('is-panel-floating');
        aside.style.width = '';
        aside.style.height = '';
        aside.style.left = '';
        aside.style.top = '';
        aside.style.right = '';
        try {
          // Docking clears the saved layout so a reload lands on the docked
          // default, matching legacy savePanelState() at motvin-icons.js:4544.
          localStorage.removeItem('mi_panel_layout');
        } catch {
          /* ignore */
        }
      }
      return nextFloating;
    });
  }, []);

  // Clean up the body class if the panel unmounts while floating.
  useEffect(
    () => () => {
      document.body.classList.remove('is-panel-floating');
    },
    [],
  );

  /**
   * Drag + edge-resize for the floating panel — port of the mouse handlers in
   * motvin-icons.js:4380–4530. Only active when the panel is floating; drag is
   * triggered by mousedown on `.mi-right-panel-inner` (excluding interactive
   * children), edge-resize by mousedown on any `.mi-rp-edge-resizer[data-resize]`.
   * The panel's position is clamped to `.mi-main`'s rect minus a 20px padding
   * so it can't be shoved off-screen, and every mouseup persists the final
   * geometry to localStorage under `mi_panel_layout`.
   */
  useEffect(() => {
    if (!floating) return;
    const aside = asideRef.current;
    if (!aside) return;
    const inner = aside.querySelector<HTMLElement>('.mi-right-panel-inner');
    const edgeResizers = aside.querySelectorAll<HTMLElement>('.mi-rp-edge-resizer');

    let mode: 'drag' | 'resize' | null = null;
    let resizeDir = '';
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let initialWidth = 0;
    let initialHeight = 0;

    const IGNORE = [
      '#rp-detach-btn',
      'input',
      '.mi-rp-checkbox',
      '.mi-rp-item-label',
      '.mi-rp-more',
      '.mi-rp-slider-wrapper',
      '.mi-rp-seg-item',
      '.mi-rp-license-active',
      '.mi-rp-edge-resizer',
      'button',
      '.mi-rp-cat-item',
      '.mi-rp-item',
    ].join(',');

    const beginDrag = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest(IGNORE)) return;
      mode = 'drag';
      startX = e.clientX;
      startY = e.clientY;
      const rect = aside.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      aside.style.left = `${initialLeft}px`;
      aside.style.top = `${initialTop}px`;
      aside.style.right = 'auto';
      document.body.style.userSelect = 'none';
    };

    const beginResize = (resizer: HTMLElement) => (e: MouseEvent) => {
      e.stopPropagation();
      mode = 'resize';
      resizeDir = resizer.getAttribute('data-resize') || '';
      startX = e.clientX;
      startY = e.clientY;
      const rect = aside.getBoundingClientRect();
      initialWidth = rect.width;
      initialHeight = rect.height;
      initialLeft = rect.left;
      initialTop = rect.top;
      aside.style.left = `${initialLeft}px`;
      aside.style.top = `${initialTop}px`;
      aside.style.right = 'auto';
      document.body.style.userSelect = 'none';
    };

    const onMove = (e: MouseEvent) => {
      if (!mode) return;
      const mainRect = document.querySelector('.mi-main')?.getBoundingClientRect();
      const PADDING = 20;
      const boundLeft = (mainRect?.left ?? 0) + PADDING;
      const boundRight = (mainRect?.right ?? window.innerWidth) - PADDING;
      const boundTop = (mainRect?.top ?? 0) + PADDING;
      const boundBottom = (mainRect?.bottom ?? window.innerHeight) - PADDING;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (mode === 'drag') {
        const panelW = aside.offsetWidth;
        const panelH = aside.offsetHeight;
        let newL = initialLeft + dx;
        let newT = initialTop + dy;
        newL = Math.max(boundLeft, Math.min(newL, boundRight - panelW));
        newT = Math.max(boundTop, Math.min(newT, boundBottom - panelH));
        aside.style.left = `${newL}px`;
        aside.style.top = `${newT}px`;
        return;
      }

      // Resize mode — direction is 'r' | 'l' | 't' | 'b' | 'tr' | 'tl' | 'br' | 'bl'.
      const MIN_W = 330;
      const MAX_W = 730;
      const MIN_H = 400;
      const MAX_H = 1200;
      let newW = initialWidth;
      let newH = initialHeight;
      let newL = initialLeft;
      let newT = initialTop;

      if (resizeDir.includes('r')) {
        newW = Math.max(MIN_W, Math.min(MAX_W, initialWidth + dx));
        if (newL + newW > boundRight) newW = boundRight - newL;
        if (newW < MIN_W) newW = MIN_W;
      }
      if (resizeDir.includes('l')) {
        newW = Math.max(MIN_W, Math.min(MAX_W, initialWidth - dx));
        newL = initialLeft + (initialWidth - newW);
        if (newL < boundLeft) {
          newL = boundLeft;
          newW = initialLeft + initialWidth - newL;
        }
        if (newW < MIN_W) {
          newW = MIN_W;
          newL = initialLeft + initialWidth - newW;
        }
      }
      if (resizeDir.includes('b')) {
        newH = Math.max(MIN_H, Math.min(MAX_H, initialHeight + dy));
        if (newT + newH > boundBottom) newH = boundBottom - newT;
        if (newH < MIN_H) newH = MIN_H;
      }
      if (resizeDir.includes('t')) {
        newH = Math.max(MIN_H, Math.min(MAX_H, initialHeight - dy));
        newT = initialTop + (initialHeight - newH);
        if (newT < boundTop) {
          newT = boundTop;
          newH = initialTop + initialHeight - newT;
        }
        if (newH < MIN_H) {
          newH = MIN_H;
          newT = initialTop + initialHeight - newH;
        }
      }
      aside.style.width = `${newW}px`;
      aside.style.height = `${newH}px`;
      aside.style.left = `${newL}px`;
      aside.style.top = `${newT}px`;
    };

    const onUp = () => {
      if (!mode) return;
      mode = null;
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(
          'mi_panel_layout',
          JSON.stringify({
            w: aside.style.width,
            h: aside.style.height,
            l: aside.style.left,
            t: aside.style.top,
          }),
        );
      } catch {
        /* localStorage may be blocked — losing the layout on reload is fine */
      }
    };

    inner?.addEventListener('mousedown', beginDrag);
    const resizeHandlers: Array<{ el: HTMLElement; fn: (e: MouseEvent) => void }> = [];
    edgeResizers.forEach((res) => {
      const fn = beginResize(res);
      res.addEventListener('mousedown', fn);
      resizeHandlers.push({ el: res, fn });
    });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    return () => {
      inner?.removeEventListener('mousedown', beginDrag);
      for (const { el, fn } of resizeHandlers) el.removeEventListener('mousedown', fn);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
  }, [floating]);

  /**
   * Restore the last-known floating layout on mount so a reload keeps the
   * user's arrangement — matches loadPanelState() at motvin-icons.js:4555.
   * Only runs once; subsequent detaches use the default 360×600 landing spot.
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mi_panel_layout');
      if (!raw) return;
      const st = JSON.parse(raw) as {
        w?: string;
        h?: string;
        l?: string;
        t?: string;
      };
      const aside = asideRef.current;
      if (!aside || !st.w || !st.h || !st.l || !st.t) return;
      document.body.classList.add('is-panel-floating');
      aside.style.width = st.w;
      aside.style.height = st.h;
      aside.style.left = st.l;
      aside.style.top = st.t;
      aside.style.right = 'auto';
      setFloating(true);
    } catch {
      /* corrupt LS entry — ignore and start docked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  /**
   * Drag the left edge of the right panel — port of the rp-resizer logic in
   * motvin-icons.js:4295–4335. Writes `--right-panel-w` on `<html>`, clamped
   * 330–730px, which the layout CSS keys off. The `is-resizing-rp` body class
   * suppresses text selection during the drag.
   */
  useEffect(() => {
    const handle = resizerRef.current;
    if (!handle) return;
    let dragging = false;
    let startX = 0;
    let startWidth = 380;

    const onDown = (e: MouseEvent) => {
      dragging = true;
      startX = e.clientX;
      startWidth =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--right-panel-w'),
          10,
        ) || 380;
      document.body.classList.add('is-resizing-rp');
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      // The panel sits on the right, so a leftward drag makes it wider.
      let next = startWidth + (startX - e.clientX);
      if (next < 330) next = 330;
      if (next > 730) next = 730;
      document.documentElement.style.setProperty('--right-panel-w', `${next}px`);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-resizing-rp');
    };

    handle.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      handle.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Reference sorts categories alphabetically (AI, Album, Arrows, Brands,
  // Business…), not by count. Case-insensitive so "iOS" doesn't sink to the
  // end of a lowercase-sorted list.
  const categoryNames = Object.keys(categoryCounts).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  const toggleCategory = (name: string) =>
    onCategoriesChange(
      activeCategories.includes(name)
        ? activeCategories.filter((c) => c !== name)
        : [...activeCategories, name],
    );

  return (
    <aside
      className={`mi-right-panel${open ? ' is-mobile-open' : ''}`}
      ref={asideRef}
    >
      {/* Second class switches with the active tab: `.mi-rp-categories` drops
          the panel's left padding to 0 so the category rows span edge-to-edge,
          while restoring the padding on the header. Every other tab keeps
          `.mi-rp-filters` (the padded shell). Matches the reference at
          :52488 and the CSS at library.css:1959-1965. */}
      <div
        className={`mi-right-panel-inner ${
          activeTab === 'categories' ? 'mi-rp-categories' : 'mi-rp-filters'
        }`}
      >
        <div className="mi-rp-resizer" id="rp-resizer" ref={resizerRef} />

        <div className="mi-rp-header">
          {/* Compact tab bar shown when the left sidebar is collapsed —
              CSS keys off body.mi-sidebar-collapsed to swap between this and
              the .mi-rp-heading below. Ports the block from
              motvin-ui/COMPONENT/Multi Actions Strip.js. */}
          <nav className="mi-rp-navigation" aria-label="Panel navigation">
            {(['filters','categories','saved'] as const).map((tab)=> (
              <button
                key={tab}
                className={activeTab===tab?'is-active':undefined}
                data-rp-navigation={tab}
                type="button"
                onClick={()=>onSelect?.(tab)}
              >
                {tab === 'filters' ? 'Filters' : tab === 'categories' ? 'Packs' : 'Saved'}
                {tab === 'filters' && (
                  <span className="mi-rp-navigation-count" aria-hidden="true">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          {/* Heading — icons.html:842 uses a plain flex row, not a named class.
              The SVG is the sliders/equaliser mark (three vertical bars with
              knobs), not the earlier three-horizontal-lines glyph. */}
          <div
            className="mi-rp-heading"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.6, color: 'var(--mi-ink)' }}
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span id="rp-header-title">{TAB_TITLES[activeTab]}</span>
            <span
              className="mi-rp-filter-badge"
              id="filter-badge"
              hidden={activeFilterCount === 0}
            >
              {activeFilterCount}
            </span>
          </div>
          <div className="mi-rp-header-actions">
            {/* Detach ⇄ dock — click toggles body.is-panel-floating and swaps
                between the "external link" icon (detach) and the "dock window"
                icon (dock), matching the reference at :52488 and the legacy
                handler in motvin-icons.js:4340. */}
            <button
              className="mi-rp-detach-btn"
              id="rp-detach-btn"
              title={floating ? 'Dock Panel' : 'Detach Panel'}
              aria-label={floating ? 'Dock Panel' : 'Detach Panel'}
              aria-pressed={floating}
              type="button"
              onClick={toggleFloating}
            >
              {floating ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              )}
            </button>
            <button
              className="mi-rp-mobile-close"
              id="rp-mobile-close"
              aria-label="Close filters"
              title="Close filters"
              onClick={onClose}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mi-rp-content">
          <div style={show('filters')}>{filters}</div>

          <div id="rp-tab-categories" style={show('categories')}>
            <div className="mi-rp-categories-list" id="categories-list-container">
              {/* "All" row — clears the category filter and reads active when
                  nothing is picked, matching the reference at :52488 which
                  ships `<div class="mi-rp-cat-item is-active" data-cat="all">`
                  at the top. Its count is the library total, not a sum of the
                  visible per-category counts (uncategorised items still add to
                  the total). */}
              <div
                className={`mi-rp-cat-item${activeCategories.length === 0 ? ' is-active' : ''}`}
                data-cat="all"
                style={{ cursor: 'pointer' }}
                onClick={() => onCategoriesChange([])}
              >
                <span className="mi-rp-cat-label">All</span>
                <span className="mi-rp-cat-count">{totalItems.toLocaleString()}</span>
              </div>
              {categoryNames.length === 0
                ? Array.from({ length: 5 }, (_, index) => (
                    <div className="mi-rp-cat-item is-skeleton" key={`cat-skeleton-${index}`}>
                      <span className="mi-rp-cat-label mi-skeleton">Category Name</span>
                      <span className="mi-rp-cat-count mi-skeleton">000</span>
                    </div>
                  ))
                : categoryNames.map((name) => (
                    <div
                      key={name}
                      className={`mi-rp-cat-item${activeCategories.includes(name) ? ' is-active' : ''}`}
                      data-cat={name}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleCategory(name)}
                    >
                      <span className="mi-rp-cat-label">{name}</span>
                      <span className="mi-rp-cat-count">
                        {categoryCounts[name].toLocaleString()}
                      </span>
                    </div>
                  ))}
            </div>
          </div>

          <div id="rp-tab-saved" style={show('saved')}>
            {saved}
          </div>

          {/* Plugins and Help are text-only placeholders in the reference —
              keep the empty-state copy and inline styling identical so the
              type sits at the same tone and size. */}
          <div id="rp-tab-plugins" style={show('plugins')}>
            <div className="mi-rp-section">
              <span className="mi-rp-title">Plugins</span>
              <p style={{ color: 'rgba(0, 0, 0, 0.5)', fontSize: 13, marginTop: 8 }}>
                Plugins coming soon.
              </p>
            </div>
          </div>

          <div id="rp-tab-help" style={show('help')}>
            <div className="mi-rp-section">
              <span className="mi-rp-title">Help</span>
              <p style={{ color: 'rgba(0, 0, 0, 0.5)', fontSize: 13, marginTop: 8 }}>
                Help resources coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Edge/corner drag handles — port of .mi-rp-edge-resizer.* from the
          legacy panel. Draggable resize logic is not yet wired; these ship so
          the DOM matches and CSS hover states apply. */}
      {(['t','b','l','r','tl','tr','bl','br'] as const).map((edge) => (
        <div key={edge} className={`mi-rp-edge-resizer resizer-${edge}`} data-resize={edge} />
      ))}
    </aside>
  );
}
