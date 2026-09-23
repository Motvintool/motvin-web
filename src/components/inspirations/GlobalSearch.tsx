'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_FILTERS } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { inspirationsApi } from '@/lib/inspirations/api';
import { suggestQueries, type SearchSuggestion } from '@/lib/inspirations/search';
import { INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Industry, Platform, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { AndroidIcon, AppleIcon, CloseIcon, SearchIcon, WebIcon } from './Icons';

const FIGMA_APP_ART = '/ASSET/search-modal/figma-02.png';
/** Lives under the shared Motvin icon set (`/ASSET/Icons/Motvin/`), not
 * alongside the rest of the search modal's own icons in
 * `/ASSET/search-modal/icons/` — kept at its existing path instead of
 * duplicating it into the modal's own folder. */
const TEXT_IN_SCREENSHOT_ICON = '/ASSET/Icons/Motvin/text-in-screenshot.svg';
const FIGMA_MODAL_ICONS = {
  search: '/ASSET/search-modal/icons/search.svg',
  list: '/ASSET/search-modal/icons/list.svg',
  grid: '/ASSET/search-modal/icons/grid.svg',
  flow: '/ASSET/search-modal/icons/flow.svg',
  topRated: '/ASSET/search-modal/icons/top-rated.svg',
  categories: '/ASSET/search-modal/icons/categories.svg',
} as const;
/** The modal's platform switch — Apple's icon reads as "iOS" here, matching
 * the header's own platform nav. Inline icon components rather than the
 * `<img src>` asset files the rest of this modal uses: an externally-loaded
 * SVG image can't be recolored by the surrounding page's CSS (`currentColor`
 * only resolves through CSS inheritance when the SVG is actually in the DOM),
 * so there'd be no way to switch between the active/inactive colors below. */
const MODAL_PLATFORMS: { value: Platform; Icon: typeof AppleIcon }[] = [
  { value: 'ios', Icon: AppleIcon },
  { value: 'android', Icon: AndroidIcon },
  { value: 'web', Icon: WebIcon },
];
const FIGMA_TOP_RATED_CARDS = [
  ['Login', 'login'],
  ['Signup', 'signup'],
  ['Home', 'home'],
  ['Dashboard', 'dashboard'],
  ['Search', 'search'],
  ['Checkout', 'checkout'],
  ['Setting', 'setting'],
] as const;
const RECENT_SEARCHES_STORAGE_KEY = 'motvin-recent-searches';
const RECENT_SEARCH_ICON_SOURCES = {
  app: FIGMA_APP_ART,
  search: FIGMA_MODAL_ICONS.search,
  list: FIGMA_MODAL_ICONS.list,
  grid: FIGMA_MODAL_ICONS.grid,
  flow: FIGMA_MODAL_ICONS.flow,
} as const;
type RecentSearchIcon = keyof typeof RECENT_SEARCH_ICON_SOURCES;
type RecentSearch = { query: string; icon: RecentSearchIcon; iconSrc?: string };

function recentSearchIconFor(query: string, suggestion?: SearchSuggestion): RecentSearchIcon {
  if (suggestion?.hint.startsWith('App')) return 'app';
  if (suggestion?.hint === 'Screen type') return 'grid';
  if (suggestion?.hint.startsWith('Pattern')) return 'flow';
  if (suggestion?.hint === 'Industry') return 'list';

  const normalizedQuery = query.toLowerCase();
  if (normalizedQuery.includes('flow') || normalizedQuery.includes('auth')) return 'flow';
  if (normalizedQuery.includes('list')) return 'list';
  if (normalizedQuery.includes('home') || normalizedQuery.includes('setting') || normalizedQuery.includes('screen')) return 'grid';
  if (normalizedQuery.includes('app')) return 'app';
  return 'search';
}

function loadRecentSearches(): RecentSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const searches = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? '[]');
    return Array.isArray(searches) ? searches.flatMap((search): RecentSearch[] => {
      if (typeof search === 'string') return [{ query: search, icon: recentSearchIconFor(search) }];
      if (typeof search?.query === 'string' && search.icon in RECENT_SEARCH_ICON_SOURCES) return [search as RecentSearch];
      return [];
    }).slice(0, 6) : [];
  } catch {
    return [];
  }
}
/**
 * Global search — the heart of the product. Debounced suggestions, keyboard
 * navigation, ⌘K / Ctrl K to focus from anywhere, Enter to run the query.
 */
