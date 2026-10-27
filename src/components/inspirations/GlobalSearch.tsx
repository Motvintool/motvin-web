'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isOverlayMove } from './useFitResults';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_FILTERS, WEBS_PLATFORMS, browsedPlatforms, isWebsPlatforms } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { inspirationsApi } from '@/lib/inspirations/api';
import { OPEN_SEARCH_EVENT, type SearchSection } from '@/lib/inspirations/openSearch';
import { suggestQueries, type SearchSuggestion } from '@/lib/inspirations/search';
import { elementLabel, INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Industry, Platform, Screen, ScreenType } from '@/lib/inspirations/types';
import { isDesktopPlatform } from '@/lib/inspirations/types';
import { IMAGE_SIZE, optimizedImage } from '@/lib/inspirations/optimizedImage';
import { AppLogo } from './AppLogo';
import { RequestAppModal } from './RequestAppModal';
import { FLOW_PARAM } from './FlowPreview';
import { AppleIcon, ChevronDownIcon, CloseIcon, SearchIcon, WebIcon } from './Icons';
import { SCREEN_PARAM } from './ScreenPreviewModal';
import { SHEET_QUERY, useMediaQuery } from './useSheet';
import { screenTitle } from '@/lib/inspirations/screenNaming';

const FIGMA_APP_ART = '/ASSET/search-modal/figma-02.png';
/** Lives under the shared Motvin icon set (`/ASSET/Icons/Motvin/`), not
 * alongside the rest of the search modal's own icons in
 * `/ASSET/search-modal/icons/` — kept at its existing path instead of
 * duplicating it into the modal's own folder. */
const TEXT_IN_SCREENSHOT_ICON = '/ASSET/Icons/Motvin/text-in-screenshot.svg';
const FIGMA_MODAL_ICONS = {
  search: '/ASSET/search-modal/icons/search.svg',
  apps: '/ASSET/search-modal/icons/apps.svg',
  list: '/ASSET/search-modal/icons/list.svg',
  grid: '/ASSET/search-modal/icons/grid.svg',
  flow: '/ASSET/search-modal/icons/flow.svg',
  topRated: '/ASSET/search-modal/icons/top-rated.svg',
  categories: '/ASSET/search-modal/icons/categories.svg',
} as const;
/** The modal's platform switch — Apple's icon reads as "iOS" here, matching
 * the header's own tabs. Inline icon components rather than the
 * `<img src>` asset files the rest of this modal uses: an externally-loaded
 * SVG image can't be recolored by the surrounding page's CSS (`currentColor`
 * only resolves through CSS inheritance when the SVG is actually in the DOM),
 * so there'd be no way to switch between the active/inactive colors below. */
const MODAL_SCOPES: { value: ModalScope; Icon: typeof AppleIcon; label: string }[] = [
  { value: 'ios', Icon: AppleIcon, label: 'iOS' },
  { value: 'webs', Icon: WebIcon, label: 'Webs' },
];

/** The library's two sections, as the header's Apps / Webs tabs have them: iOS apps, and Webs — web apps and
 *  websites together, one section with no switch between them (WEBS_PLATFORMS). */
type ModalScope = 'ios' | 'webs';
function platformsOf(scope: ModalScope | null): Platform[] {
  return scope === 'ios' ? ['ios'] : scope === 'webs' ? [...WEBS_PLATFORMS] : [];
}
/** The Top Rated tab's screen-type cards, each showing two real screens of its type from the library: the
 *  first seven of these the picked platform has screens of (the grid is laid out for seven — the first card
 *  spans two columns), so a type the library lacks gives way to the next rather than leaving a hole. */
const FIGMA_TOP_RATED_CARDS = [
  ['Login', 'login'],
  ['Signup', 'signup'],
  ['Home', 'home'],
  ['Dashboard', 'dashboard'],
  ['Search', 'search'],
  ['Checkout', 'checkout'],
  ['Setting', 'settings'],
  ['Onboarding', 'onboarding'],
  ['Profile', 'profile'],
  ['Feed', 'feed'],
  ['Detail', 'detail'],
  ['Product', 'product'],
  ['Cart', 'cart'],
] as const satisfies readonly (readonly [string, ScreenType])[];
const TYPE_CARDS_SHOWN = 7;
/** How many screens of each type the clearest two are chosen from. */
const TYPE_CANDIDATES = 120;
/** Flow names that mark a screen as clearly of a type — the type tags alone are loose (a carousel or a dialog
 *  can be tagged "signup"), so a screen from a flow named for the type is the better example of it. */
