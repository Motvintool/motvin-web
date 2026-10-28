'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { screenItemId } from '@/lib/inspirations/savedItems';
import { elementLabel, INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, PLATFORMS, type App, type ElementKind, type Flow, type Pattern, type Platform, type Screen } from '@/lib/inspirations/types';
import { appPlatform, storeAction } from '@/lib/inspirations/storeAction';
import { savedAppId } from '@/lib/inspirations/savedApps';
import { AppLogo } from '../AppLogo';
import { MastheadLogo } from '../MastheadLogo';
import { PlatformPeek } from '../PlatformPeek';
import { appPrototypeFlowId, FLOW_PARAM, PLAY_PARAM } from '../FlowPreview';
import { AppMenu } from '../AppMenu';
import { COMPARE_PARAM, CompareScreens, defaultCompareType } from '../CompareScreens';
import { AppPaletteMenu, useAppPalette } from '../AppPalette';
import { AppRating } from '../AppRating';
import { ReviewBadge } from '../admin/ReviewBadge';
import { StoreStrip } from '../StoreStrip';
import { StoreRankBadge } from '../StoreRankBadge';
import { useDownloadAllScreens } from '../useDownloadAllScreens';
import { useLibrary } from '../useLibrary';
import { FloatCollectionBar } from '../FloatCollectionBar';
import { sameItem, useRemoveWithUndo } from '../useRemoveWithUndo';
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


import { ScreenGrid } from '../ScreenGrid';
import { ScreenGridSkeleton } from '../Skeletons';
import { contentKey, useFitResults } from '../useFitResults';
import { useAsync } from '../useAsync';
import { SHEET_QUERY, useMediaQuery } from '../useSheet';

type AppTab = 'screens' | 'flows' | 'ui-elements' | 'patterns';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'screens', label: 'Screens' },
  { id: 'ui-elements', label: 'UI Elements' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'flows', label: 'Flows' },
];

/** The right-edge control's options: the app's dated captures, newest first,
 * with the newest one always labeled "Latest". */
function versionOptions(versions: App['versions']): SortOption<string>[] {
  return versions.map((v) => ({ value: v.id, label: v.isLatest ? 'Latest' : v.label }));
}

/** For useSyncExternalStore's "is this the browser yet": nothing to subscribe to. */
const noSubscribe = () => () => {};

/**
 * A tabbar filter pill (Figma: "ui-elements-menu") — a checkbox multi-select
 * with a live search, rather than the plain single-select list the other
 * FilterPill dimensions use. Not folded into FilterPill since no other
 * dimension has a search box or lets more than one value apply at once. Used
 * by the UI Elements and Patterns tabs here and by the search page's Patterns
 * tab — only the label, options and search copy differ.
 */

