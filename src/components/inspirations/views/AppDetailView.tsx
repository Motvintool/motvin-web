'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { elementLabel, INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, ElementKind, Flow, Pattern, Screen } from '@/lib/inspirations/types';
import { AppLogo } from '../AppLogo';
import { AppMenu } from '../AppMenu';
import { AppRating } from '../AppRating';
import { useLibrary } from '../useLibrary';
import { FloatCollectionBar } from '../FloatCollectionBar';
import { EmptyState } from '../EmptyState';
import {
  MENU_ITEM_SELECTOR,
  onMenuKeyDown,
  SortPill,
  useDismiss,
  useDockingRow,
  type SortOption,
} from '../FilterToolbar';
import { buildTree, prune, FlowsBrowser, type Entry as FlowTreeEntry, type Node as FlowTreeNode } from '../FlowsBrowser';
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, CloseIcon, ExternalIcon, SearchIcon } from '../Icons';
import { SCREEN_PARAM } from '../ScreenPreviewModal';

import { ScreenGrid } from '../ScreenGrid';
import { ScreenGridSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';

type AppTab = 'screens' | 'flows' | 'ui-elements' | 'patterns';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'screens', label: 'Screens' },
  { id: 'ui-elements', label: 'UI Elements' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'flows', label: 'Flows' },
];

/** "Curated" is this page's own given order (build-time manifest order) — no
 * sort param to send, since screens here are already loaded in full. */
