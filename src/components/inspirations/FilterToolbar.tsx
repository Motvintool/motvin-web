'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenFilters } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import {
  CONTENT_KINDS,
  INDUSTRY_LABEL,
  PLATFORM_LABEL,
  SCREEN_TYPE_LABEL,
  STYLE_LABEL,
  elementLabel,
  formatCount,
} from '@/lib/inspirations/taxonomy';
import { PLATFORMS, type Industry, type LibraryCounts, type Platform, type ScreenType, type Style } from '@/lib/inspirations/types';
import { useMeta } from './useMeta';
import { CheckIcon, ChevronDownIcon, CloseIcon } from './Icons';

/**
 * The Screens-page filter row, in Mobbin's shape: one dropdown pill per
 * dimension on the left, "Showing N screens" and the sort dropdown on the
 * right. A pill with nothing selected reads as its dimension ("Categories ⌄");
 * once a value is picked the pill becomes that value with an ⊗ that clears
 * the dimension ("Login ⊗", or "Login +2 ⊗" for a multi-selection) — the
 * state of every filter is legible from the row itself, which is why this
 * replaces both the content-type tab strip and the separate applied-pills row
 * on that page.
 */

export type SortOption<S extends string> = { value: S; label: string };

/** True when the current selection is exactly the web platform. */
export function isWebPlatform(platforms: string[]): boolean {
  return platforms.length === 1 && platforms[0] === 'web';
}

type Option = { value: string; label: string };

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

/**
 * Every dropdown here (FilterPill, SortPill, NavPill) is a list of real
 * buttons/links, so activation (Enter/Space, click) already works natively —
 * what's missing is getting keyboard focus INTO the list and moving it
 * around, which these two pieces add uniformly across all three menus.
 */
const MENU_ITEM_SELECTOR = '[role="option"], [role="menuitem"]';

/** Moves focus to the selected option (or the first) the instant a menu opens. */
function useAutoFocusMenu(open: boolean, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const container = ref.current;
    const items = container.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR);
    const selected = container.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
    (selected ?? items[0])?.focus();
  }, [open, ref]);
}

/** Arrow/Home/End roving focus among an open menu's options. */
function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(at + 1 + items.length) % items.length].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(at - 1 + items.length) % items.length].focus();
  } else if (e.key === 'Home') {
    e.preventDefault();
    items[0].focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    items[items.length - 1].focus();
  }
}

/** ArrowDown on a closed trigger opens its menu; useAutoFocusMenu takes it
 * from there once the popover mounts. */
function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, open: boolean, setOpen: (open: boolean) => void) {
  if (e.key === 'ArrowDown' && !open) {
    e.preventDefault();
    setOpen(true);
  }
}

/**
 * One dimension: a pill that opens a menu of its values. Multi-select menus
 * stay open across toggles so several values can be picked in one visit.
 * Exported so pages with their own dimensions (Flows) can compose a toolbar.
 */