export function GlobalSearch({ autoFocus = false, className = '' }: { autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [activeSearchAction, setActiveSearchAction] = useState<'search' | 'screenshot' | null>('search');
  const [section, setSection] = useState<'top' | 'categories' | 'screens' | 'elements' | 'flows'>('top');
  // Arrow-key position within whichever single-column section (Categories,
  // Screens, UI Elements, Flows) is currently showing — separate from
  // `active`, which is the same idea for the live-typing suggestions list,
  // since the two are never shown at once but shouldn't share position when
  // switching between them. Not wired up for Top Rated: that tab is several
  // visually distinct grids (apps, screens, elements, flows) side by side,
  // not one list, so a single up/down axis doesn't map onto it cleanly —
  // left mouse/Tab-only rather than force a 2D grid nav scheme onto it.
  const [browseActive, setBrowseActive] = useState(-1);
  // A toggle, not a single-select-always-on control: clicking the active
  // platform again clears it back to "all platforms", same as leaving none
  // of the three picked. Only affects the Top Rated preview here — Apps and
  // Flows carry a real platform each; the decorative Screens showcase (fixed
  // stock imagery behind whichever screen a click happens to land on) and
  // the UI Elements counts (aggregated across all platforms already) have no
  // honest per-platform breakdown to filter with the data this modal fetches.
  const [modalPlatform, setModalPlatform] = useState<Platform | null>('ios');
  const [topApps, setTopApps] = useState<App[]>([]);
  // Unlike `topApps` (there's no dedicated "Apps" sidebar section — apps only
  // ever appear in the Top Rated preview, so capping the fetch itself is
  // fine), these three back BOTH the Top Rated preview AND their own
  // sidebar section (Screens/UI Elements/Flows) — the section needs the
  // real, full list, so nothing here gets truncated at fetch time. The
  // preview-sized slices for the Top Rated tab are derived below instead.
  const [screens, setScreens] = useState<Screen[]>([]);
  const [elements, setElements] = useState<{ kind: string; count: number }[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [categories, setCategories] = useState<{ value: string; label: string; count: number }[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(loadRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<App[]>([]);
  const listId = useId();
  // `close()` focuses the header input back so keyboard focus lands
  // somewhere sensible instead of dropping onto <body> — but focusing it
  // fires the very `onFocus` below that opens the modal, which would reopen
  // it immediately after closing. This suppresses just that one, synchronous
  // re-open; a real click or Tab into the field still opens it normally.
  const suppressAutoOpenRef = useRef(false);

  const close = () => {
    setOpen(false);
  };

  // Keep the field in sync when the URL query changes (Back/Forward). Adjusts
  // state during render — React's documented pattern for deriving from props.
  const urlQuery = params.get('q') ?? '';
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  // ⌘K / Ctrl K focuses search; "/" too when not typing elsewhere; Escape
  // closes the modal from anywhere inside it, not only while a result item
  // happens to be plain-text focused — the per-input Escape handler this
  // replaced only fired while focus was still sitting in the search field
  // itself, so tabbing into the results list and pressing Escape did nothing.
  const handleKeyDownRef = useRef<((e: globalThis.KeyboardEvent | React.KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = open ? modalInputRef.current : inputRef.current;
        input?.focus();
        input?.select();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        (open ? modalInputRef.current : inputRef.current)?.focus();
      } else if (e.key === 'Escape' && open) {
        // Routed through `close()` (defined below) rather than duplicated
        // here — a plain `setOpen(false); inputRef.current?.focus()` skips
        // the guard `close` sets around that same refocus, so the refocus's
        // own `onFocus` handler reopens the modal in the same tick, right
        // back to where it started.
        close();
      } else if (e.key === 'Tab' && open) {
        e.preventDefault();
        if (!value.trim()) {
          setSection((prev) => {
            const keys = ['top', 'categories', 'screens', 'elements', 'flows'] as const;
            const currentIndex = keys.indexOf(prev as any);
            const nextIndex = e.shiftKey ? (currentIndex - 1 + keys.length) % keys.length : (currentIndex + 1) % keys.length;
            return keys[nextIndex];
          });
          setBrowseActive(-1);
        }
        modalInputRef.current?.focus();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && open) {
        const target = e.target as HTMLElement | null;
        if (target !== inputRef.current && target !== modalInputRef.current) {
          e.preventDefault();
          const input = open ? modalInputRef.current : inputRef.current;
          input?.focus();
          handleKeyDownRef.current?.(e);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, value]);

  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  useEffect(() => {
    if (open) modalInputRef.current?.focus();
  }, [open]);

  // Debounced suggestions.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      suggestQueries(value).then((s: SearchSuggestion[]) => {
        if (!cancelled) {
          setSuggestions(s);
          setActive(-1);
          setActiveSearchAction('search');
        }
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      inspirationsApi.listApps(undefined, 'rating'),
      inspirationsApi.listScreens(EMPTY_FILTERS, 0, 'curated'),
      inspirationsApi.listElements(),
      inspirationsApi.listFlows(),
      inspirationsApi.getMeta(),
    ]).then(([apps, screensPage, elementsList, flowsList, meta]) => {
      if (cancelled) return;
      appsRef.current = apps;
      setTopApps(apps.slice(0, 7));
      setRecentSearches((searches) => searches.map((search) => {
        const app = apps.find(({ name }) => name.toLocaleLowerCase() === search.query.toLocaleLowerCase());
        return app && !search.iconSrc ? { ...search, icon: 'app', iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined } : search;
      }));
        setScreens(screensPage.items);
      setElements(elementsList);
        setFlows(flowsList);
        setCategories(
          meta.taxonomy.industries.map((industry) => ({
            value: industry,
            label: INDUSTRY_LABEL[industry as Industry] ?? industry,
            count: apps.filter((app) => app.industry === industry).length,
          })),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !document.querySelector('.ins-search-overlay')?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const addRecentSearch = useCallback((query: string, suggestion?: SearchSuggestion) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    const app = appsRef.current.find(({ name }) => name.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase());
    const search = {
      query: trimmedQuery,
      icon: app ? 'app' : recentSearchIconFor(trimmedQuery, suggestion),
      iconSrc: suggestion?.iconSrc ?? (app ? inspirationsApi.mediaUrl(app.logo) ?? undefined : undefined),
    };
    setRecentSearches((searches) => [
      search,
      ...searches.filter(({ query: existingQuery }) => existingQuery.toLocaleLowerCase() !== trimmedQuery.toLocaleLowerCase()),
    ].slice(0, 6));
  }, []);

  const removeRecentSearch = useCallback((query: string) => {
    setRecentSearches((searches) => searches.filter((search) => search.query !== query));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearches));
  }, [recentSearches]);

  // Shared by the form submit and by clicking a recent search — a past
  // search is something you already ran once, so clicking it re-runs it
  // immediately rather than just dropping it back into the field for a
  // second Enter press.
  const runSearch = useCallback(
    (query: string, mode?: 'text') => {
      const q = query.trim();
      if (!q) return;
      addRecentSearch(q);
      setOpen(false);
      router.push(INSPIRATIONS_ROUTES.searchFor(q, mode));
    },
    [addRecentSearch, router],
  );

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      // Enter (and the form's own submit) fires whichever of the two search
      // actions the pointer last hovered — the same thing clicking it
      // directly would run — rather than always defaulting to a plain
      // search regardless of which one is showing as selected. Without
      // this, hovering "Text in Screenshot" and pressing Enter (the natural
      // thing to do once it looks selected) silently ran a plain search
      // instead, with no highlights and no indication why.
      runSearch(value, activeSearchAction === 'screenshot' ? 'text' : undefined);
    },
    [runSearch, value, activeSearchAction],
  );

  const modalSuggestions = suggestions.slice(0, 12);
  // Matched against the full fetched list, not a 7-item preview slice — a
  // kind that exists but didn't happen to make the Top Rated row's cutoff
  // would otherwise never be found here no matter how exactly it's typed.
  const matchingElements = elements.filter(({ kind }) => kind.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
  const visibleTopApps = modalPlatform ? topApps.filter((app) => app.platforms.includes(modalPlatform)) : topApps;
  const visibleFlows = modalPlatform ? flows.filter((flow) => flow.platform === modalPlatform) : flows;
  // Unlike the Top Rated tab's decorative Screens showcase (fixed stock
  // imagery, positionally paired with whichever screen happens to fill that
  // slot), the dedicated Screens tab lists real screens with real names —
  // each one does carry a genuine platform, so filtering it is honest too.
  const visibleScreens = modalPlatform ? screens.filter((screen) => screen.platform === modalPlatform) : screens;
  // Preview-sized slices for the Top Rated tab only — the sidebar's own
  // Screens/UI Elements/Flows sections use the full lists above instead, so
  // browsing there isn't artificially capped to whatever fits in this row.
  const previewScreens = screens.slice(0, FIGMA_TOP_RATED_CARDS.length);
  const previewElements = elements.slice(0, 7);
  const previewFlows = visibleFlows.slice(0, 12);
  const modalSections = [
    { key: 'top' as const, label: 'Top rated', icon: FIGMA_MODAL_ICONS.topRated },
    { key: 'categories' as const, label: 'Categories', icon: FIGMA_MODAL_ICONS.categories },
    { key: 'screens' as const, label: 'Screens', icon: FIGMA_MODAL_ICONS.grid },
    { key: 'elements' as const, label: 'UI Elements', icon: FIGMA_MODAL_ICONS.list },
    { key: 'flows' as const, label: 'Flows', icon: FIGMA_MODAL_ICONS.flow },
  ];
  // What `browseActive` indexes into for the current section — Top Rated
  // isn't included (see the state comment above), so it's just an empty
  // list there and arrow keys quietly do nothing, same as a section with no
  // items in it yet.
  const browseItems: { onActivate: () => void }[] =
    section === 'top'
      ? [
          ...visibleTopApps.map((app) => ({ onActivate: () => { close(); router.push(INSPIRATIONS_ROUTES.app(app)); } })),
          ...previewScreens.map((screen) => ({ onActivate: () => { close(); router.push(INSPIRATIONS_ROUTES.screen(screen)); } })),
          ...previewElements.map((el) => ({ onActivate: () => { close(); router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(el.kind)}`); } })),
          ...previewFlows.map((flow) => ({ onActivate: () => { close(); router.push(INSPIRATIONS_ROUTES.flow(flow)); } })),
        ]
      : section === 'categories'
      ? categories.map((c) => ({ onActivate: () => { close(); router.push(`${INSPIRATIONS_ROUTES.screens}?industry=${c.value}`); } }))
      : section === 'screens'
        ? visibleScreens.map((s) => ({ onActivate: () => { close(); router.push(INSPIRATIONS_ROUTES.screen(s)); } }))
        : section === 'elements'
          ? elements.map((el) => ({ onActivate: () => { close(); router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(el.kind)}`); } }))
          : section === 'flows'
            ? visibleFlows.map((f) => ({ onActivate: () => { close(); router.push(INSPIRATIONS_ROUTES.flow(f)); } }))
            : [];

  handleKeyDownRef.current = (e: globalThis.KeyboardEvent | React.KeyboardEvent) => {
    if (!value.trim()) {
      // Browsing a section (no query typed) — up/down walks whichever
      // single-column list is showing, Enter opens what's highlighted. A
      // separate branch rather than a fallthrough guard: with nothing
      // typed, `suggestions` has nothing meaningful in it either, so an
      // empty `browseItems` (Top Rated, or a section with nothing in it)
      // must not fall through into the suggestions logic below.
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setBrowseActive((a) => browseItems.length ? (a >= browseItems.length - 1 ? 0 : a + 1) : -1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setBrowseActive((a) => browseItems.length ? (a <= 0 ? browseItems.length - 1 : a - 1) : -1);
      } else if (e.key === 'Enter' && browseActive >= 0 && browseItems[browseActive]) {
        e.preventDefault();
        browseItems[browseActive].onActivate();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (activeSearchAction === 'search') {
        setActiveSearchAction('screenshot');
      } else if (activeSearchAction === 'screenshot') {
        if (modalSuggestions.length > 0) {
          setActiveSearchAction(null);
          setActive(0);
        } else {
          setActiveSearchAction('search');
        }
      } else if (active >= 0 && active < modalSuggestions.length - 1) {
        setActive(active + 1);
      } else {
        setActive(-1);
        setActiveSearchAction('search');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeSearchAction === 'search' || (activeSearchAction === null && active === -1)) {
        if (modalSuggestions.length > 0) {
          setActiveSearchAction(null);
          setActive(modalSuggestions.length - 1);
        } else {
          setActiveSearchAction('screenshot');
          setActive(-1);
        }
      } else if (activeSearchAction === 'screenshot') {
        setActiveSearchAction('search');
      } else if (active > 0) {
        setActive(active - 1);
      } else {
        setActive(-1);
        setActiveSearchAction('screenshot');
      }
    } else if (e.key === 'Enter' && active >= 0 && modalSuggestions[active]) {
      e.preventDefault();
      addRecentSearch(modalSuggestions[active].label, modalSuggestions[active]);
      setOpen(false);
      router.push(modalSuggestions[active].href);
    } else if (e.key === 'Enter') {
      // No suggestion highlighted — run the plain query. Handled explicitly
      // rather than left to the browser's implicit submit-on-Enter, which
      // doesn't reliably fire for a `type="search"` input in every
      // environment; every other key here is already explicit, so Enter
      // shouldn't be the one exception.
      e.preventDefault();
      submit();
    }
    // Escape is handled by the document-level listener above, uniformly for
    // the whole modal rather than only while one of these inputs has focus.
  };
  return (
    <div className={`ins-search ${open ? 'is-open' : ''} ${className}`} ref={rootRef} role="search">
      <form onSubmit={submit} className="ins-search-form">
        <SearchIcon size={16} className="ins-search-icon" />
        <input
          ref={inputRef}
          type="search"
          className="ins-search-input"
          placeholder="Search apps, flows & screens"
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search apps, flows and screens"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          role="combobox"
          onFocus={() => {
            if (!suppressAutoOpenRef.current) setOpen(true);
          }}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDownRef.current as any}
        />
        {value ? (
          <button
            type="button"
            className="ins-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={14} />
          </button>
        ) : (
          <span className="ins-kbd-group" aria-hidden>
            <kbd className="ins-kbd">⌘</kbd>
            <kbd className="ins-kbd">K</kbd>
          </span>
        )}
      </form>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="ins-search-overlay" onClick={close}>
        <div 
          className={`ins-search-modal ${value.trim() ? 'is-searching' : ''}`} 
          id={listId} 
          role="dialog" 
          aria-label="Search results" 
          aria-modal="true" 
          onClick={(event) => event.stopPropagation()}
        >
          <form className="ins-search-modal-head" onSubmit={submit}>
            <div className="ins-search-modal-field">
              <img src={FIGMA_MODAL_ICONS.search} alt="" width={26} height={26} />
              <input
                ref={modalInputRef}
                type="search"
                value={value}
                placeholder="Search apps, flows & screens"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search apps, flows and screens"
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDownRef.current as any}
              />
            </div>
            <div className="ins-search-modal-platforms" role="group" aria-label="Filter by platform">
              {MODAL_PLATFORMS.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={modalPlatform === value ? 'is-active' : ''}
                  aria-pressed={modalPlatform === value}
                  aria-label={PLATFORM_LABEL[value] ?? value}
                  onClick={() => setModalPlatform((current) => (current === value ? null : value))}
                >
                  <Icon size={20} />
                </button>
              ))}
            </div>
          </form>
          {!value.trim() && recentSearches.length > 0 && (
            <div className="ins-search-chips" aria-label="Recent searches">
              {recentSearches.map(({ query, icon, iconSrc }) => (
                <div key={query} className="ins-search-chip">
                  <button type="button" className="ins-search-chip-query" onClick={() => runSearch(query)}><img className={`ins-search-chip-icon ${iconSrc ? 'is-app-logo' : ''}`} src={iconSrc ?? RECENT_SEARCH_ICON_SOURCES[icon]} alt="" width={icon === 'app' || iconSrc ? 28 : 20} height={icon === 'app' || iconSrc ? 28 : 20} />{query}</button>
                  <button type="button" className="ins-search-chip-remove" aria-label={`Remove ${query} from recent searches`} onClick={() => removeRecentSearch(query)}><CloseIcon size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className={`ins-search-modal-body ${!value.trim() ? 'has-nav' : ''}`}>
            {!value.trim() && (
              <nav className="ins-search-modal-nav" aria-label="Search sections">
                {modalSections.map(({ key, label, icon }) => (
                  <button key={key} type="button" tabIndex={-1} className={section === key ? 'is-active' : ''} onClick={() => { setSection(key); setBrowseActive(-1); }}><img src={icon} alt="" width={20} height={20} />{label}</button>
                ))}
              </nav>
            )}
            <div className="ins-search-modal-results" role="listbox">
              {(!value.trim() && section !== 'top') && <div className="ins-search-modal-title">{section === 'categories' ? 'Categories' : section === 'screens' ? 'Screens' : section === 'elements' ? 'UI Elements' : 'Flows'}</div>}
              {(() => {
                let currentTopIndex = 0;
                return !value.trim() && section === 'top' ? (
                  <div className="ins-search-top-rated">
                    <div className="ins-search-top-apps" aria-label="Top rated apps">
                      {visibleTopApps.map((app) => {
                        const active = currentTopIndex === browseActive;
                        const itemIndex = currentTopIndex++;
                        return (
                          <button 
                            key={app.id} 
                            type="button" 
                            className={active ? 'is-active' : ''}
                            onMouseEnter={() => setBrowseActive(itemIndex)}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.app(app)); }}
                          >
                            <AppLogo app={app} size={82} />
                            <strong>{app.name}</strong>
                          </button>
                        );
                      })}
                    {modalPlatform && visibleTopApps.length === 0 && (
                      <p className="ins-muted">No {PLATFORM_LABEL[modalPlatform]} apps yet.</p>
                    )}
                  </div>
                  <section className="ins-search-top-section">
                    <div className="ins-search-top-heading">Screens</div>
                    <div className="ins-search-top-screens">
                      {previewScreens.map((screen, index) => {
                        const [label, assetName] = FIGMA_TOP_RATED_CARDS[index];
                        const active = currentTopIndex === browseActive;
                        const itemIndex = currentTopIndex++;
                        return (
                          <button 
                            key={screen.id} 
                            type="button" 
                            className={`${index === 0 ? 'is-featured' : ''} ${active ? 'is-active' : ''}`}
                            onMouseEnter={() => setBrowseActive(itemIndex)}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.screen(screen)); }}
                          >
                            <strong>{label}</strong>
                            <span className="ins-search-top-screen-preview" aria-hidden="true">
                              <img className="is-back" src={`/ASSET/search-modal/top-rated/${assetName}-back.png`} alt="" />
                              <img className="is-front" src={`/ASSET/search-modal/top-rated/${assetName}-front.png`} alt="" />
                            </span>
                            <span className="ins-search-top-screen-fade" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="ins-search-top-section">
                    <div className="ins-search-top-heading">UI Elements</div>
                    <div className="ins-search-top-elements">
                      {previewElements.map((element) => {
                        const active = currentTopIndex === browseActive;
                        const itemIndex = currentTopIndex++;
                        return (
                          <button 
                            key={element.kind} 
                            type="button" 
                            className={active ? 'is-active' : ''}
                            onMouseEnter={() => setBrowseActive(itemIndex)}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(element.kind)}`); }}
                          >
                            <span><img src="/ASSET/search-modal/top-rated/element.svg" alt="" width={20} height={20} /></span>{element.kind}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="ins-search-top-section">
                    <div className="ins-search-top-heading">Flows</div>
                    <div className="ins-search-top-elements ins-search-top-flows">
                      {previewFlows.map((flow) => {
                        const active = currentTopIndex === browseActive;
                        const itemIndex = currentTopIndex++;
                        return (
                          <button 
                            key={flow.id} 
                            type="button" 
                            className={active ? 'is-active' : ''}
                            onMouseEnter={() => setBrowseActive(itemIndex)}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.flow(flow)); }}
                          >
                            <span><img src="/ASSET/search-modal/top-rated/flow.svg" alt="" width={20} height={20} /></span>{flow.name}
                          </button>
                        );
                      })}
                      {modalPlatform && previewFlows.length === 0 && (
                        <p className="ins-muted">No {PLATFORM_LABEL[modalPlatform]} flows yet.</p>
                      )}
                    </div>
                  </section>
                </div>
              ) : !value.trim() && section === 'categories' ? (
                <div className="ins-search-categories" aria-label="Categories">
                  {categories.map(({ value, label, count }, index) => (
                    <button
                      key={value}
                      type="button"
                      role="option"
                      aria-selected={index === browseActive}
                      className={index === browseActive ? 'is-active' : ''}
                      onMouseEnter={() => setBrowseActive(index)}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); router.push(`${INSPIRATIONS_ROUTES.screens}?industry=${value}`); }}
                    >
                      <strong>{label}</strong>
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
              ) : !value.trim() && section === 'screens' ? (
                <div className="ins-search-resource-list" aria-label="Screens">
                  {visibleScreens.map((screen, index) => (
                    <button
                      key={screen.id}
                      type="button"
                      role="option"
                      aria-selected={index === browseActive}
                      className={index === browseActive ? 'is-active' : ''}
                      onMouseEnter={() => setBrowseActive(index)}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.screen(screen)); }}
                    >
                      <strong>{screen.name}</strong>
                      <span>{screen.elements.length}</span>
                    </button>
                  ))}
                  {modalPlatform && visibleScreens.length === 0 && (
                    <p className="ins-muted">No {PLATFORM_LABEL[modalPlatform]} screens yet.</p>
                  )}
                </div>
              ) : !value.trim() && section === 'elements' ? (
                <div className="ins-search-resource-list" aria-label="UI Elements">
                  {elements.map((element, index) => (
                    <button
                      key={element.kind}
                      type="button"
                      role="option"
                      aria-selected={index === browseActive}
                      className={index === browseActive ? 'is-active' : ''}
                      onMouseEnter={() => setBrowseActive(index)}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(element.kind)}`); }}
                    >
                      <strong>{element.kind}</strong>
                      <span>{element.count}</span>
                    </button>
                  ))}
                </div>
              ) : !value.trim() && section === 'flows' ? (
                <div className="ins-search-resource-list" aria-label="Flows">
                  {visibleFlows.map((flow, index) => (
                    <button
                      key={flow.id}
                      type="button"
                      role="option"
                      aria-selected={index === browseActive}
                      className={index === browseActive ? 'is-active' : ''}
                      onMouseEnter={() => setBrowseActive(index)}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.flow(flow)); }}
                    >
                      <strong>{flow.name}</strong>
                      <span>{flow.screenIds.length}</span>
                    </button>
                  ))}
                  {modalPlatform && visibleFlows.length === 0 && (
                    <p className="ins-muted">No {PLATFORM_LABEL[modalPlatform]} flows yet.</p>
                  )}
                </div>
              ) : (
                <div className="ins-search-suggestions">
                  <section className="ins-search-search-actions" aria-label="Search actions">
                    <button
                      type="button"
                     
                      className={`ins-search-search-action ${activeSearchAction === 'search' ? 'is-active' : ''}`}
                      onMouseEnter={() => { setActive(-1); setActiveSearchAction('search'); }}
                      onFocus={() => { setActive(-1); setActiveSearchAction('search'); }}
                      onClick={() => runSearch(value)}
                    >
                      <span><img src={FIGMA_MODAL_ICONS.search} alt="" width={20} height={20} /></span>
                      Search
                    </button>
                    <button
                      type="button"
                     
                      className={`ins-search-search-action ${activeSearchAction === 'screenshot' ? 'is-active' : ''}`}
                      onMouseEnter={() => { setActive(-1); setActiveSearchAction('screenshot'); }}
                      onFocus={() => { setActive(-1); setActiveSearchAction('screenshot'); }}
                      onClick={() => runSearch(value, 'text')}
                    >
                      <span><img src={TEXT_IN_SCREENSHOT_ICON} alt="" width={20} height={20} /></span>
                      Text in Screenshot
                    </button>
                  </section>
                  <section className="ins-search-suggestion-section">
                    <div className="ins-search-suggestion-heading">Others</div>
                    <div className="ins-search-modal-list">
                      {modalSuggestions.map((s, i) => (
                      <button
                        key={`${s.href}-${i}`}
                        type="button"
                       
                        className={`ins-search-modal-item ${i === active ? 'is-active' : ''}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => { setActive(i); setActiveSearchAction(null); }}
                        onFocus={() => { setActive(i); setActiveSearchAction(null); }}
                        onClick={() => { addRecentSearch(s.label, s); close(); router.push(s.href); }}
                      >
                        <span className="ins-search-modal-item-mark">{s.iconSrc ? <img src={s.iconSrc} alt="" /> : s.label.slice(0, 1)}</span>
                        <span><strong>{s.label}</strong><small>{s.hint}</small></span>
                      </button>
                      ))}
                      {modalSuggestions.length === 0 && (
                        <div className="ins-search-modal-empty">No results found</div>
                      )}
                    </div>
                  </section>
                  {matchingElements.length > 0 && (
                    <section className="ins-search-suggestion-section ins-search-suggestion-elements">
                      <div className="ins-search-suggestion-heading">UI Elements</div>
                      <div className="ins-search-top-elements">
                        {matchingElements.map((element) => <button key={element.kind} type="button" onClick={() => { close(); router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(element.kind)}`); }}><span><img src="/ASSET/search-modal/top-rated/element.svg" alt="" width={20} height={20} /></span>{element.kind}</button>)}
                      </div>
                    </section>
                  )}
                  <p className="ins-search-suggestion-footer">
                     Looking for something else?{' '}
                    <a href={`mailto:surendarv638@gmail.com?subject=${encodeURIComponent(`App request: ${value.trim()}`)}`}>Request app</a>
                  </p>
                </div>
              );
              })()}
            </div>
          </div>
        </div>
        </div>
      , document.body)}
    </div>
  );
}