type DetailSort = 'curated' | 'newest' | 'oldest';
const DETAIL_SORTS: SortOption<DetailSort>[] = [
  { value: 'curated', label: 'Curated' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

function sortScreens(list: Screen[], sort: DetailSort): Screen[] {
  if (sort === 'curated') return list;
  return [...list].sort((a, b) => {
    const at = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
    const bt = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
    return sort === 'newest' ? bt - at : at - bt;
  });
}



/**
 * A tabbar filter pill (Figma: "ui-elements-menu") — a checkbox multi-select
 * with a live search, rather than the plain single-select list the other
 * FilterPill dimensions use. Kept local to this page rather than folded into
 * FilterPill since no other dimension has a search box or lets more than one
 * value apply at once. Reused for both the UI Elements and Patterns tabs —
 * only the label, options and search copy differ.
 */
function CheckboxFilterPill({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: { value: string; label: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    inputRef.current?.focus();
  }, [open]);

  const applied = selected.length > 0;
  const first = applied ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : null;
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className={`ins-fpill ${applied ? 'is-applied' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={applied ? `${label}: ${first}` : `Filter by ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        {first ?? label}
        {applied && selected.length > 1 && <span className="ins-fpill-more">+{selected.length - 1}</span>}
        {applied ? (
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
        <div className={`ins-uielements-menu ${q ? 'is-searching' : ''}`}>
          <div className="ins-uielements-search">
            <SearchIcon size={18} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              aria-label={`Search ${label.toLowerCase()}`}
              onKeyDown={(e) => {
                // Search stays focused first (so typing works immediately),
                // but ArrowDown still hands off into the list, same as a
                // combobox — otherwise arrow keys would just move the
                // cursor in the text field instead of navigating options.
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  optionsRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus();
                }
              }}
            />
          </div>
          <div
            ref={optionsRef}
            className="ins-uielements-options"
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            onKeyDown={onMenuKeyDown}
          >
            {filtered.length === 0 ? (
              <p className="ins-popover-empty">No matches</p>
            ) : (
              filtered.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className="ins-fmenu-item"
                    onClick={() => onToggle(o.value)}
                  >
                    <span className="ins-uielements-item-left">
                      <span className={`ins-uielements-checkbox ${checked ? 'is-checked' : ''}`} aria-hidden="true">
                        {checked && <CheckIcon size={12} strokeWidth={3} />}
                      </span>
                      {o.label}
                    </span>
                    <span className="ins-fmenu-count">{o.count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Screens tab's own filter pill — the app's flow tree (same
 * buildTree/prune and .ins-flowtree markup as FlowsBrowser's "ins-flows-nav"
 * sidebar), reused inside a popover instead of a fixed sidebar. Branches
 * collapse exactly like the Flows tab's own tree; unlike a single flow name
 * click there, each flow gets a checkbox so several can apply at once, and
 * checking one doesn't filter immediately — it's staged until Apply, so
 * picking three flows is three taps, not three re-renders of the grid.
 * Clicking a leaf screen still goes straight to it.
 */
function FlowTreePill({
  flows,
  screenById,
  selected,
  onApply,
}: {
  flows: Flow[];
  screenById: Map<string, Screen>;
  selected: string[];
  onApply: (flowIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string[]>(selected);
  const params = useSearchParams();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    inputRef.current?.focus();
    // Reopening starts from what's actually applied — an outside-click that
    // dismissed the popover last time without Apply shouldn't leave stray
    // checks lying around.
    setPending(selected);
  }, [open, selected]);

  const entries: FlowTreeEntry[] = useMemo(
    () =>
      flows.map((flow) => ({
        flow,
        screens: flow.screenIds.map((id) => screenById.get(id)).filter((s): s is Screen => Boolean(s)),
      })),
    [flows, screenById],
  );
  const tree = useMemo(() => buildTree(entries), [entries]);
  const q = query.trim().toLowerCase();
  const visible = q
    ? prune(tree, (entry) => entry.flow.name.toLowerCase().includes(q) || entry.screens.some((s) => s.name.toLowerCase().includes(q)))
    : tree;

  const toggleCollapsed = (flowId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  };

  const togglePending = (flowId: string) => {
    setPending((current) => (current.includes(flowId) ? current.filter((id) => id !== flowId) : [...current, flowId]));
  };

  const applied = selected.length > 0;
  const appliedLabel = applied
    ? flows.find((f) => f.id === selected[0])?.name ?? selected[0]
    : null;

  // Same merge FlowsBrowser's own renderNode does: a flow's screens as leaves
  // and its child flows as branches, interleaved in the order they were
  // walked, with a screen a child flow also lists shown once, under the child.
  const renderNode = (node: FlowTreeNode) => {
    const { flow, screens } = node.entry;
    const isCollapsed = collapsed.has(flow.id) && !q;
    const checked = pending.includes(flow.id);
    const inChild = new Set(node.children.flatMap((child) => child.entry.flow.screenIds));
    const items: { at: number; screen?: Screen; child?: FlowTreeNode }[] = [
      ...screens.filter((s) => !inChild.has(s.id)).map((s) => ({ at: flow.screenIds.indexOf(s.id), screen: s })),
      ...node.children.map((child) => ({ at: flow.screenIds.indexOf(child.entry.flow.screenIds[0]), child })),
    ].sort((a, b) => a.at - b.at);
    const collapsible = items.length > 0;
    return (
      <li key={flow.id} className="ins-flowtree-node" style={{ '--depth': node.depth } as React.CSSProperties}>
        <div className={`ins-flowtree-row ${checked ? 'is-active' : ''} ${node.depth === 0 ? 'is-root' : ''}`}>
          <button
            type="button"
            role="option"
            aria-selected={checked}
            className="ins-flowtree-name ins-flowtree-checkbox-name"
            onClick={() => togglePending(flow.id)}
          >
            <span className={`ins-uielements-checkbox ${checked ? 'is-checked' : ''}`} aria-hidden="true">
              {checked && <CheckIcon size={12} strokeWidth={3} />}
            </span>
            {flow.name}
          </button>
          {collapsible && (
            <button
              type="button"
              className="ins-flowtree-toggle"
              aria-label={isCollapsed ? `Expand ${flow.name}` : `Collapse ${flow.name}`}
              aria-expanded={!isCollapsed}
              onClick={() => toggleCollapsed(flow.id)}
            >
              <ChevronDownIcon size={13} className={`ins-flows-chevron ${isCollapsed ? 'is-collapsed' : ''}`} />
            </button>
          )}
        </div>
        {!isCollapsed && items.length > 0 && (
          <ul className="ins-flowtree-children">
            {items.map((item) =>
              item.child ? (
                renderNode(item.child)
              ) : (
                <li key={item.screen!.id} className="ins-flowtree-node" style={{ '--depth': node.depth + 1 } as React.CSSProperties}>
                  <div className="ins-flowtree-row is-leaf">
                    <Link
                      href={(() => {
                        const sp = new URLSearchParams(params.toString());
                        sp.set(SCREEN_PARAM, item.screen!.id);
                        return `${pathname}?${sp.toString()}`;
                      })()}
                      scroll={false}
                      role="menuitem"
                      className="ins-flowtree-name ins-flowtree-leaf"
                      onClick={() => setOpen(false)}
                    >
                      {item.screen!.name}
                    </Link>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className={`ins-fpill ${applied ? 'is-applied' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={applied ? `Screens: ${appliedLabel}` : 'Filter by Screens'}
        onClick={() => setOpen((o) => !o)}
      >
        {appliedLabel ?? 'Screens'}
        {applied && selected.length > 1 && <span className="ins-fpill-more">+{selected.length - 1}</span>}
        {applied ? (
          <span
            role="button"
            tabIndex={0}
            className="ins-fpill-x"
            aria-label="Clear Screens filter"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onApply([]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onApply([]);
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
        <div className={`ins-uielements-menu ${q ? 'is-searching' : ''}`}>
          <div className="ins-uielements-search">
            <SearchIcon size={18} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search flows..."
              aria-label="Search flows"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  optionsRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus();
                }
              }}
            />
          </div>
          <div className="ins-uielements-options" ref={optionsRef} onKeyDown={onMenuKeyDown}>
            {visible.length === 0 ? (
              <p className="ins-popover-empty">No matching flows</p>
            ) : (
              <ul className="ins-flowtree">{visible.map(renderNode)}</ul>
            )}
          </div>
          <div className="ins-flowtree-menu-footer">
            <button type="button" className="ins-flowtree-clear" onClick={() => setPending([])}>
              Clear
            </button>
            <button
              type="button"
              className="ins-flowtree-apply"
              onClick={() => {
                onApply(pending);
                setOpen(false);
              }}
            >
              Apply{pending.length > 0 ? ` (${pending.length})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** /inspirations/app/[slug] — one product, all of its stored screens and flows. */
export function AppDetailView({
  app,
  screens,
  flows,
  patterns,
}: {
  app: App;
  screens: Screen[];
  flows: Flow[];
  patterns: Pattern[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { collectionsContaining, toggleInCollection, deleteCollection } = useLibrary();
  const [floatOpen, setFloatOpen] = useState(false);
  const [floatRemovedOpen, setFloatRemovedOpen] = useState(false);
  const [elementFilter, setElementFilter] = useState<ElementKind[]>([]);
  const [sort, setSort] = useState<DetailSort>('curated');
  const [patternFilter, setPatternFilter] = useState<string[]>([]);
  const [flowFilter, setFlowFilter] = useState<string[]>([]);
  const [textSearchOpen, setTextSearchOpen] = useState(false);
  const [textQuery, setTextQuery] = useState('');
  const [debouncedTextQuery, setDebouncedTextQuery] = useState('');
  const textSearchRef = useRef<HTMLDivElement>(null);
  const saved = collectionsContaining('app', app.id).length > 0;

  // Same debounced hand-off as GlobalSearch's own suggestions — the OCR pass
  // behind this is real work per screen, not worth re-running on every
  // keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTextQuery(textQuery), 400);
    return () => window.clearTimeout(t);
  }, [textQuery]);

  // Collapses back to the icon on an outside click, same as every other
  // pill's popover — but only when empty: a typed query is an applied
  // filter, and hiding the one control that shows (and clears) it would
  // strand the grid in a filtered state with no visible way back.
  useDismiss(
    textSearchOpen,
    () => {
      if (!textQuery.trim()) setTextSearchOpen(false);
    },
    textSearchRef,
  );

  const textActive = debouncedTextQuery.trim().length > 0;
  const { data: textSearchData } = useAsync(
    () => (textActive ? inspirationsApi.search(debouncedTextQuery, 'text') : Promise.resolve(null)),
    `app-text-search:${debouncedTextQuery}`,
  );
  const textLoading = textActive && textSearchData === null;
  const textMatchedIds = textActive && textSearchData ? new Set(textSearchData.screens.map((s) => s.id)) : null;
  const textHighlights = textActive ? textSearchData?.textHighlights : undefined;

  const handleSaveClick = () => {
    if (saved) {
      const collections = collectionsContaining('app', app.id);
      collections.forEach(c => {
        toggleInCollection(c.id, { type: 'app', id: app.id });
        if (c.items.length === 1) {
          deleteCollection(c.id);
        }
      });
      setFloatRemovedOpen(true);
      setTimeout(() => setFloatRemovedOpen(false), 1600);
    } else {
      setFloatOpen(true);
    }
  };

  const rawTab = params.get('tab');
  const tab: AppTab = TABS.some((t) => t.id === rawTab) ? (rawTab as AppTab) : 'screens';
  const setTab = (t: AppTab) => router.replace(t === 'screens' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const screenIds = new Set(screens.map((s) => s.id));
  const screenById = new Map(screens.map((s) => [s.id, s]));
  const appsMap = new Map([[app.id, app]]);

  const elementCounts = new Map<ElementKind, number>();
  screens.forEach((s) => s.elements.forEach((e) => elementCounts.set(e, (elementCounts.get(e) ?? 0) + 1)));
  // The tab defaults to every screen; picking a category from the menu just
  // narrows this same set rather than swapping in a separate grouped view.
  const uiElementScreens =
    elementFilter.length > 0 ? screens.filter((s) => s.elements.some((e) => elementFilter.includes(e))) : screens;
  // While textActive, an in-flight OCR pass (textMatchedIds still null) shows
  // nothing rather than the unfiltered set — matching a screen that hasn't
  // been checked yet would be worse than a moment of empty grid.
  const textFilter = (list: Screen[]) => (textActive ? list.filter((s) => textMatchedIds?.has(s.id) ?? false) : list);
  // Mirrors the UI Elements pill's own narrowing, but by flow membership
  // instead of element kind.
  const selectedFlowScreenIds =
    flowFilter.length > 0
      ? new Set(flows.filter((f) => flowFilter.includes(f.id)).flatMap((f) => f.screenIds))
      : null;
  const flowFilteredScreens = selectedFlowScreenIds ? screens.filter((s) => selectedFlowScreenIds.has(s.id)) : screens;
  const sortedScreens = textFilter(sortScreens(flowFilteredScreens, sort));
  const sortedUiElementScreens = textFilter(sortScreens(uiElementScreens, sort));

  // Per category, the distinct screens its patterns point back to — the
  // pill's own counts, same "screens" unit the UI Elements pill uses rather
  // than a count of patterns.
  const patternCategoryScreenIds = new Map<string, Set<string>>();
  patterns.forEach((p) => {
    const set = patternCategoryScreenIds.get(p.category) ?? new Set<string>();
    p.screenIds.forEach((id) => {
      if (screenIds.has(id)) set.add(id);
    });
    patternCategoryScreenIds.set(p.category, set);
  });
  const patternCounts = new Map(Array.from(patternCategoryScreenIds, ([category, ids]) => [category, ids.size]));

  // The tab defaults to every screen shown in any pattern; picking a category
  // narrows this same flat set rather than swapping in a grouped-by-pattern
  // view, matching what the UI Elements tab does with element kinds.
  const categoryFilteredPatterns =
    patternFilter.length > 0 ? patterns.filter((p) => patternFilter.includes(p.category)) : patterns;
  const patternScreenIds = new Set(categoryFilteredPatterns.flatMap((p) => p.screenIds));
  const patternScreens = screens.filter((s) => patternScreenIds.has(s.id));
  const sortedPatternScreens = textFilter(sortScreens(patternScreens, sort));

  // Docks into the header on scroll, same as the browse pages' own filter
  // toolbar (ToolbarRow) — reuses its scroll-tracking/portal hook so both
  // read the "past the header edge" boundary identically.
  const { docked, anchorRef, rowRef, headerContent } = useDockingRow();

  const renderTabbarRow = (inHeader = false) => (
    <div
      ref={inHeader ? undefined : rowRef}
      className={`ins-tabbar-row ${inHeader ? 'is-docked' : ''} ${docked && !inHeader ? 'is-docked-placeholder' : ''}`}
      aria-hidden={docked && !inHeader ? true : undefined}
    >
      {/* Only once docked — in flow the masthead just above already shows
          its own big logo, so a second one here would be redundant until
          that masthead scrolls out of view. */}
      {inHeader && <AppLogo app={app} size={36} className="ins-tabbar-logo" />}

      {/* The scrollable tab list and the category pill are split into
          separate flex children of this row (rather than one shared
          overflow-x:auto container) because the pill's dropdown is
          absolutely positioned: nested inside the scrolling element it was
          clipped/overlapped by that element's implied overflow-y. Keeping
          the scroll container to just the tab buttons lets the popover
          render unclipped while the tabs still scroll on narrow widths. */}
      <div className="ins-tabbar ins-tabbar--counted" role="tablist" aria-label="App content">
        {TABS.map((t) => {
          const count =
            t.id === 'screens'
              ? screens.length
              : t.id === 'flows'
                ? flows.length
                : t.id === 'patterns'
                  ? patterns.length
                  : t.id === 'ui-elements'
                    ? elementCounts.size
                    : undefined;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {tab === t.id && count !== undefined && count > 0 && <span className="ins-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Lets the Screens tab be narrowed to one flow's screens — the exact
          same tree (buildTree/prune, .ins-flowtree markup) the Flows tab's
          own "ins-flows-nav" sidebar uses, reused inside a popover. */}
      {tab === 'screens' && flows.length > 0 && (
        <>
          <span className="ins-ftoolbar-divider" aria-hidden="true" />
          <FlowTreePill flows={flows} screenById={screenById} selected={flowFilter} onApply={setFlowFilter} />
        </>
      )}

      {/* Lets a UI-heavy app's screens be narrowed to one or more element
          kinds (Nav Bar, List, Search Bar, …) without leaving the tab row —
          checkbox multi-select with its own search, per Figma's
          "ui-elements-menu". */}
      {tab === 'ui-elements' && elementCounts.size > 0 && (
        <>
          <span className="ins-ftoolbar-divider" aria-hidden="true" />
          <CheckboxFilterPill
            label="UI Elements"
            options={Array.from(elementCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([kind, count]) => ({ value: kind, label: elementLabel(kind), count }))}
            selected={elementFilter}
            onToggle={(v) =>
              setElementFilter((prev) => (prev.includes(v) ? prev.filter((k) => k !== v) : [...prev, v]))
            }
            onClear={() => setElementFilter([])}
          />
        </>
      )}

      {/* Same checkbox multi-select, narrowing the pattern grid by category
          (Navigation, Search, Cards, …) instead of element kind. */}
      {tab === 'patterns' && patternCounts.size > 0 && (
        <>
          <span className="ins-ftoolbar-divider" aria-hidden="true" />
          <CheckboxFilterPill
            label="Patterns"
            options={Array.from(patternCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([category, count]) => ({ value: category, label: category, count }))}
            selected={patternFilter}
            onToggle={(v) =>
              setPatternFilter((prev) => (prev.includes(v) ? prev.filter((k) => k !== v) : [...prev, v]))
            }
            onClear={() => setPatternFilter([])}
          />
        </>
      )}

      {/* Right-aligned so the tab row carries both the navigation and the
          sort control for whichever screen grid is on view — same grouping
          and gap the filter toolbar uses for its own right edge. The Flows
          tab shows its own browser (FlowsBrowser), not a ScreenGrid —
          neither the text search nor the sort control does anything there,
          so neither renders there. */}
      {tab !== 'flows' && (
        <div className="ins-ftoolbar-right">
          <div className="ins-text-search-wrap" ref={textSearchRef}>
          {textSearchOpen ? (
            <div className="ins-text-search">
              <SearchIcon size={16} />
              <input
                type="text"
                autoFocus
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder="Search text in screenshot..."
                aria-label="Search text in screenshot"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setTextSearchOpen(false);
                    setTextQuery('');
                  }
                }}
              />
              <button
                type="button"
                className="ins-text-search-close"
                aria-label="Close text search"
                onClick={() => {
                  setTextSearchOpen(false);
                  setTextQuery('');
                }}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ins-text-search-trigger"
              aria-label="Search text in screenshot"
              onClick={() => setTextSearchOpen(true)}
            >
              <img alt="" width={20} height={20} src="/ASSET/Icons/Motvin/text-in-screenshot.svg" />
            </button>
          )}
          </div>
          <span className="ins-ftoolbar-divider" aria-hidden="true" />
          <SortPill value={sort} options={DETAIL_SORTS} onChange={setSort} />
        </div>
      )}
    </div>
  );

  return (
    <>


      {/*
        Masthead, read top to bottom: mark, then what the product is, then the
        facts about it, then what you can do with it. Stacking rather than
        packing everything onto one line is what gives a detail page a sense of
        arrival — this is a destination, not another row in a list.
      */}
      <header className="ins-masthead">
        <div className="ins-masthead-main">
        <AppLogo app={app} size={90} className="ins-masthead-logo" />

        <h1 className="ins-masthead-title">
          {app.name}
          {app.tagline && (
            <>
              <span className="ins-masthead-dash"> — </span>
              <span className="ins-masthead-tagline">{app.tagline}</span>
            </>
          )}
        </h1>

        {app.license && (
          <p className="ins-masthead-note">
            Screens shown under {app.license} · credit {app.attribution}
          </p>
        )}

        {/* Label above value, in columns. A run of "a · b · c" hides which
            fact is which; labelling them makes the page scannable. */}
        <dl className="ins-masthead-facts">
          <div className="ins-fact">
            <dt>Platform</dt>
            <dd>{app.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(', ')}</dd>
          </div>

          <div className="ins-fact">
            <dt>Category</dt>
            <dd>{INDUSTRY_LABEL[app.industry] ?? app.industry}</dd>
          </div>

          {/* Last, and live from Firestore. The rating itself is public — every
              visitor sees what everyone else scored an app, signed in or not —
              so AppRating decides for itself, after the real data has loaded,
              whether there is anything to show. Only the ability to add a
              rating is gated on being signed in.

              Screen and flow counts used to sit here too; they are already in
              the tab row above and in "Showing N", so repeating them made the
              same number appear three times on one screen. */}
          <AppRating appId={app.id} appName={app.name} seed={app.rating} seedCount={app.ratingCount} />
        </dl>
        </div>

        <div className="ins-masthead-actions">
          <button
            type="button"
            className={`ins-btn ins-btn--masthead-save ${saved ? 'is-active' : ''}`}
            onClick={handleSaveClick}
          >
            <img src={`/ASSET/Icons/Motvin/${saved ? 'saved.svg' : 'unsaved.svg'}`} alt="" width={16} height={16} />
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
          <a href={app.website || '#'} target="_blank" rel="noopener noreferrer" className="ins-btn ins-btn--masthead-store">
            <img src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={16} height={16} />
            <span>View in App Store</span>
          </a>
          <AppMenu app={app} screens={screens} />
        </div>
      </header>

      {floatOpen && (
        <FloatCollectionBar
          apps={[app]}
          onClose={() => setFloatOpen(false)}
          onSaved={() => setFloatOpen(false)}
        />
      )}

      {floatRemovedOpen && (
        <div className="ins-float-collection" role="status" aria-live="polite">
          <div className="ins-float-collection-success">
            <span className="ins-float-collection-success-check" aria-hidden>
              <span />
            </span>
            Removed from collection
          </div>
        </div>
      )}

      <div ref={anchorRef} className="ins-ftoolbar-anchor">
        {renderTabbarRow()}
        {docked && headerContent && createPortal(renderTabbarRow(true), headerContent)}
      </div>

      {tab === 'screens' && (
        <section className="ins-tabpanel ins-shot-panel">
          {textLoading ? (
            <ScreenGridSkeleton count={screens.length || 8} />
          ) : (
            <ScreenGrid
              screens={sortedScreens}
              apps={appsMap}
              showApp={false}
              showMeta={false}
              selectable
              textHighlights={textHighlights}
              empty={
                <EmptyState
                  title={textActive ? 'No screenshots matched that text' : 'No screens stored for this app yet'}
                />
              }
            />
          )}
        </section>
      )}

      {tab === 'flows' && (
        <section className="ins-tabpanel">
          {flows.length === 0 ? (
            <EmptyState title="No flows stored for this app yet" />
          ) : (
            // Inside one product the categories are what you navigate by, so
            // this view groups them in a list rather than listing them flat as
            // the all-flows page does.
            <FlowsBrowser
              entries={flows.map((f) => ({
                flow: f,
                screens: f.screenIds.map((id) => screenById.get(id)).filter((s): s is Screen => Boolean(s)),
              }))}
              apps={new Map([[app.id, app]])}
            />
          )}
        </section>
      )}

      {tab === 'ui-elements' && (
        <section className="ins-tabpanel ins-shot-panel">
          {elementCounts.size === 0 ? (
            <EmptyState title="No components recorded for this app's screens yet" />
          ) : textLoading ? (
            <ScreenGridSkeleton count={uiElementScreens.length || 8} />
          ) : (
            // Defaults to every screen; the UI Elements pill above narrows
            // this same grid rather than swapping in a separate grouped list.
            <ScreenGrid
              screens={sortedUiElementScreens}
              apps={appsMap}
              showApp={false}
              showMeta={false}
              selectable
              textHighlights={textHighlights}
              empty={
                <EmptyState title={textActive ? 'No screenshots matched that text' : 'No screens matched this element'} />
              }
            />
          )}
        </section>
      )}

      {tab === 'patterns' && (
        <section className="ins-tabpanel ins-shot-panel">
          {patterns.length === 0 ? (
            <EmptyState title="No patterns matched this app's screens yet" />
          ) : textLoading ? (
            <ScreenGridSkeleton count={patternScreens.length || 6} />
          ) : (
            // Defaults to every screen shown in a pattern; the Patterns pill
            // above narrows this same grid rather than grouping by pattern.
            <ScreenGrid
              screens={sortedPatternScreens}
              apps={appsMap}
              showApp={false}
              showMeta={false}
              selectable
              textHighlights={textHighlights}
              empty={
                <EmptyState title={textActive ? 'No screenshots matched that text' : 'No screens matched this category'} />
              }
            />
          )}
        </section>
      )}
    </>
  );
}
