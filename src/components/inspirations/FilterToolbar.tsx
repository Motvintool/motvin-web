'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { browsedPlatforms, isWebsPlatforms, type ScreenFilters } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { CONTENT_KINDS, WEBS_APPS_LABEL, elementLabel, formatCount, INDUSTRY_LABEL, screenStateLabel, screenTypeLabel, styleLabel } from '@/lib/inspirations/taxonomy';
import {
  type Industry,
  type LibraryCounts,
  type ScreenState,
  type ScreenType,
  type Style,
} from '@/lib/inspirations/types';
import { APPLIED_PILLS_MAX, AppliedFilterPills, FiltersPill, type FilterSection } from './FiltersPanel';
import { useMeta } from './useMeta';
import { AppleIcon, CheckIcon, CloseIcon, WebIcon } from './Icons';

/**
 * The Screens-page filter row: one dropdown pill per
 * dimension on the left, "Showing N screens" and the sort dropdown on the
 * right. A pill with nothing selected reads as its dimension ("Categories ⌄");
 * once a value is picked the pill becomes that value with an ⊗ that clears
 * the dimension ("Login ⊗", or "Login +2 ⊗" for a multi-selection) — the
 * state of every filter is legible from the row itself, which is why this
 * replaces both the content-type tab strip and the separate applied-pills row
 * on that page.
 */

export type SortOption<S extends string> = { value: S; label: string };


/** A menu choice; `count`, when given, is shown at the right (how many results picking it would give). */
type Option = { value: string; label: string; count?: number };

export function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLDivElement | null>) {
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
export const MENU_ITEM_SELECTOR = '[role="option"], [role="menuitem"]';

/** Moves focus to the selected option (or the first) the instant a menu opens. */
export function useAutoFocusMenu(open: boolean, ref: React.RefObject<HTMLDivElement | null>) {
  // Every focus here is `preventScroll`: the menu is a popover that's already in view, and a focus that
  // scrolls would nudge the page to clear the window's scroll padding under the docked bar.
  useEffect(() => {
    if (!open || !ref.current) return;
    const container = ref.current;
    const items = container.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR);
    const selected = container.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
    (selected ?? items[0])?.focus({ preventScroll: true });
  }, [open, ref]);
}

/** Arrow/Home/End roving focus among an open menu's options. */
export function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(at + 1 + items.length) % items.length].focus({ preventScroll: true });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(at - 1 + items.length) % items.length].focus({ preventScroll: true });
  } else if (e.key === 'Home') {
    e.preventDefault();
    items[0].focus({ preventScroll: true });
  } else if (e.key === 'End') {
    e.preventDefault();
    items[items.length - 1].focus({ preventScroll: true });
  }
}

/** ArrowDown on a closed trigger opens its menu; useAutoFocusMenu takes it
 * from there once the popover mounts. */
