'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_FILTERS } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { inspirationsApi } from '@/lib/inspirations/api';
import { suggestQueries, type SearchSuggestion } from '@/lib/inspirations/search';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Industry, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { CloseIcon, SearchIcon } from './Icons';

const FIGMA_APP_ART = '/ASSET/search-modal/figma-02.png';
const FIGMA_MODAL_ICONS = {
  search: '/ASSET/search-modal/icons/search.svg',
  apple: '/ASSET/search-modal/icons/apple.svg',
  android: '/ASSET/search-modal/icons/android.svg',
  web: '/ASSET/search-modal/icons/web.svg',
  list: '/ASSET/search-modal/icons/list.svg',
  grid: '/ASSET/search-modal/icons/grid.svg',
  flow: '/ASSET/search-modal/icons/flow.svg',
  topRated: '/ASSET/search-modal/icons/top-rated.svg',
  categories: '/ASSET/search-modal/icons/categories.svg',
} as const;
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
  const [section, setSection] = useState<'top' | 'categories' | 'screens' | 'elements' | 'flows'>('top');
  const [topApps, setTopApps] = useState<App[]>([]);
  const [topScreens, setTopScreens] = useState<Screen[]>([]);
  const [topElements, setTopElements] = useState<{ kind: string; count: number }[]>([]);
  const [topFlows, setTopFlows] = useState<Flow[]>([]);
  const [categories, setCategories] = useState<{ value: string; label: string; count: number }[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(loadRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<App[]>([]);
  const listId = useId();

  // Keep the field in sync when the URL query changes (Back/Forward). Adjusts
  // state during render — React's documented pattern for deriving from props.
  const urlQuery = params.get('q') ?? '';
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  // ⌘K / Ctrl K focuses search; "/" too when not typing elsewhere.
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
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
    ]).then(([apps, screens, elements, flows, meta]) => {
      if (cancelled) return;
      appsRef.current = apps;
      setTopApps(apps.slice(0, 7));
      setRecentSearches((searches) => searches.map((search) => {
        const app = apps.find(({ name }) => name.toLocaleLowerCase() === search.query.toLocaleLowerCase());
        return app && !search.iconSrc ? { ...search, icon: 'app', iconSrc: inspirationsApi.mediaUrl(app.logo) } : search;
      }));
        setTopScreens(screens.items.slice(0, FIGMA_TOP_RATED_CARDS.length));
      setTopElements(elements.slice(0, 7));
        setTopFlows(flows.slice(0, 12));
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
      iconSrc: suggestion?.iconSrc ?? (app ? inspirationsApi.mediaUrl(app.logo) : undefined),
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

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const q = value.trim();
      if (!q) return;
      addRecentSearch(q);
      setOpen(false);
      router.push(INSPIRATIONS_ROUTES.searchFor(q));
    },
    [addRecentSearch, router, value],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter' && active >= 0 && suggestions[active]) {
      e.preventDefault();
      addRecentSearch(suggestions[active].label, suggestions[active]);
      setOpen(false);
      router.push(suggestions[active].href);
    } else if (e.key === 'Enter') {
      // No suggestion highlighted — run the plain query. Handled explicitly
      // rather than left to the browser's implicit submit-on-Enter, which
      // doesn't reliably fire for a `type="search"` input in every
      // environment; every other key here is already explicit, so Enter
      // shouldn't be the one exception.
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const close = () => {
    setOpen(false);
    modalInputRef.current?.blur();
    inputRef.current?.blur();
  };
  const modalSuggestions = suggestions.slice(0, 12);
  const matchingElements = topElements.filter(({ kind }) => kind.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
  const modalSections = [
    { key: 'top' as const, label: 'Top rated', icon: FIGMA_MODAL_ICONS.topRated },
    { key: 'categories' as const, label: 'Categories', icon: FIGMA_MODAL_ICONS.categories },
    { key: 'screens' as const, label: 'Screens', icon: FIGMA_MODAL_ICONS.grid },
    { key: 'elements' as const, label: 'UI Elements', icon: FIGMA_MODAL_ICONS.list },
    { key: 'flows' as const, label: 'Flows', icon: FIGMA_MODAL_ICONS.flow },
  ];
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
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
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
        <div className={`ins-search-modal ${value.trim() ? 'is-searching' : ''}`} id={listId} role="dialog" aria-label="Search results" aria-modal="true" onClick={(event) => event.stopPropagation()}>
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
                onKeyDown={onKeyDown}
              />
            </div>
            <div className="ins-search-modal-platforms" aria-hidden="true">
              <img src={FIGMA_MODAL_ICONS.apple} alt="" width={24} height={24} />
              <img src={FIGMA_MODAL_ICONS.android} alt="" width={24} height={24} />
              <img src={FIGMA_MODAL_ICONS.web} alt="" width={24} height={24} />
            </div>
          </form>
          {!value.trim() && recentSearches.length > 0 && (
            <div className="ins-search-chips" aria-label="Recent searches">
              {recentSearches.map(({ query, icon, iconSrc }) => (
                <div key={query} className="ins-search-chip">
                  <button type="button" className="ins-search-chip-query" onClick={() => setValue(query)}><img className={`ins-search-chip-icon ${iconSrc ? 'is-app-logo' : ''}`} src={iconSrc ?? RECENT_SEARCH_ICON_SOURCES[icon]} alt="" width={icon === 'app' || iconSrc ? 28 : 20} height={icon === 'app' || iconSrc ? 28 : 20} />{query}</button>
                  <button type="button" className="ins-search-chip-remove" aria-label={`Remove ${query} from recent searches`} onClick={() => removeRecentSearch(query)}><CloseIcon size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className={`ins-search-modal-body ${!value.trim() ? 'has-nav' : ''}`}>
            {!value.trim() && (
              <nav className="ins-search-modal-nav" aria-label="Search sections">
                {modalSections.map(({ key, label, icon }) => (
                  <button key={key} type="button" className={section === key ? 'is-active' : ''} onClick={() => setSection(key)}><img src={icon} alt="" width={20} height={20} />{label}</button>
                ))}
              </nav>
            )}
            <div className="ins-search-modal-results" role="listbox">
              {(!value.trim() && section !== 'top') && <div className="ins-search-modal-title">{section === 'categories' ? 'Categories' : section === 'screens' ? 'Screens' : section === 'elements' ? 'UI Elements' : 'Flows'}</div>}
              {!value.trim() && section === 'top' ? (
                <div className="ins-search-top-rated">
                  <div className="ins-search-top-apps" aria-label="Top rated apps">
                    {topApps.map((app) => (
                      <button key={app.id} type="button" onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.app(app)); }}>
                        <AppLogo app={app} size={82} />
                        <strong>{app.name}</strong>
                      </button>
                    ))}
                  </div>
                  <section className="ins-search-top-section">
                    <div className="ins-search-top-heading">Screens</div>
                    <div className="ins-search-top-screens">
                      {topScreens.map((screen, index) => {
                        const [label, assetName] = FIGMA_TOP_RATED_CARDS[index];
                        return (
                          <button key={screen.id} type="button" className={index === 0 ? 'is-featured' : ''} onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.screen(screen)); }}>
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
                      {topElements.map((element) => <button key={element.kind} type="button" onClick={() => router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(element.kind)}`)}><span><img src="/ASSET/search-modal/top-rated/element.svg" alt="" width={20} height={20} /></span>{element.kind}</button>)}
                    </div>
                  </section>
                  <section className="ins-search-top-section">
                    <div className="ins-search-top-heading">Flows</div>
                    <div className="ins-search-top-elements ins-search-top-flows">
                      {topFlows.map((flow) => <button key={flow.id} type="button" onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.flow(flow)); }}><span><img src="/ASSET/search-modal/top-rated/flow.svg" alt="" width={20} height={20} /></span>{flow.name}</button>)}
                    </div>
                  </section>
                </div>
              ) : !value.trim() && section === 'categories' ? (
                <div className="ins-search-categories" aria-label="Categories">
                  {categories.map(({ value, label, count }) => (
                    <button
                      key={value}
                      type="button"
                    >
                      <strong>{label}</strong>
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
              ) : !value.trim() && section === 'screens' ? (
                <div className="ins-search-resource-list" aria-label="Screens">
                  {topScreens.map((screen) => (
                    <button key={screen.id} type="button" onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.screen(screen)); }}>
                      <strong>{screen.name}</strong>
                      <span>{screen.elements.length}</span>
                    </button>
                  ))}
                </div>
              ) : !value.trim() && section === 'elements' ? (
                <div className="ins-search-resource-list" aria-label="UI Elements">
                  {topElements.map((element) => (
                    <button key={element.kind} type="button" onClick={() => router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(element.kind)}`)}>
                      <strong>{element.kind}</strong>
                      <span>{element.count}</span>
                    </button>
                  ))}
                </div>
              ) : !value.trim() && section === 'flows' ? (
                <div className="ins-search-resource-list" aria-label="Flows">
                  {topFlows.map((flow) => (
                    <button key={flow.id} type="button" onClick={() => { close(); router.push(INSPIRATIONS_ROUTES.flow(flow)); }}>
                      <strong>{flow.name}</strong>
                      <span>{flow.screenIds.length}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ins-search-suggestions">
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
                        onMouseEnter={() => setActive(i)}
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
                        {matchingElements.map((element) => <button key={element.kind} type="button" onClick={() => router.push(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(element.kind)}`)}><span><img src="/ASSET/search-modal/top-rated/element.svg" alt="" width={20} height={20} /></span>{element.kind}</button>)}
                      </div>
                    </section>
                  )}
                  <p className="ins-search-suggestion-footer">Looking for something else? <button type="button">Request app</button></p>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      , document.body)}
    </div>
  );
}