export function FilterPill({
  label,
  options,
  selected,
  onToggle,
  onClear,
  multi = true,
  clearable = true,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  multi?: boolean;
  /**
   * False for dimensions that always have a value (the platform switcher):
   * the pill shows the current value with a chevron instead of an ⊗, since
   * "cleared" isn't a state the dimension can be in.
   */
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useAutoFocusMenu(open, ref);

  if (options.length === 0) return null;

  const applied = selected.length > 0;
  const first = applied ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : null;

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className={`ins-fpill ${applied && clearable ? 'is-applied' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={applied ? `${label}: ${first}` : `Filter by ${label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => onTriggerKeyDown(e, open, setOpen)}
      >
        {first ?? label}
        {applied && selected.length > 1 && <span className="ins-fpill-more">+{selected.length - 1}</span>}
        {applied && clearable ? (
          <span
            role="button"
            tabIndex={0}
            className="ins-fpill-x"
            aria-label={`Clear ${label} filter`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onClear();
              }
            }}
          >
            <CloseIcon size={10} strokeWidth={4} />
          </span>
        ) : (
          <ChevronDownIcon size={14} />
        )}
      </button>
      {open && (
        <div
          className="ins-popover ins-fmenu"
          role="listbox"
          aria-label={label}
          aria-multiselectable={multi}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                className={`ins-fmenu-item ${on ? 'is-selected' : ''}`}
                onClick={() => {
                  onToggle(o.value);
                  if (!multi) setOpen(false);
                }}
              >

                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The content-type switcher: the toolbar's leftmost pill, showing where you
 * are (Explore, Screens, Flows, …) and opening a menu of the other browse
 * pages with their library counts. Replaces the tab strip the toolbar
 * displaced, so every browse page — including Explore itself — stays one
 * click from the others. Navigation keeps the `platform` param — the one
 * filter whose meaning carries across content types — and drops the rest,
 * which are dimension-specific.
 */
export function NavPill({ counts }: { counts: LibraryCounts | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useAutoFocusMenu(open, ref);

  // "Explore" is a real destination (the app-browsing home), not just the
  // pill's fallback label when nothing else matches — so it's reachable from
  // every other browse page's menu, the same as the other five.
  const items: { key: string; label: string; href: string; count: number | undefined }[] = [
    { key: 'explore', label: 'Explore', href: INSPIRATIONS_ROUTES.explore, count: undefined },
    ...CONTENT_KINDS.map((k) => ({ key: k.kind, label: k.label, href: k.href, count: counts?.[k.kind] })),
  ];
  const active =
    items.find((i) => i.key !== 'explore' && (pathname === i.href || pathname.startsWith(`${i.href}/`))) ??
    (pathname === INSPIRATIONS_ROUTES.explore ? items[0] : undefined);
  const platform = searchParams.get('platform');
  const hrefFor = (href: string) => (platform ? `${href}?platform=${platform}` : href);

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className="ins-fpill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Browse content type"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => onTriggerKeyDown(e, open, setOpen)}
      >
        {active?.label ?? 'Explore'}
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div className="ins-popover ins-fmenu" role="menu" aria-label="Content type" onKeyDown={onMenuKeyDown}>
          {items.map((item) => {
            const on = item.key === active?.key;

            // The page you're already on isn't a navigation target — closing
            // the menu is the whole action, so it stays on this page instead
            // of round-tripping through the router for a same-route no-op.
            if (on) {
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  aria-current="page"
                  className="ins-fmenu-item is-selected"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                  {item.count !== undefined && <span className="ins-fmenu-count">{formatCount(item.count)}</span>}
                </button>
              );
            }
            return (
              <Link
                key={item.key}
                href={hrefFor(item.href)}
                // Switching content type is a real navigation (different
                // route, different data) but should still read as updating
                // the current view, not leaving it — Next's default scroll
                // reset would otherwise snap the page to the top and undock
                // the toolbar the instant you pick something.
                scroll={false}
                role="menuitem"
                className="ins-fmenu-item"
                onClick={() => setOpen(false)}
              >
                {item.label}
                {item.count !== undefined && <span className="ins-fmenu-count">{formatCount(item.count)}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The right-edge sort control — always has a value, so no clear affordance. */
export function SortPill<S extends string>({
  value,
  options,
  onChange,
}: {
  value: S;
  options: SortOption<S>[];
  onChange: (value: S) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useAutoFocusMenu(open, ref);

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className="ins-fsort"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sort screens"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => onTriggerKeyDown(e, open, setOpen)}
      >
        <img src="/ASSET/Icons/Motvin/filter-inspiration.svg" alt="" className="ins-fsort-icon" width={20} height={20} />
        {options.find((o) => o.value === value)?.label}
      </button>
      {open && (
        <div
          className="ins-popover ins-popover--right ins-fmenu"
          role="listbox"
          aria-label="Sort"
          onKeyDown={onMenuKeyDown}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`ins-fmenu-item ${o.value === value ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >

              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The row itself: dimension pills on the left, "Showing N <unit>s" and any
 * `right` control (usually a SortPill) on the right edge. Pages whose
 * dimensions aren't ScreenFilters (Flows) compose this directly.
 */
export function ToolbarRow({
  children,
  total,
  unit = 'screen',
  right,
}: {
  children: ReactNode;
  total: number | null;
  unit?: string;
  right?: ReactNode;
}) {
  // Mobbin's dock: once the row scrolls up to meet the header, it moves INTO
  // the header bar — the header's own content (logo, search, nav) fades out
  // and the toolbar fades in where it was; scrolling back restores both. The
  // anchor stays in flow holding the row's height so the gallery never jumps,
  // and is also the scroll measurement target. Measured on scroll rather than
  // via IntersectionObserver, whose callbacks stall in embedded webviews.
  const [docked, setDocked] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inFlowRowHeightRef = useRef(0);
  const dockedRef = useRef(false);

  // The docked bar's Apps/Web switcher — Mobbin's top-level split. "Web" sets
  // ?platform=web (and the Platform pill hides, web having no sub-platforms);
  // "Apps" clears it back to the mobile default, where the Platform pill
  // offers iOS/Android.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activePlatforms = (searchParams.get('platform') ?? '').split(',').filter(Boolean);
  const webMode = isWebPlatform(activePlatforms);
  const setPlatformParam = (value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set('platform', value);
    else sp.delete('platform');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const anchor = anchorRef.current;
    const row = rowRef.current;
    if (!anchor || !row) return;
    const headerH = parseFloat(getComputedStyle(anchor).getPropertyValue('--ins-header-h')) || 92;
    // Measure once while the row is guaranteed in flow (state starts
    // undocked), so a page that loads already scrolled — back button, restored
    // session — still holds the right height from the first docked frame.
    // The row's vertical margins live on the anchor (see .ins-ftoolbar-anchor)
    // so offsetHeight, which excludes margins, accounts for all the space the
    // row actually frees up when it leaves the flow.
    inFlowRowHeightRef.current = row.offsetHeight;
    anchor.style.minHeight = `${inFlowRowHeightRef.current}px`;
    const check = () => {
      const grid = anchor.parentElement?.querySelector<HTMLElement>('.ins-grid');
      const trigger = grid ?? anchor;
      const triggerTop = trigger.getBoundingClientRect().top;
      const next = dockedRef.current
        ? triggerTop <= headerH + 32
        : triggerTop <= headerH;
      // The portaled header copy is outside this anchor, so retain only the
      // in-flow row's height here. Reserving the full header height adds a
      // visible blank band above the grid at the docking boundary.
      if (!next) inFlowRowHeightRef.current = row.offsetHeight;
      anchor.style.minHeight = `${inFlowRowHeightRef.current}px`;
      if (next !== dockedRef.current) {
        dockedRef.current = next;
        setDocked(next);
      }
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  // The header listens for this body class to swap its content with the
  // portaled toolbar while the in-flow placeholder keeps the page stable.
  const headerContent =
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.ins-header-content');

  useEffect(() => {
    document.body.classList.toggle('ins-toolbar-docked', docked);
    return () => {
      document.body.classList.remove('ins-toolbar-docked');
    };
  }, [docked]);

  const toolbar = (inHeader = false) => (
    <div
      ref={inHeader ? undefined : rowRef}
      className={`ins-ftoolbar ${inHeader ? 'is-docked' : ''} ${docked && !inHeader ? 'is-docked-placeholder' : ''}`}
      role="group"
      aria-label="Filters and sort"
      aria-hidden={docked && !inHeader ? true : undefined}
    >
        {docked && (
          <>
            <div className="ins-ftoolbar-context" role="group" aria-label="Apps or web">
              <button
                type="button"
                className={webMode ? '' : 'is-active'}
                aria-pressed={!webMode}
                onClick={() => {
                  if (webMode) setPlatformParam(null);
                }}
              >
                Apps
              </button>
              <button
                type="button"
                className={webMode ? 'is-active' : ''}
                aria-pressed={webMode}
                onClick={() => {
                  if (!webMode) setPlatformParam('web');
                }}
              >
                Web
              </button>
            </div>
            <span className="ins-ftoolbar-divider" aria-hidden="true" />
          </>
        )}
        {children}
        <div className="ins-ftoolbar-right">
          {total !== null && (
            <span className="ins-fshowing" aria-live="polite">
              {total.toLocaleString()} {unit}
              {total === 1 ? '' : 's'}
            </span>
          )}
          {right}
        </div>
    </div>
  );

  return (
    <div ref={anchorRef} className="ins-ftoolbar-anchor">
      {toolbar()}
      {docked && headerContent && createPortal(toolbar(true), headerContent)}
    </div>
  );
}

export function FilterToolbar<S extends string>({
  filters,
  onChange,
  element,
  onElement,
  total,
  unit = 'screen',
  sort,
  sortOptions,
  onSort,
  counts = null,
  end,
}: {
  filters: ScreenFilters;
  onChange: (patch: Partial<ScreenFilters>) => void;
  /** Single-select UI-element dimension; the screens API takes one kind. */
  element: string | null;
  onElement: (kind: string | null) => void;
  total: number | null;
  unit?: string;
  sort: S;
  sortOptions: SortOption<S>[];
  onSort: (value: S) => void;
  /** Library counts for the content-type switcher; omit to hide it. */
  counts?: LibraryCounts | null;
  /** Extra controls rendered after the divider, before the right edge. */
  end?: ReactNode;
}) {
  const meta = useMeta();
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <ToolbarRow total={total} unit={unit} right={<SortPill value={sort} options={sortOptions} onChange={onSort} />}>
      {counts && <NavPill counts={counts} />}
      <FilterPill
        label="Categories"
        options={meta.taxonomy.industries.map((v) => ({ value: v, label: INDUSTRY_LABEL[v as Industry] ?? v }))}
        selected={filters.industries}
        onToggle={(v) => onChange({ industries: toggle(filters.industries, v as Industry) })}
        onClear={() => onChange({ industries: [] })}
      />
      <FilterPill
        label="Screen type"
        options={meta.taxonomy.screenTypes.map((v) => ({ value: v, label: SCREEN_TYPE_LABEL[v as ScreenType] ?? v }))}
        selected={filters.screenTypes}
        onToggle={(v) => onChange({ screenTypes: toggle(filters.screenTypes, v as ScreenType) })}
        onClear={() => onChange({ screenTypes: [] })}
      />
      <FilterPill
        // "Element" (the field name), not "UI Elements" — the content-type
        // switcher pill already reads "UI Elements" on this page, and two
        // pills sharing one label read as one confused control instead of two
        // distinct filters.
        label="Element"
        options={meta.taxonomy.elements.map((v) => ({ value: v, label: elementLabel(v) }))}
        selected={element ? [element] : []}
        onToggle={(v) => onElement(v === element ? null : v)}
        onClear={() => onElement(null)}
        multi={false}
      />
      <FilterPill
        label="Style"
        options={meta.taxonomy.styles.map((v) => ({ value: v, label: STYLE_LABEL[v as Style] ?? v }))}
        selected={filters.styles}
        onToggle={(v) => onChange({ styles: toggle(filters.styles, v as Style) })}
        onClear={() => onChange({ styles: [] })}
      />
      <FilterPill
        label="Platform"
        options={PLATFORMS.map((v) => ({ value: v, label: PLATFORM_LABEL[v] ?? v }))}
        // Single-select switcher over all three platforms, with iOS as the
        // real default: the pill always names exactly what the feed shows —
        // including "Web" — and always agrees with the header's platform nav
        // and the docked Apps/Web chip. iOS keeps the URL clean.
        selected={[filters.platforms[0] ?? 'ios']}
        onToggle={(v) => onChange({ platforms: v === 'ios' ? [] : [v as Platform] })}
        onClear={() => onChange({ platforms: [] })}
        multi={false}
        clearable={false}
      />
      {filters.query && (
        <button
          type="button"
          className="ins-fpill is-applied"
          aria-label={`Clear search filter “${filters.query}”`}
          onClick={() => onChange({ query: '' })}
        >
          “{filters.query}”
          <span className="ins-fpill-x">
            <CloseIcon size={10} />
          </span>
        </button>
      )}
      {end && (
        <>
          <span className="ins-ftoolbar-divider" aria-hidden />
          {end}
        </>
      )}
    </ToolbarRow>
  );
}