export function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, open: boolean, setOpen: (open: boolean) => void) {
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
          <span className="ins-fpill-chev" aria-hidden />
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
                {o.count !== undefined && <span className="ins-fmenu-count">{formatCount(o.count)}</span>}
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
export function NavPill({ counts, activeCount = null }: { counts: LibraryCounts | null; activeCount?: number | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useAutoFocusMenu(open, ref);
  const webs = isWebsPlatforms(browsedPlatforms(searchParams));

  // "Explore" is a real destination (the app-browsing home), not just the
  // pill's fallback label when nothing else matches — so it's reachable from
  // every other browse page's menu, the same as the other five.
  const items: { key: string; label: string; href: string; count: number | undefined }[] = [
    { key: 'explore', label: 'Explore', href: INSPIRATIONS_ROUTES.explore, count: undefined },
    ...CONTENT_KINDS.map((k) => ({
      key: k.kind,
      // In Webs, "Apps" lists web apps and websites, and says so.
      label: k.kind === 'apps' && webs ? WEBS_APPS_LABEL : k.label,
      href: k.href,
      count: counts?.[k.kind],
    })),
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
        {/* How many results the page is showing, right on the pill that names it. */}
        {activeCount !== null && <span className="ins-fpill-count">{formatCount(activeCount)}</span>}
        <span className="ins-fpill-chev" aria-hidden />
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
  asPill = false,
}: {
  value: S;
  options: SortOption<S>[];
  onChange: (value: S) => void;
  /** Sit among the left-hand pills (the app lists, where Filters takes the right edge): a plain pill with a chevron. */
  asPill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useAutoFocusMenu(open, ref);

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className={asPill ? 'ins-fpill' : 'ins-fsort'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sort"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => onTriggerKeyDown(e, open, setOpen)}
      >
        {!asPill && <img src="/ASSET/Icons/Motvin/sort-curated.svg" alt="" className="ins-fsort-icon" width={20} height={20} />}
        {options.find((o) => o.value === value)?.label}
        {asPill && <span className="ins-fpill-chev" aria-hidden />}
      </button>
      {open && (
        <div
          className={`ins-popover ${asPill ? '' : 'ins-popover--right'} ins-fmenu`}
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
 * The dock: once a row scrolls up to meet the header, it moves INTO the
 * header bar — the header's own content (logo, search, nav) fades out and
 * the toolbar fades in where it was; scrolling back restores both. The
 * anchor stays in flow holding the row's height so the page never jumps, and
 * is also the scroll measurement target. Measured on scroll rather than via
 * IntersectionObserver, whose callbacks stall in embedded webviews. Shared
 * by every dockable row (ToolbarRow here, the app-detail tabbar row) so the
 * scroll-tracking and portal target are computed once, the same way,
 * everywhere it's used.
 */
/** How long a row that undocks stays in the header, fading out as the header's own content comes back. */
const UNDOCK_MS = 240;
/** The row docks this far before the grid reaches the bar — as it's about to slide under the glass, not once
 *  it already has. Wide enough that the fitted view after a filter or tab change (the results 16px under the
 *  bar, plus an app page's tab panel padding) is inside it, so that spot is docked however it's reached. */
const DOCK_GAP_PX = 32;

export function useDockingRow(enabled = true) {
  const [docked, setDocked] = useState(false);
  // Just undocked: the header copy is still there for UNDOCK_MS, on its way out (`.is-leaving`).
  const [leaving, setLeaving] = useState(false);
  const leaveTimerRef = useRef(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inFlowRowHeightRef = useRef(0);
  const dockedRef = useRef(false);
  // Where the docked copy's bottom edge last was (0 before the first dock).
  const dockedBottomRef = useRef(0);

  useEffect(() => {
    const anchor = anchorRef.current;
    const row = rowRef.current;
    if (!enabled || !anchor || !row) return;
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
      // Measured from the docked bar's real bottom edge: on a phone the app page's tab row wraps and hangs
      // below the header, and results fitted under it sit lower than the header alone would allow. Docking
      // again uses where that edge was last, so the row comes back at the same place it left.
      const dockedCopy = dockedRef.current ? document.querySelector<HTMLElement>('.ins-header .is-docked:not(.is-leaving)') : null;
      if (dockedCopy) dockedBottomRef.current = dockedCopy.getBoundingClientRect().bottom;
      const barBottom = Math.max(headerH, dockedBottomRef.current);
      const next = dockedRef.current
        ? triggerTop <= barBottom + DOCK_GAP_PX + 32
        : triggerTop <= barBottom + DOCK_GAP_PX;
      // The portaled header copy is outside this anchor, so retain only the
      // in-flow row's height here. Reserving the full header height adds a
      // visible blank band above the grid at the docking boundary.
      if (!next) inFlowRowHeightRef.current = row.offsetHeight;
      anchor.style.minHeight = `${inFlowRowHeightRef.current}px`;
      if (next !== dockedRef.current) {
        dockedRef.current = next;
        setDocked(next);
        window.clearTimeout(leaveTimerRef.current);
        setLeaving(!next);
        if (!next) leaveTimerRef.current = window.setTimeout(() => setLeaving(false), UNDOCK_MS);
      }
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      window.clearTimeout(leaveTimerRef.current);
    };
  }, [enabled]);

  // The header listens for this body class to swap its content with the
  // portaled toolbar while the in-flow placeholder keeps the page stable.
  const headerContent =
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.ins-header-content');

  useEffect(() => {
    document.body.classList.toggle('ins-toolbar-docked', docked);
    // From the first dock on, the header's own content animates back in each time a row leaves.
    if (docked) document.body.classList.add('ins-toolbar-was-docked');
    return () => {
      document.body.classList.remove('ins-toolbar-docked');
    };
  }, [docked]);
  useEffect(() => () => document.body.classList.remove('ins-toolbar-was-docked'), []);

  return { docked, leaving, anchorRef, rowRef, headerContent };
}

/**
 * The platform switch: the library's own segmented control (the same one the admin uses), with the current
 * section on the black pill — Apps (iOS) or Webs (websites and web apps together). On wide screens the
 * header's Apps / Webs tabs make that choice, so the switch is hidden in the row — except once the row has
 * docked into the header, where it stands in for the tabs it has covered; below 1140px the tabs are not
 * shown and the switch is the way to move between the two.
 */
const SWITCH_OPTIONS: { value: string; label: string; param: string | null; Icon: typeof AppleIcon }[] = [
  { value: 'ios', label: 'Apps', param: null, Icon: AppleIcon },
  { value: 'web', label: 'Webs', param: 'web', Icon: WebIcon },
];

function PlatformSwitch({ platform, onPick }: { platform: string; onPick: (param: string | null) => void }) {
  return (
    <div
      className="ins-segmented ins-segmented--toolbar ins-ftoolbar-context"
      role="radiogroup"
      aria-label="Platform"
    >
      {SWITCH_OPTIONS.map((o) => {
        const on = o.value === platform;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-platform={o.value}
            className={`ins-segmented-item ${on ? 'is-active' : ''}`}
            aria-label={o.label}
            title={o.label}
            onClick={() => !on && onPick(o.param)}
          >
            {/* A desktop shows the names, with the chosen one's icon; a phone shows the icons alone. */}
            <span className="ins-segmented-label">{o.label}</span>
            <span className="ins-segmented-icon" aria-hidden>
              <o.Icon size={16} />
            </span>
          </button>
        );
      })}
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
  const { docked, leaving, anchorRef, rowRef, headerContent } = useDockingRow();

  // Apps / Webs is the top-level split and lives in the header's tabs; the switch here stands in for
  // them on narrow screens.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activePlatforms = (searchParams.get('platform') ?? '').split(',').filter(Boolean);
  const webMode = isWebsPlatforms(activePlatforms);
  const platformHref = (value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set('platform', value);
    else sp.delete('platform');
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const setPlatformParam = (value: string | null) => router.replace(platformHref(value), { scroll: false });

  const toolbar = (inHeader = false) => (
    <div
      ref={inHeader ? undefined : rowRef}
      className={`ins-ftoolbar ${inHeader ? 'is-docked' : ''} ${inHeader && !docked ? 'is-leaving' : ''} ${docked && !inHeader ? 'is-docked-placeholder' : ''}`}
      role="group"
      aria-label="Filters and sort"
      aria-hidden={docked && !inHeader ? true : undefined}
    >
        <PlatformSwitch platform={webMode ? 'web' : 'ios'} onPick={setPlatformParam} />
        <span className="ins-ftoolbar-divider ins-ftoolbar-divider--switch" aria-hidden="true" />
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
      {(docked || leaving) && headerContent && createPortal(toolbar(true), headerContent)}
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
  onClearAll,
  beforeSort,
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
  /** Clears every dimension in one URL write (two writes in a row would undo each other). */
  onClearAll?: () => void;
  /** A control on the right, before the sort (the screenshot-text search). */
  beforeSort?: ReactNode;
}) {
  const meta = useMeta();
  // "+N more" beside the applied filters opens the Filters panel.
  const [openFilters, setOpenFilters] = useState(0);
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  // The five screen filters live in one "Filters" panel (as on the search page); each applied value is also a
  // pill of its own on the row.
  const allSections: FilterSection[] = [
    {
      key: 'industry',
      label: 'Categories',
      options: meta.taxonomy.industries.map((v) => ({ value: v, label: INDUSTRY_LABEL[v as Industry] ?? v })),
      selected: filters.industries,
      onToggle: (v) => onChange({ industries: toggle(filters.industries, v as Industry) }),
      onClear: () => onChange({ industries: [] }),
    },
    {
      key: 'type',
      label: 'Screen type',
      options: meta.taxonomy.screenTypes.map((v) => ({ value: v, label: screenTypeLabel(v) })),
      selected: filters.screenTypes,
      onToggle: (v) => onChange({ screenTypes: toggle(filters.screenTypes, v as ScreenType) }),
      onClear: () => onChange({ screenTypes: [] }),
    },
    {
      // The condition a screen is in, separate from what it is: "empty states" or "loading screens".
      key: 'state',
      label: 'State',
      options: meta.taxonomy.states.map((v) => ({ value: v, label: screenStateLabel(v) })),
      selected: filters.states,
      onToggle: (v) => onChange({ states: toggle(filters.states, v as ScreenState) }),
      onClear: () => onChange({ states: [] }),
    },
    {
      // Single-select: the screens API takes one kind.
      key: 'element',
      label: 'Element',
      options: meta.taxonomy.elements.map((v) => ({ value: v, label: elementLabel(v) })),
      selected: element ? [element] : [],
      onToggle: (v) => onElement(v === element ? null : v),
      onClear: () => onElement(null),
    },
    {
      key: 'style',
      label: 'Style',
      options: meta.taxonomy.styles.map((v) => ({ value: v, label: styleLabel(v) })),
      selected: filters.styles,
      onToggle: (v) => onChange({ styles: toggle(filters.styles, v as Style) }),
      onClear: () => onChange({ styles: [] }),
    },
  ];
  const sections = allSections.filter((section) => section.options.length > 0 || section.selected.length > 0);
  const clearAll =
    onClearAll ??
    (() => {
      onChange({ industries: [], screenTypes: [], states: [], styles: [] });
      if (element) onElement(null);
    });

  return (
    // With the type pill shown, the count rides on it ("Screens 100") instead of the right edge.
    <ToolbarRow
      total={counts ? null : total}
      unit={unit}
      right={
        <>
          {beforeSort}
          {beforeSort && <span className="ins-ftoolbar-divider" aria-hidden />}
          <SortPill value={sort} options={sortOptions} onChange={onSort} />
        </>
      }
    >
      {counts && <NavPill counts={counts} activeCount={total} />}
      <FiltersPill sections={sections} onClearAll={clearAll} total={total} unit={unit} openSignal={openFilters} />
      <AppliedFilterPills sections={sections} max={APPLIED_PILLS_MAX} onMore={() => setOpenFilters((n) => n + 1)} />
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