export function CheckboxFilterPill({
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
    inputRef.current?.focus({ preventScroll: true });
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
                  optionsRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus({ preventScroll: true });
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
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    inputRef.current?.focus({ preventScroll: true });
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
    ? prune(tree, (entry) => entry.flow.name.toLowerCase().includes(q))
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

  // Same rows as FlowsBrowser's own renderNode: journey names only, with the
  // journeys that branch from one nested beneath it. Screens aren't listed.
  const renderNode = (node: FlowTreeNode) => {
    const { flow } = node.entry;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(flow.id) && !q;
    const checked = pending.includes(flow.id);
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
            <span className="ins-flowtree-label" title={flow.name}>{flow.name}</span>
          </button>
          {hasChildren && (
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
        {hasChildren && !isCollapsed && <ul className="ins-flowtree-children">{node.children.map(renderNode)}</ul>}
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
                  optionsRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus({ preventScroll: true });
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

/** A link to the same app on one of its platforms, for the masthead's Platform line. */
type PlatformLink = { platform: Platform; href: string; current: boolean; preview: Screen[] };

/**
 * /inspirations/app/[slug] — one product, one platform at a time. An app on more than one
 * platform (Claude on iOS and as a web app) shows the one in `?platform=` — iOS first by
 * default — with only that platform's screens, flows and versions, and its Platform line
 * links to the others.
 */
export function AppDetailView({ app, screens, flows, patterns }: { app: App; screens: Screen[]; flows: Flow[]; patterns: Pattern[] }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const present = PLATFORMS.filter((p) => screens.some((s) => s.platform === p));
  if (present.length < 2) return <AppDetailBody app={app} screens={screens} flows={flows} patterns={patterns} />;

  const asked = params.get('platform') as Platform | null;
  const platform = asked && present.includes(asked) ? asked : present[0];
  const onPlatform = screens.filter((s) => s.platform === platform);
  const onPlatformIds = new Set(onPlatform.map((s) => s.id));
  const platformFlows = flows.filter((f) => f.platform === platform);
  // This platform's versions only, the newest of them "Latest".
  const versions = (app.versions ?? []).filter((v) => onPlatform.some((s) => s.version === v.id));
  const newest = versions.reduce<typeof versions[number] | null>((best, v) => (!best || v.capturedAt > best.capturedAt ? v : best), null);
  const scoped: App = {
    ...app,
    platforms: [platform],
    versions: versions.map((v) => ({ ...v, isLatest: v.id === newest?.id })),
    currentVersion: newest?.id ?? null,
    screenCount: onPlatform.length,
    flowCount: platformFlows.length,
    cardScreens: (app.cardScreens ?? []).filter((id) => onPlatformIds.has(id)),
  };
  // Switching keeps the tab, nothing else: a screen or flow open on one platform is not on the other.
  const links: PlatformLink[] = present.map((p) => {
    const sp = new URLSearchParams();
    const tab = params.get('tab');
    if (tab) sp.set('tab', tab);
    if (p !== present[0]) sp.set('platform', p);
    const query = sp.toString();
    // Its hover preview: that platform's card pictures, else its first screens.
    const theirs = screens.filter((s) => s.platform === p);
    const picked = (app.cardScreens ?? []).map((id) => theirs.find((s) => s.id === id)).filter((s): s is Screen => Boolean(s));
    return { platform: p, current: p === platform, href: query ? `${pathname}?${query}` : pathname, preview: (picked.length ? picked : theirs).slice(0, 4) };
  });
  return <AppDetailBody key={platform} app={scoped} screens={onPlatform} flows={platformFlows} patterns={patterns} platformLinks={links} />;
}

function AppDetailBody({
  app,
  screens,
  flows,
  patterns,
  platformLinks,
}: {
  app: App;
  screens: Screen[];
  flows: Flow[];
  patterns: Pattern[];
  /** The app's platforms as links, when it has more than one; the current one first in weight. */
  platformLinks?: PlatformLink[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { collectionsContaining } = useLibrary();
  const [floatOpen, setFloatOpen] = useState(false);
  const removeWithUndo = useRemoveWithUndo();
  const [elementFilter, setElementFilter] = useState<ElementKind[]>([]);
  const [version, setVersion] = useState<string>(app.currentVersion ?? '');
  const [patternFilter, setPatternFilter] = useState<string[]>([]);
  const [flowFilter, setFlowFilter] = useState<string[]>([]);
  const [textSearchOpen, setTextSearchOpen] = useState(false);
  // The search field takes focus as it opens — without scrolling: it sits in the tab bar, which may be docked
  // in the sticky header, and a focus that scrolls would send the page to the header's own place at the top.
  const textInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (textSearchOpen) textInputRef.current?.focus({ preventScroll: true });
  }, [textSearchOpen]);
  const [textQuery, setTextQuery] = useState('');
  // A phone's field is narrow (it shares a line with the version picker).
  const textPlaceholder = useMediaQuery(SHEET_QUERY) ? 'Search text…' : 'Search text in screenshot...';
  const [debouncedTextQuery, setDebouncedTextQuery] = useState('');
  const textSearchRef = useRef<HTMLDivElement>(null);
  // Saved by platform when the app is on several (this page shows one of them).
  const savedId = savedAppId(app.id, app.platforms[0], Boolean(platformLinks));
  const saved = collectionsContaining('app', savedId).length > 0;

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
    () => (textActive ? inspirationsApi.search(debouncedTextQuery, 'text', app.id) : Promise.resolve(null)),
    `app-text-search:${app.id}:${debouncedTextQuery}`,
  );
  const textLoading = textActive && textSearchData === null;
  const textMatchedIds = textActive && textSearchData ? new Set(textSearchData.screens.map((s) => s.id)) : null;
  const textHighlights = textActive ? textSearchData?.textHighlights : undefined;

  // The bookmark springs the moment the app becomes saved — and only then: the previous value is kept in state
  // and compared during render, so arriving on an already-saved app plays nothing.
  const [savedBefore, setSavedBefore] = useState(saved);
  const [savePop, setSavePop] = useState(false);
  if (saved !== savedBefore) {
    setSavedBefore(saved);
    if (saved) setSavePop(true);
  }

  const handleSaveClick = () => {
    if (saved) {
      // Out of every collection it's in; the collections themselves stay.
      removeWithUndo(collectionsContaining('app', savedId).map((c) => ({ collectionId: c.id, match: sameItem('app', savedId) })));
    } else {
      setFloatOpen(true);
    }
  };

  const rawTab = params.get('tab');
  const tab: AppTab = TABS.some((t) => t.id === rawTab) ? (rawTab as AppTab) : 'screens';
  // The tab is in the address; so is the platform on an app that has several, and switching tabs keeps it.
  const setTab = (t: AppTab) => {
    const sp = new URLSearchParams();
    const platform = params.get('platform');
    if (platform) sp.set('platform', platform);
    if (t !== 'screens') sp.set('tab', t);
    const query = sp.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // "View in App Store" for a phone app, "Visit website" for a Web one.
  const store = storeAction(appPlatform(app), app.website);
  // The logo view, opened by the masthead logo itself or from the "…" menu,
  // or by `?logo=1` (back from signing in to copy or download a logo). That
  // param is dropped once read, so a reload doesn't reopen it. The view is
  // held until the page is hydrated: it renders into document.body, which
  // the server doesn't have.
  const [logoOpen, setLogoOpen] = useState(() => params.get('logo') === '1');
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  useEffect(() => {
    if (params.get('logo') !== '1') return;
    const rest = new URLSearchParams(params.toString());
    rest.delete('logo');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  const hasLogo = Boolean(inspirationsApi.mediaUrl(app.logo));
  const dl = useDownloadAllScreens(app, screens);
  const screenIds = new Set(screens.map((s) => s.id));
  const screenById = new Map(screens.map((s) => [s.id, s]));
  const appsMap = new Map([[app.id, app]]);

  // The version pill narrows every tab to one dated capture at a time — the
  // same screens/flows the rest of the page's filters (element, pattern,
  // flow, text) then narrow further, so switching versions never has to
  // reset those other picks.
  const versionScreens = version ? screens.filter((s) => s.version === version) : screens;
  const versionFlows = version ? flows.filter((f) => !f.version || f.version === version) : flows;
  // The prototype on the Screens grid's first card (its "Prototype" badge):
  // every screen of the app, played in the flow player from the first.
  const prototypeHref = (() => {
    if (versionScreens.length < 2) return null;
    const sp = new URLSearchParams(params.toString());
    sp.delete('screen');
    sp.delete('step');
    // On an app with several platforms, the prototype of the one on show (its page is scoped to it).
    sp.set(FLOW_PARAM, appPrototypeFlowId(app.slug, platformLinks ? app.platforms[0] : undefined));
    // Opened playing: a prototype, not a still.
    sp.set(PLAY_PARAM, '1');
    return `${pathname}?${sp.toString()}`;
  })();

  const elementCounts = new Map<ElementKind, number>();
  versionScreens.forEach((s) => s.elements.forEach((e) => elementCounts.set(e, (elementCounts.get(e) ?? 0) + 1)));
  // The tab defaults to every screen; picking a category from the menu just
  // narrows this same set rather than swapping in a separate grouped view.
  const uiElementScreens =
    elementFilter.length > 0 ? versionScreens.filter((s) => s.elements.some((e) => elementFilter.includes(e))) : versionScreens;
  // While textActive, an in-flight OCR pass (textMatchedIds still null) shows
  // nothing rather than the unfiltered set — matching a screen that hasn't
  // been checked yet would be worse than a moment of empty grid.
  const textFilter = (list: Screen[]) => (textActive ? list.filter((s) => textMatchedIds?.has(s.id) ?? false) : list);
  // Mirrors the UI Elements pill's own narrowing, but by flow membership
  // instead of element kind.
  const selectedFlowScreenIds =
    flowFilter.length > 0
      ? new Set(versionFlows.filter((f) => flowFilter.includes(f.id)).flatMap((f) => f.screenIds))
      : null;
  const flowFilteredScreens = selectedFlowScreenIds ? versionScreens.filter((s) => selectedFlowScreenIds.has(s.id)) : versionScreens;
  const sortedScreens = textFilter(flowFilteredScreens);
  const sortedUiElementScreens = textFilter(uiElementScreens);

  // Per category, the distinct screens its patterns point back to — the
  // pill's own counts, same "screens" unit the UI Elements pill uses rather
  // than a count of patterns.
  const versionScreenIds = new Set(versionScreens.map((s) => s.id));
  const patternCategoryScreenIds = new Map<string, Set<string>>();
  patterns.forEach((p) => {
    const set = patternCategoryScreenIds.get(p.category) ?? new Set<string>();
    p.screenIds.forEach((id) => {
      if (versionScreenIds.has(id)) set.add(id);
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
  const patternScreens = versionScreens.filter((s) => patternScreenIds.has(s.id));
  const sortedPatternScreens = textFilter(patternScreens);
  // A selection here saves as patterns, under the category it was found in
  // (a picked one first); on UI Elements, as the element picked, else the
  // screen's first.
  const savePattern = (s: Screen) => ({
    type: 'pattern' as const,
    id: screenItemId(s.id, categoryFilteredPatterns.find((p) => p.screenIds.includes(s.id))?.category ?? ''),
  });
  const saveElement = (s: Screen) => ({
    type: 'component' as const,
    id: screenItemId(s.id, s.elements.find((e) => elementFilter.includes(e)) ?? s.elements[0] ?? ''),
  });
  const versionPatternCount = patterns.filter((p) => p.screenIds.some((id) => versionScreenIds.has(id))).length;

  // The app's colours (from the shown version's screens), behind the
  // Palette button next to Save.
  const palette = useAppPalette(app, versionScreens, version);
  // "Compare screens" opens on login if this version has any, else its most common type.
  const compareType = defaultCompareType(versionScreens);

  // Docks into the header on scroll, same as the browse pages' own filter
  // toolbar (ToolbarRow) — reuses its scroll-tracking/portal hook so both
  // read the "past the header edge" boundary identically.
  const { docked, leaving, anchorRef, rowRef, headerContent } = useDockingRow();
  // A tab, version or filter changed while scrolled into the content: once the new panel is in, bring it to
  // the fitted view under the docked tab bar. Opening a screen, a flow or the logo view is not a change of
  // content, so those are left out of the key (contentKey). The tab bar's parent holds the panels too.
  // The page's own filters live in state, not the URL, so they're part of the key too.
  const fitKey = `${contentKey(params)}|${version}|${elementFilter.join(',')}|${patternFilter.join(',')}|${flowFilter.join(',')}|${debouncedTextQuery}`;
  useFitResults(fitKey, () => anchorRef.current?.parentElement ?? null, '.ins-tabpanel');

  const renderTabbarRow = (inHeader = false) => (
    <div
      ref={inHeader ? undefined : rowRef}
      className={`ins-tabbar-row ${inHeader ? 'is-docked' : ''} ${inHeader && !docked ? 'is-leaving' : ''} ${docked && !inHeader ? 'is-docked-placeholder' : ''}`}
      aria-hidden={docked && !inHeader ? true : undefined}
    >
      {/* Only once docked — in flow the masthead just above already shows
          its own big logo, so a second one here would be redundant until
          that masthead scrolls out of view. */}
      {/* A way back up: the docked logo returns to the top of the page. */}
      {inHeader && (
        <button
          type="button"
          className="ins-tabbar-logo-btn"
          aria-label={`Back to the top of ${app.name}`}
          title="Back to top"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            })
          }
        >
          <AppLogo app={app} size={36} className="ins-tabbar-logo" />
        </button>
      )}

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
              ? versionScreens.length
              : t.id === 'flows'
                ? versionFlows.length
                : t.id === 'patterns'
                  ? versionPatternCount
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
      {tab === 'screens' && versionFlows.length > 0 && (
        <>
          <span className="ins-ftoolbar-divider" aria-hidden="true" />
          <FlowTreePill flows={versionFlows} screenById={screenById} selected={flowFilter} onApply={setFlowFilter} />
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
          version picker for whichever grid is on view — same grouping and gap
          the filter toolbar uses for its own right edge. The Flows tab shows
          its own browser (FlowsBrowser), not a ScreenGrid, so the text search
          doesn't apply there — but the version picker still does, the same
          control in the same spot on every tab. */}
      <div className="ins-ftoolbar-right">
        {tab !== 'flows' && (
          <>
            <div className="ins-text-search-wrap" ref={textSearchRef}>
            {textSearchOpen ? (
              <div className="ins-text-search">
                <SearchIcon size={16} />
                <input
                  ref={textInputRef}
                  type="text"
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  placeholder={textPlaceholder}
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
          </>
        )}
        <SortPill
          value={version}
          options={versionOptions(app.versions)}
          onChange={(v) => {
            setVersion(v);
            setFlowFilter([]);
          }}
        />
      </div>
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
        <div className="ins-masthead-brand">
          <MastheadLogo app={app} open={logoOpen && hydrated} onOpenChange={setLogoOpen} />
          <StoreRankBadge name={app.name} platform={appPlatform(app)} />
        </div>

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
            <dd>
              {platformLinks
                ? platformLinks.map((link, i) => (
                    <span key={link.platform}>
                      {i > 0 && ', '}
                      {link.current ? (
                        <span className="ins-fact-platform is-current" aria-current="page">{PLATFORM_LABEL[link.platform] ?? link.platform}</span>
                      ) : (
                        <PlatformPeek app={app} platform={link.platform} label={PLATFORM_LABEL[link.platform] ?? link.platform} href={link.href} screens={link.preview}>
                          {PLATFORM_LABEL[link.platform] ?? link.platform}
                        </PlatformPeek>
                      )}
                    </span>
                  ))
                : app.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(', ')}{' '}
              <ReviewBadge appId={app.id} platform={appPlatform(app)} version={version || app.currentVersion} />
            </dd>
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
            <img
              src={`/ASSET/Icons/Motvin/${saved ? 'saved.svg' : 'unsaved.svg'}`}
              alt=""
              width={16}
              height={16}
              className={savePop ? 'is-pop' : undefined}
              onAnimationEnd={() => setSavePop(false)}
            />
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
          <AppPaletteMenu
            app={app}
            colors={palette}
            screens={versionScreens}
            flowCount={versionFlows.length}
            patternCount={versionPatternCount}
          />
          <AppMenu
            busy={dl.busy}
            versions={app.versions ?? []}
            store={store ? { name: app.name, platform: appPlatform(app), action: store } : undefined}
            compareHref={compareType ? `${pathname}?${COMPARE_PARAM}=${encodeURIComponent(compareType)}` : undefined}
            onDownloadAll={() => void dl.downloadAll()}
            onDownloadVersion={(id) => void dl.downloadVersion(id)}
            onOpenLogo={hasLogo ? () => setLogoOpen(true) : undefined}
          />
        </div>
      </header>

      <CompareScreens app={app} screens={versionScreens} />

      <StoreStrip
        name={app.name}
        platform={appPlatform(app)}
      />

      {floatOpen && (
        <FloatCollectionBar
          apps={[app]}
          items={[{ type: 'app', id: savedId }]}
          onClose={() => setFloatOpen(false)}
          onSaved={() => setFloatOpen(false)}
        />
      )}

      <div ref={anchorRef} className="ins-ftoolbar-anchor">
        {renderTabbarRow()}
        {(docked || leaving) && headerContent && createPortal(renderTabbarRow(true), headerContent)}
      </div>

      {tab === 'screens' && (
        <section className="ins-tabpanel ins-shot-panel">
          {textLoading ? (
            <ScreenGridSkeleton count={versionScreens.length || 8} meta={false} />
          ) : (
            <ScreenGrid
              screens={sortedScreens}
              apps={appsMap}
              webGrid={app.platforms.some(isDesktopPlatform)}
              showApp={false}
              showMeta={false}
              selectable
              textHighlights={textHighlights}
              prototype={
                // Not over a narrowed grid: it plays every screen, so it would be the one card off the filter.
                prototypeHref && sortedScreens[0] && !textActive && !selectedFlowScreenIds
                  ? { screenId: sortedScreens[0].id, href: prototypeHref, label: `Prototype: play all of ${app.name}'s screens`, screens: versionScreens }
                  : undefined
              }
              empty={
                <EmptyState
                  play={textActive && 'inline'}
                  title={textActive ? 'No screens found' : 'No screens stored for this app yet'}
                />
              }
            />
          )}
        </section>
      )}

      {tab === 'flows' && (
        <section className="ins-tabpanel">
          {versionFlows.length === 0 ? (
            <EmptyState title="No flows stored for this app yet" />
          ) : (
            // Inside one product the categories are what you navigate by, so
            // this view groups them in a list rather than listing them flat as
            // the all-flows page does.
            <FlowsBrowser
              entries={versionFlows.map((f) => ({
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
            <ScreenGridSkeleton count={uiElementScreens.length || 8} meta={false} />
          ) : (
            // Defaults to every screen; the UI Elements pill above narrows
            // this same grid rather than swapping in a separate grouped list.
            <ScreenGrid
              screens={sortedUiElementScreens}
              apps={appsMap}
              webGrid={app.platforms.some(isDesktopPlatform)}
              showApp={false}
              showMeta={false}
              selectable
              saveItem={saveElement}
              textHighlights={textHighlights}
              empty={
                <EmptyState play="inline" title={textActive ? 'No screens found' : 'No screens matched this element'} />
              }
            />
          )}
        </section>
      )}

      {tab === 'patterns' && (
        <section className="ins-tabpanel ins-shot-panel">
          {versionPatternCount === 0 ? (
            <EmptyState title="No patterns matched this app's screens yet" />
          ) : textLoading ? (
            <ScreenGridSkeleton count={patternScreens.length || 6} meta={false} />
          ) : (
            // Defaults to every screen shown in a pattern; the Patterns pill
            // above narrows this same grid rather than grouping by pattern.
            <ScreenGrid
              screens={sortedPatternScreens}
              apps={appsMap}
              webGrid={app.platforms.some(isDesktopPlatform)}
              showApp={false}
              showMeta={false}
              selectable
              saveItem={savePattern}
              textHighlights={textHighlights}
              empty={
                <EmptyState play="inline" title={textActive ? 'No screens found' : 'No screens matched this category'} />
              }
            />
          )}
        </section>
      )}
    </>
  );
}