const TYPE_FLOW_WORDS: Partial<Record<ScreenType, string[]>> = {
  login: ['login', 'log-in', 'logging-in', 'sign-in', 'signin'],
  signup: ['sign-up', 'signup', 'register', 'create-account', 'creating-an-account'],
  home: ['home'],
  dashboard: ['dashboard'],
  search: ['search', 'searching'],
  checkout: ['checkout', 'payment', 'paying', 'cart', 'order'],
  settings: ['setting', 'preference', 'account'],
  onboarding: ['onboarding', 'welcome', 'get-started'],
  profile: ['profile'],
  feed: ['feed'],
  detail: ['detail'],
  product: ['product'],
  cart: ['cart', 'bag', 'basket'],
};

/** A count as people read it at a glance: 1.6K rather than 1,642. */
function formatCount(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** The two clearest screens of a type among the library's curated ones. The type tags and flow names are both
 *  loose (an event menu filed under "creating an account", a loading skeleton under "home"), so what the
 *  screen is described as holding counts most: a form's fields for a sign-up or login, a tab bar and a full
 *  page for a home, a search bar and results for a search. Plain screens beat dialogs, sheets, toasts, the
 *  keyboard up or a loading state; the two come from different apps. */
function bestOfType(type: ScreenType, items: Screen[]): Screen[] {
  const words = TYPE_FLOW_WORDS[type] ?? [type];
  const count = (about: string, what: string) => {
    const match = about.match(new RegExp(`(\\d+) ${what}`));
    return match ? Number(match[1]) : about.includes(`a ${what}`) || about.includes(`1 ${what}`) ? 1 : 0;
  };
  const score = (screen: Screen) => {
    const flow = screen.file.split('/').slice(-2, -1)[0]?.toLowerCase() ?? '';
    const about = screen.description.toLowerCase();
    const inputs = count(about, 'input field');
    const texts = count(about, 'text element');
    let points = 0;
    if (words.some((word) => flow.includes(word))) points += 2;
    if (screen.fineType === type) points += 1;
    if (screen.states.length === 0) points += 1;
    if (/dialog|toast|over a dimmed|sheet|loading|skeleton/.test(about)) points -= 3;
    // The keyboard up hides most of a screen — except a search, where it's the moment itself.
    if (type !== 'search' && about.includes('keyboard open')) points -= 3;
    // A full, settled page rather than a near-empty one.
    if (texts >= 12) points += 1;
    if (type === 'signup') points += inputs >= 2 ? 3 : 0;
    if (type === 'login') {
      // An app's own way in names it on its main button ("Log in or sign up", "Continue with Phone"); a bare
      // "Sign in" is as often a system password sheet or a partner's page.
      const action = about.match(/primary action labelled “([^”]*)”/)?.[1] ?? '';
      if (/log in or sign up|continue with/.test(action)) points += 5;
      else if (/log in|sign in/.test(action)) points += 2;
      if (inputs >= 1) points += 1;
      if (screen.fineType === 'external_auth') points -= 3;
    }
    if (type === 'home') {
      if (about.includes('tab bar')) points += 2;
      if (texts >= 15) points += 1;
      if (/category chips|search bar/.test(about)) points += 1;
    }
    if (type === 'search') {
      if (about.includes('search bar')) points += 3;
      if (about.includes('results')) points += 1;
      if (texts >= 15) points += 1;
      // Prices make it a menu or a product page that happens to have a search box, not a search; a big call to
      // action, a landing page.
      if (about.includes('prices')) points -= 4;
      if (about.includes('primary action')) points -= 1;
    }
    return points;
  };
  const ranked = items.map((screen, i) => ({ screen, i, points: score(screen) })).sort((a, b) => b.points - a.points || a.i - b.i);
  const first = ranked[0]?.screen;
  if (!first) return [];
  const second = ranked.find(({ screen }) => screen.id !== first.id && screen.appId !== first.appId)?.screen ?? ranked[1]?.screen;
  return second ? [first, second] : [first];
}
/** How many app icons the Top Rated tab's row shows: the latest added apps, one row across the column. */
const TOP_APPS_SHOWN = 7;
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
  // A phone's search field is too narrow for the whole line: the short one there.
  const placeholder = useMediaQuery(SHEET_QUERY) ? 'Search apps…' : 'Search apps, flows & screens';
  const router = useRouter();
  // Opening a screen or flow from search lays it over this page: the page behind stays where it was.
  const pushTo = (href: string) => router.push(href, isOverlayMove(href, pathname, params) ? { scroll: false } : undefined);
  const params = useSearchParams();
  const pathname = usePathname();
  /** Opens a screen in place via `?screen=<id>` (see SCREEN_PARAM in
   * ScreenPreviewModal.tsx) rather than navigating to a standalone page, so
   * picking a result doesn't leave whatever page the search was opened from. */
  const screenPreviewHref = (screen: Pick<Screen, 'id'>) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(SCREEN_PARAM, screen.id);
    return `${pathname}?${sp.toString()}`;
  };
  /** Same, for a flow (see FLOW_PARAM in FlowPreview.tsx) — flows no longer
   * have a standalone page, only this overlay. */
  const flowPreviewHref = (flow: Pick<Flow, 'id'>) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(FLOW_PARAM, flow.id);
    return `${pathname}?${sp.toString()}`;
  };
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [activeSearchAction, setActiveSearchAction] = useState<'search' | 'screenshot' | null>('search');
  const [section, setSection] = useState<SearchSection>('top');
  // Phones swap the section tab list for a dropdown pill (see .ins-search-nav-dropdown).
  const [navMenuOpen, setNavMenuOpen] = useState(false);
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
  const [modalScope, setModalScope] = useState<ModalScope | null>('ios');
  const inScope = (platform: Platform) => !modalScope || platformsOf(modalScope).includes(platform);
  const scopeLabel = modalScope === 'webs' ? 'Webs' : 'iOS';
  // An app on iOS and the web opens on the section being searched: Claude found under Webs opens as a web app.
  const appHrefInScope = (app: App) => INSPIRATIONS_ROUTES.app(app, app.platforms.find(inScope) ?? (modalScope ? platformsOf(modalScope)[0] : undefined));
  const [topApps, setTopApps] = useState<App[]>([]);
  // Unlike `topApps` (the Top Rated preview's own short row — the Apps
  // section lists `allApps` below instead, so capping this one is fine),
  // these three back BOTH the Top Rated preview AND their own
  // sidebar section (Screens/UI Elements/Flows) — the section needs the
  // real, full list, so nothing here gets truncated at fetch time. The
  // preview-sized slices for the Top Rated tab are derived below instead.
  const [screens, setScreens] = useState<Screen[]>([]);
  // The Screens tab's own list: the selected platform's screens, loaded a page at a
  // time as you scroll. (`screens` above is only the Top Rated showcase's sample.)
  // `key` says which platform the items are for, so a pill change shows a loading
  // state instead of the previous platform's list or a false "no screens yet".
  const [screensTab, setScreensTab] = useState<{ key: string; items: Screen[]; next: number | null } | null>(null);
  const [screensSentinel, setScreensSentinel] = useState<HTMLDivElement | null>(null);
  const loadingMoreScreens = useRef(false);
  const [elements, setElements] = useState<{ kind: string; count: number }[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  // Every category the library has, and every app — the counts shown are worked out
  // per platform below (`categories`), so the platform pills actually change them.
  const [industries, setIndustries] = useState<string[]>([]);
  const [allApps, setAllApps] = useState<App[]>([]);
  // Whether the apps and flows below have arrived, so a list can tell "loading" from "none on this platform".
  const [libraryReady, setLibraryReady] = useState(false);
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

  // The "Request app" popup: opened from the empty-results footer, prefilled with what was searched for.
  const [requesting, setRequesting] = useState<{ name: string; platform: Platform } | null>(null);

  // The modal opens on the platform being browsed (?platform=web …), not always iOS, so what it
  // lists matches the page behind it. Re-synced each time it opens; a change made inside the
  // modal sticks until it is closed.
  const browsedPlatform = browsedPlatforms(params)[0];
  const browsedScope: ModalScope = isWebsPlatforms(browsedPlatforms(params)) ? 'webs' : 'ios';
  useEffect(() => {
    if (open) setModalScope(browsedScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  // Another part of the page (the Explore columns' titles) asks for the modal on a given
  // section: show that section, clear any query so the section list is what appears, open.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const section = (event as CustomEvent<{ section: SearchSection }>).detail?.section ?? 'top';
      setValue('');
      setSection(section);
      setBrowseActive(-1);
      setOpen(true);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

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
            const keys = ['top', 'apps', 'categories', 'screens', 'elements', 'flows'] as const;
            const currentIndex = keys.indexOf(prev);
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
      suggestQueries(value, undefined, modalScope ? platformsOf(modalScope) : undefined).then((s: SearchSuggestion[]) => {
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
  }, [value, open, modalScope]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      inspirationsApi.listApps(undefined, 'rating'),
      inspirationsApi.listScreens(EMPTY_FILTERS, 0, 'curated'),
      inspirationsApi.listFlows(),
      inspirationsApi.getMeta(),
      inspirationsApi.listApps(undefined, 'newest'),
    ]).then(([apps, screensPage, flowsList, meta, newestApps]) => {
      if (cancelled) return;
      appsRef.current = apps;
      // The Top Rated tab's icon row leads with what's new: the latest added apps first (cut to the row's
      // length after the platform filter, below).
      setTopApps(newestApps);
      setRecentSearches((searches) => searches.map((search) => {
        const app = apps.find(({ name }) => name.toLocaleLowerCase() === search.query.toLocaleLowerCase());
        return app && !search.iconSrc ? { ...search, icon: 'app', iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined } : search;
      }));
        setScreens(screensPage.items);
        setFlows(flowsList);
        setIndustries(meta.taxonomy.industries);
        setAllApps(apps);
        setLibraryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const screensKey = modalScope ?? 'all';

  // The Top Rated tab's screen-type cards: the two best curated screens of each type, on the picked platform.
  const [typeShots, setTypeShots] = useState<{ key: string; shots: Partial<Record<ScreenType, { screens: Screen[]; total: number }>> } | null>(null);
  useEffect(() => {
    if (!open || typeShots?.key === screensKey) return;
    let cancelled = false;
    Promise.all(
      FIGMA_TOP_RATED_CARDS.map(([, type]) =>
        inspirationsApi
          // A wide pick (not just the first page) to choose the clearest two from.
          .listScreens({ ...EMPTY_FILTERS, screenTypes: [type], platforms: platformsOf(modalScope) }, 0, 'curated', { limit: TYPE_CANDIDATES })
          .then((page) => [type, { screens: bestOfType(type, page.items), total: page.total }] as const)
          .catch(() => [type, { screens: [] as Screen[], total: 0 }] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setTypeShots({ key: screensKey, shots: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [open, screensKey, typeShots?.key, modalScope]);

  // First page of the Screens tab, fetched when the tab is opened or the platform changes.
  useEffect(() => {
    if (!open || section !== 'screens' || screensTab?.key === screensKey) return;
    let cancelled = false;
    inspirationsApi.listScreens({ ...EMPTY_FILTERS, platforms: platformsOf(modalScope) }, 0, 'curated').then((page) => {
      if (!cancelled) setScreensTab({ key: screensKey, items: page.items, next: page.nextOffset });
    });
    return () => {
      cancelled = true;
    };
  }, [open, section, screensKey, screensTab?.key, modalScope]);

  // Next page, when the end of the list scrolls into view.
  const loadMoreScreens = useCallback(() => {
    if (!screensTab || screensTab.next === null || loadingMoreScreens.current) return;
    loadingMoreScreens.current = true;
    const { key, next } = screensTab;
    inspirationsApi
      .listScreens({ ...EMPTY_FILTERS, platforms: platformsOf(modalScope) }, next, 'curated')
      .then((page) => {
        setScreensTab((prev) => (prev && prev.key === key ? { key, items: [...prev.items, ...page.items], next: page.nextOffset } : prev));
      })
      .finally(() => {
        loadingMoreScreens.current = false;
      });
  }, [screensTab, modalScope]);

  useEffect(() => {
    if (!screensSentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMoreScreens();
    });
    observer.observe(screensSentinel);
    return () => observer.disconnect();
  }, [screensSentinel, loadMoreScreens]);

  // UI elements are counted for the platform picked in the modal — iOS shows iOS's
  // numbers, not the whole library's — so they refetch when the pill changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    inspirationsApi.listElements(modalScope ? platformsOf(modalScope) : undefined).then((list) => {
      if (!cancelled) setElements(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, modalScope]);

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
      // The platform picked in the box (Apple or globe), not the page's: Webs searches the web side.
      const href = INSPIRATIONS_ROUTES.searchFor(q, mode);
      pushTo(modalScope === 'webs' ? `${href}&platform=web` : href);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushTo is rebuilt each render; router stands for it
    [addRecentSearch, router, modalScope],
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
  // The panel keeps its height while typing, so the suggestions scroll: the one the arrow keys land on is
  // brought into view (only as far as needed; one already showing, as under the pointer, doesn't move).
  useEffect(() => {
    if (active < 0) return;
    document.querySelector<HTMLElement>('.ins-search-modal .ins-search-modal-item.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  // A new section or query starts at the top, so its top edge starts sharp again.
  useEffect(() => {
    document.querySelector('.ins-search-modal .ins-search-modal-results')?.classList.remove('is-scrolled');
  }, [section, value]);
  // The same while browsing a section (nothing typed): the arrow keys walk the list, and the list follows.
  useEffect(() => {
    if (browseActive < 0) return;
    document.querySelector<HTMLElement>('.ins-search-modal .ins-search-modal-results .is-active')?.scrollIntoView({ block: 'nearest' });
  }, [browseActive, section]);
  // Matched against the full fetched list, not a 7-item preview slice — a
  // kind that exists but didn't happen to make the Top Rated row's cutoff
  // would otherwise never be found here no matter how exactly it's typed.
  const matchingElements = elements.filter(({ kind }) => {
    const q = value.trim().toLocaleLowerCase();
    return kind.toLocaleLowerCase().includes(q) || elementLabel(kind).toLocaleLowerCase().includes(q);
  });
  // Categories on the picked platform only, busiest first; one with no apps there is left out.
  const categories = industries
    .map((industry) => ({
      value: industry,
      label: INDUSTRY_LABEL[industry as Industry] ?? industry,
      count: allApps.filter((app) => app.industry === industry && (!modalScope || app.platforms.some(inScope))).length,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const visibleTopApps = (modalScope ? topApps.filter((app) => app.platforms.some(inScope)) : topApps).slice(0, TOP_APPS_SHOWN);
  // The Apps tab: every app on the picked platform, best rated first (the order they're fetched in).
  const visibleApps = modalScope ? allApps.filter((app) => app.platforms.some(inScope)) : allApps;
  const visibleFlows = modalScope ? flows.filter((flow) => inScope(flow.platform)) : flows;
  // Unlike the Top Rated tab's decorative Screens showcase (fixed stock
  // imagery, positionally paired with whichever screen happens to fill that
  // slot), the dedicated Screens tab lists real screens with real names —
  // each one does carry a genuine platform, so filtering it is honest too.
  const screensLoaded = screensTab && screensTab.key === screensKey ? screensTab : null;
  const screensReady = screensLoaded !== null;
  const visibleScreens = screensLoaded?.items ?? [];
  // Preview-sized slices for the Top Rated tab only — the sidebar's own
  // Screens/UI Elements/Flows sections use the full lists above instead, so
  // browsing there isn't artificially capped to whatever fits in this row.
  // Only types the library has screens of (on this platform), each with its own two.
  const typeCards = typeShots && typeShots.key === screensKey
    ? FIGMA_TOP_RATED_CARDS.map(([label, type]) => ({ label, type, shots: typeShots.shots[type]?.screens ?? [], total: typeShots.shots[type]?.total ?? 0 })).filter((card) => card.shots.length > 0).slice(0, TYPE_CARDS_SHOWN)
    : [];
  const typeHref = (type: ScreenType) =>
    `${INSPIRATIONS_ROUTES.screens}?type=${type}${modalScope ? `&platform=${modalScope === 'ios' ? 'ios' : 'web'}` : ''}`;
  // Every list the modal links to opens in the section being searched (Webs is ?platform=web), as screen types do.
  const inSection = (href: string) => (modalScope === 'webs' ? `${href}${href.includes('?') ? '&' : '?'}platform=web` : href);
  const elementHref = (kind: string) => inSection(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(kind)}`);
  const previewElements = elements.slice(0, 7);
  const previewFlows = visibleFlows.slice(0, 12);
  const modalSections = [
    { key: 'top' as const, label: 'Top rated', icon: FIGMA_MODAL_ICONS.topRated },
    { key: 'apps' as const, label: 'Apps', icon: FIGMA_MODAL_ICONS.apps },
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
          ...visibleTopApps.map((app) => ({ onActivate: () => { close(); pushTo(appHrefInScope(app)); } })),
          ...typeCards.map((card) => ({ onActivate: () => { close(); pushTo(typeHref(card.type)); } })),
          ...previewElements.map((el) => ({ onActivate: () => { close(); pushTo(elementHref(el.kind)); } })),
          ...previewFlows.map((flow) => ({ onActivate: () => { close(); pushTo(flowPreviewHref(flow)); } })),
        ]
      : section === 'apps'
      ? visibleApps.map((app) => ({ onActivate: () => { close(); pushTo(appHrefInScope(app)); } }))
      : section === 'categories'
      ? categories.map((c) => ({ onActivate: () => { close(); pushTo(inSection(`${INSPIRATIONS_ROUTES.screens}?industry=${c.value}`)); } }))
      : section === 'screens'
        ? visibleScreens.map((s) => ({ onActivate: () => { close(); pushTo(screenPreviewHref(s)); } }))
        : section === 'elements'
          ? elements.map((el) => ({ onActivate: () => { close(); pushTo(elementHref(el.kind)); } }))
          : section === 'flows'
            ? visibleFlows.map((f) => ({ onActivate: () => { close(); pushTo(flowPreviewHref(f)); } }))
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
      pushTo(modalSuggestions[active].href);
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
          placeholder={placeholder}
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

      {requesting && (
        <RequestAppModal initialName={requesting.name} initialPlatform={requesting.platform} onClose={() => setRequesting(null)} />
      )}

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
            <button type="button" className="ins-search-modal-back" aria-label="Close search" onClick={close}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="ins-search-modal-field">
              <img src={FIGMA_MODAL_ICONS.search} alt="" width={26} height={26} />
              <input
                ref={modalInputRef}
                type="search"
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
                aria-label="Search apps, flows and screens"
                onChange={(e) => { setValue(e.target.value); setNavMenuOpen(false); }}
                onKeyDown={handleKeyDownRef.current as any}
              />
            </div>
            <div className="ins-search-modal-platforms" role="group" aria-label="Filter by platform">
              {MODAL_SCOPES.map(({ value, Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  className={modalScope === value ? 'is-active' : ''}
                  aria-pressed={modalScope === value}
                  aria-label={label}
                  onClick={() => setModalScope((current) => (current === value ? null : value))}
                >
                  <Icon size={20} />
                </button>
              ))}
            </div>
          </form>
          {!value.trim() && (
            <div className="ins-search-subbar">
              {recentSearches.length > 0 && (
              <div className="ins-search-chips" aria-label="Recent searches">
                {recentSearches.map(({ query, icon, iconSrc }) => (
                  <div key={query} className="ins-search-chip">
                    <button type="button" className="ins-search-chip-query" onClick={() => runSearch(query)}><img className={`ins-search-chip-icon ${iconSrc ? 'is-app-logo' : ''}`} src={iconSrc ?? RECENT_SEARCH_ICON_SOURCES[icon]} alt="" width={icon === 'app' || iconSrc ? 28 : 20} height={icon === 'app' || iconSrc ? 28 : 20} />{query}</button>
                    <button type="button" className="ins-search-chip-remove" aria-label={`Remove ${query} from recent searches`} onClick={() => removeRecentSearch(query)}><CloseIcon size={14} /></button>
                  </div>
                ))}
              </div>
              )}
              <div className="ins-popwrap ins-search-nav-dropdown">
                <button
                  type="button"
                  className="ins-fpill"
                  aria-haspopup="listbox"
                  aria-expanded={navMenuOpen}
                  aria-label="Search section"
                  onClick={() => setNavMenuOpen((o) => !o)}
                >
                  {modalSections.find((item) => item.key === section)?.label}
                  <ChevronDownIcon size={14} />
                </button>
                {navMenuOpen && (
                  <>
                    <div className="ins-search-nav-scrim" onClick={() => setNavMenuOpen(false)} />
                    <div className="ins-popover ins-fmenu" role="listbox" aria-label="Search section">
                      {modalSections.map(({ key, label, icon }) => (
                        <button
                          key={key}
                          type="button"
                          role="option"
                          aria-selected={section === key}
                          className={`ins-fmenu-item ${section === key ? 'is-selected' : ''}`}
                          onClick={() => { setSection(key); setBrowseActive(-1); setNavMenuOpen(false); }}
                        >
                          <img src={icon} alt="" width={20} height={20} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
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
            <div
              className="ins-search-modal-results"
              role="listbox"
              // Scrolled down, the top edge fades as the bottom does (see .is-scrolled); at the top it stays sharp.
              onScroll={(e) => e.currentTarget.classList.toggle('is-scrolled', e.currentTarget.scrollTop > 4)}
            >
              {(!value.trim() && section !== 'top') && <div className="ins-search-modal-title">{modalSections.find((item) => item.key === section)?.label}</div>}
              {(() => {
                let currentTopIndex = 0;
                return !value.trim() && section === 'top' ? (
                  <div className="ins-search-top-rated">
                    <div className="ins-search-top-apps" aria-label="Recently added apps">
                      {visibleTopApps.map((app) => {
                        const active = currentTopIndex === browseActive;
                        const itemIndex = currentTopIndex++;
                        return (
                          <button 
                            key={app.id} 
                            type="button" 
                            className={active ? 'is-active' : ''}
                            onMouseEnter={() => setBrowseActive(itemIndex)}
                            onMouseLeave={() => setBrowseActive((current) => (current === itemIndex ? -1 : current))}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); pushTo(appHrefInScope(app)); }}
                          >
                            <AppLogo app={app} size={76} />
                            <strong>{app.name}</strong>
                          </button>
                        );
                      })}
                    {libraryReady && modalScope && visibleTopApps.length === 0 && (
                      <p className="ins-muted">No {scopeLabel} apps yet.</p>
                    )}
                  </div>
                  <section className="ins-search-top-section">
                    <div className="ins-search-top-heading">Screens</div>
                    <div className="ins-search-top-screens">
                      {typeCards.map(({ label, type, shots }, index) => {
                        const active = currentTopIndex === browseActive;
                        const itemIndex = currentTopIndex++;
                        const [front, back] = shots.map((shot) => optimizedImage(inspirationsApi.mediaUrl(shot.url) ?? '', IMAGE_SIZE.small));
                        return (
                          <button
                            key={type}
                            type="button"
                            className={`${index === 0 ? 'is-featured' : ''} ${active ? 'is-active' : ''} ${isDesktopPlatform(shots[0]?.platform) ? 'is-web' : ''}`}
                            onMouseEnter={() => setBrowseActive(itemIndex)}
                            onMouseLeave={() => setBrowseActive((current) => (current === itemIndex ? -1 : current))}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); pushTo(typeHref(type)); }}
                          >
                            <strong>{label}</strong>
                            <span className="ins-search-top-screen-go" aria-hidden="true">
                              <img src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={16} height={16} />
                            </span>
                            <span className="ins-search-top-screen-preview" aria-hidden="true">
                              {back && <img className="is-back" src={back.src} srcSet={back.srcSet} alt="" loading="lazy" />}
                              {front && <img className="is-front" src={front.src} srcSet={front.srcSet} alt="" loading="lazy" />}
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
                            onMouseLeave={() => setBrowseActive((current) => (current === itemIndex ? -1 : current))}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); pushTo(elementHref(element.kind)); }}
                          >
                            <span><img src="/ASSET/search-modal/top-rated/element.svg" alt="" width={20} height={20} /></span>{elementLabel(element.kind)}
                            {element.count > 0 && <em className="ins-search-top-count">{formatCount(element.count)}</em>}
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
                            onMouseLeave={() => setBrowseActive((current) => (current === itemIndex ? -1 : current))}
                            onFocus={() => setBrowseActive(itemIndex)}
                            onClick={() => { close(); pushTo(flowPreviewHref(flow)); }}
                          >
                            <span><img src="/ASSET/search-modal/top-rated/flow.svg" alt="" width={20} height={20} /></span>{flow.name}
                          </button>
                        );
                      })}
                      {libraryReady && modalScope && previewFlows.length === 0 && (
                        <p className="ins-muted">No {scopeLabel} flows yet.</p>
                      )}
                    </div>
                  </section>
                </div>
              ) : !value.trim() && section === 'apps' ? (
                // Every app as its home-screen icon, best rated first.
                <ul className="ins-search-app-icons" aria-label="Apps" aria-busy={!libraryReady}>
                  {libraryReady
                    ? visibleApps.map((app, index) => (
                        <li key={app.id}>
                          <button
                            type="button"
                            className={`ins-app-peek ${index === browseActive ? 'is-active' : ''}`}
                            onMouseEnter={() => setBrowseActive(index)}
                            onMouseLeave={() => setBrowseActive((current) => (current === index ? -1 : current))}
                            onFocus={() => setBrowseActive(index)}
                            onClick={() => { close(); pushTo(appHrefInScope(app)); }}
                          >
                            <AppLogo app={app} size={76} />
                            <strong>{app.name}</strong>
                          </button>
                        </li>
                      ))
                    : Array.from({ length: 10 }, (_, i) => (
                        <li key={i} className="ins-app-icon ins-app-icon--skeleton" aria-hidden>
                          <span className="ins-app-icon-art">
                            <span className="ins-skel ins-app-icon-skel-logo" />
                          </span>
                          <span className="ins-skel ins-skel--line ins-app-icon-skel-name" />
                        </li>
                      ))}
                  {libraryReady && modalScope && visibleApps.length === 0 && (
                    <li className="ins-muted">No {scopeLabel} apps yet.</li>
                  )}
                </ul>
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
                      onMouseLeave={() => setBrowseActive((current) => (current === index ? -1 : current))}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); pushTo(inSection(`${INSPIRATIONS_ROUTES.screens}?industry=${value}`)); }}
                    >
                      <strong>{label}</strong>
                      <span>{count}</span>
                    </button>
                  ))}
                  {modalScope && categories.length === 0 && <p className="ins-muted">No {scopeLabel} categories yet.</p>}
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
                      onMouseLeave={() => setBrowseActive((current) => (current === index ? -1 : current))}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); pushTo(screenPreviewHref(screen)); }}
                    >
                      <strong>{screenTitle(screen)}</strong>
                      <span>{screen.elements.length}</span>
                    </button>
                  ))}
                  {!screensReady && <p className="ins-muted">Loading screens…</p>}
                  {screensLoaded && screensLoaded.next !== null && (
                    <div ref={setScreensSentinel} className="ins-muted" aria-hidden>
                      Loading more…
                    </div>
                  )}
                  {screensReady && modalScope && visibleScreens.length === 0 && (
                    <p className="ins-muted">No {scopeLabel} screens yet.</p>
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
                      onMouseLeave={() => setBrowseActive((current) => (current === index ? -1 : current))}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); pushTo(elementHref(element.kind)); }}
                    >
                      <strong>{elementLabel(element.kind)}</strong>
                      <span>{element.count}</span>
                    </button>
                  ))}
                  {modalScope && elements.length === 0 && <p className="ins-muted">No {scopeLabel} UI elements yet.</p>}
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
                      onMouseLeave={() => setBrowseActive((current) => (current === index ? -1 : current))}
                      onFocus={() => setBrowseActive(index)}
                      onClick={() => { close(); pushTo(flowPreviewHref(flow)); }}
                    >
                      <strong>{flow.name}</strong>
                      <span>{flow.screenIds.length}</span>
                    </button>
                  ))}
                  {modalScope && visibleFlows.length === 0 && (
                    <p className="ins-muted">No {scopeLabel} flows yet.</p>
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
                        onClick={() => { addRecentSearch(s.label, s); close(); pushTo(s.href); }}
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
                        {matchingElements.map((element) => <button key={element.kind} type="button" onClick={() => { close(); pushTo(elementHref(element.kind)); }}><span><img src="/ASSET/search-modal/top-rated/element.svg" alt="" width={20} height={20} /></span>{elementLabel(element.kind)}</button>)}
                      </div>
                    </section>
                  )}
                  <p className="ins-search-suggestion-footer">
                     Looking for something else?{' '}
                    <a
                      href="#request-app"
                      onClick={(e) => {
                        e.preventDefault();
                        setRequesting({ name: value.trim(), platform: modalScope === 'ios' ? 'ios' : modalScope === 'webs' ? (WEBS_PLATFORMS.includes(browsedPlatform) ? browsedPlatform : 'web') : browsedPlatform });
                        close();
                      }}
                    >
                      Request app
                    </a>
                  </p>
                </div>
              );
              })()}
            </div>
          </div>
          {/* What the keys do here — the panel is built to be driven from the keyboard, so it says so. */}
          <div className="ins-search-modal-keys" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
            <span><kbd>↵</kbd> to open</span>
            <span><kbd>esc</kbd> to close</span>
          </div>
        </div>
        </div>
      , document.body)}
    </div>
  );
}
