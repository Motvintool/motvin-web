import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_PREFS, PLATFORM_LABEL, type Flow, type Platform, type Prefs, type Screen, type Session, type Step } from '../shared';
import { asset, attachSession, getJson, screenParts, signOut, SignedOutError, SITE, startPairing, thumbnail, type Pairing } from './api';
import { onMain, place, toMain } from './bridge';
import { ColorFilter } from './ColorFilter';
import { logoHue, PALETTE_HUES, type PaletteHue } from './colors';
import { Dropdown } from './Dropdown';
import { Settings } from './Settings';
import { Icon } from './icons';
import logo from './logo.svg';

/**
 * The panel: search one platform at a time and click a screen or flow to put
 * it on the canvas. Browsing needs no account; the first Add asks the person
 * to sign in, then carries on with what they clicked.
 */

export function App() {
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  // "auto" leaves the colours to Figma's theme class; light or dark override it (styles.css).
  useEffect(() => {
    if (prefs.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  const changePrefs = (change: Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...change };
      toMain({ type: 'save-prefs', prefs: next });
      return next;
    });

  useEffect(() => {
    const stop = onMain((message) => {
      if (message.type !== 'session') return;
      attachSession(message.session, (next) => {
        // Every new token is kept on this computer (figma.clientStorage), so the next run starts signed in.
        toMain({ type: 'save-session', session: next });
        setSession(next);
      });
      setSession(message.session);
      setPrefs(message.prefs);
      setLoaded(true);
    });
    toMain({ type: 'load-session' });
    return stop;
  }, []);

  if (!loaded) return <div class="center muted">Loading…</div>;
  return <Library email={session ? session.email || 'Signed in' : null} prefs={prefs} changePrefs={changePrefs} />;
}

const RECENT_MAX = 10;
const SIZE_LABEL: Record<Prefs['size'], string> = { s: 'Small thumbnails', m: 'Medium thumbnails', l: 'Large thumbnails' };


interface Adding {
  id: string;
  text: string;
  /** 0–1, for the bar under the card. */
  progress: number;
}

// ──────────────────────────────────────────────────────────────── sign-in

/** The Try Icons badge's heart, two-tone like a Pro badge: one half tinted, the other solid. */
function IconsMark() {
  return (
    <svg class="icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" opacity="0.45" d="M12 21s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 12 6.6Z" />
      <path fill="currentColor" d="M12 21s8.5-5.2 8.5-11.2A4.8 4.8 0 0 0 12 6.6Z" />
    </svg>
  );
}

function Logo() {
  return <span class="logo" aria-hidden="true" dangerouslySetInnerHTML={{ __html: logo }} />;
}

/** What the Add that opened the sign-in was for, shown at the top of the sheet. */
interface Pending {
  thumb: string | null;
  /** Web Apps and Webs are wide; iOS screens are tall. */
  wide: boolean;
  title: string;
  detail: string;
}

/**
 * Signing in, over the library: shown when a signed-out person clicks Add (or
 * Sign in in the menu). The plugin opens motvin.com to approve and signs
 * itself in; the library closes this once the sign-in lands, then adds what
 * was clicked.
 */
function SignInSheet({ pending, onClose }: { pending: Pending | null; onClose: () => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => () => pairing?.cancel(), [pairing]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);

  const begin = () => {
    setFailure(null);
    const next = startPairing();
    setPairing(next);
    toMain({ type: 'open-url', url: next.url });
    next.done.catch((error: Error) => {
      setPairing(null);
      if (error.message !== 'Cancelled') setFailure(error.message);
    });
  };

  return (
    <div class="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button class="icon-button sheet-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>

        <div class="sheet-hero" aria-hidden="true">
          {pending ? (
            <span class={pending.wide ? 'hero-shot wide' : 'hero-shot'}>
              <Thumb id={pending.thumb} alt="" />
              <span class="hero-plus">
                <Icon name="plus" size={14} />
              </span>
            </span>
          ) : (
            <span class="hero-logo">
              <Logo />
            </span>
          )}
        </div>
        {pairing ? (
          <>
            <h1 id="signin-title">Finish in your browser</h1>
            <p class="sheet-sub">Approve on motvin.com — this panel signs in by itself{pending ? ' and adds it' : ''}.</p>
            <div class="sheet-code">
              <span class="muted small">Your code</span>
              <strong>{pairing.code}</strong>
              <span class="muted small">Allow only if the page shows the same code</span>
            </div>
            <p class="sheet-waiting">
              <span class="spinner" aria-hidden="true" /> Waiting for approval…
            </p>
            <div class="sheet-actions">
              <button class="secondary wide" onClick={() => toMain({ type: 'open-url', url: pairing.url })}>
                <Icon name="external" size={16} /> Open the page again
              </button>
              <button class="link-button" onClick={() => pairing.cancel()}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 id="signin-title">{pending ? 'Sign in to add this' : 'Sign in to Motvin'}</h1>
            <p class={pending ? 'sheet-sub one-line' : 'sheet-sub'}>{pending ? pending.title : 'Add screens and flows to your canvas with your Motvin account.'}</p>
            <div class="sheet-actions">
              <button class="primary wide sheet-cta" onClick={begin}>
                Sign in with Motvin
              </button>
              <button class="link-button" onClick={onClose}>
                Keep browsing
              </button>
            </div>
          </>
        )}
        {failure ? <p class="error">{failure}</p> : null}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── library

type Mode = 'screens' | 'flows';

interface Meta {
  screen_types: string[];
  industries: string[];
  states: string[];
  styles: string[];
  elements: string[];
  flow_categories: string[];
}

type Filters = Partial<Record<'type' | 'app' | 'industry' | 'style' | 'state' | 'element' | 'category', string>>;

/** One answer, with what it answers: drawn by its own kind and platform, never by the controls' current ones. */
type Page = { total: number; next: number | null; platform: Platform } & ({ flows: true; items: Flow[] } | { flows: false; items: Screen[] });

const PAGE_SIZE = 24;

function query(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');
}

const words = (value: string) => value.replace(/-/g, ' ');

/** What a page of results holds, as [one, many]. */
function nouns(page: Page): [string, string] {
  if (page.flows) return ['flow', 'flows'];
  return page.platform === 'site' ? ['page or section', 'pages and sections'] : ['screen', 'screens'];
}

function Library({ email, prefs, changePrefs }: { email: string | null; prefs: Prefs; changePrefs: (change: Partial<Prefs>) => void }) {
  // The sign-in sheet, and what the Add that opened it was for: added once signed in.
  const [signIn, setSignIn] = useState<{ screen?: Screen; flow?: Flow } | null>(null);
  useEffect(() => {
    if (!email || !signIn) return;
    setSignIn(null);
    if (signIn.screen) addScreen(signIn.screen);
    else if (signIn.flow) addFlow(signIn.flow);
  }, [email]);
  const [platform, setPlatform] = useState<Platform>('ios');
  const [mode, setMode] = useState<Mode>('screens');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [apps, setApps] = useState<{ id: string; name: string; logo: string | null }[]>([]);
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  // Scrolled into the results: the header steps aside and the search bar tightens, so screens get the room.
  const [compact, setCompact] = useState(false);
  const lastScroll = useRef(0);
  // The header and controls float over the list (so folding them never moves a card under the pointer).
  // The list is padded by their height, and folding slides them up by the header row's height.
  const chrome = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = chrome.current;
    if (!box) return;
    const measure = () => {
      const header = box.querySelector<HTMLElement>('.top');
      box.parentElement?.style.setProperty('--chrome-h', `${box.offsetHeight}px`);
      box.parentElement?.style.setProperty('--top-h', `${header?.offsetHeight ?? 0}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (compact) setMenu(false);
  }, [compact]);
  const [showFilters, setShowFilters] = useState(false);
  const request = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  const showsFlows = mode === 'flows' && platform !== 'site';

  // A different platform is a different library: no filter is carried over, and Webs have no flows.
  const choosePlatform = (value: Platform) => {
    if (value === platform) return;
    setPlatform(value);
    setFilters({});
    if (value === 'site') setMode('screens');
  };

  // The colour filter: picked colours, and each app's colour once its logo has been read (null until then).
  const [colors, setColors] = useState<PaletteHue[]>([]);
  const [hues, setHues] = useState<Map<string, PaletteHue> | null>(null);

  // Each platform's own filter values and apps.
  useEffect(() => {
    setMeta(null);
    setApps([]);
    setHues(null);
    let current = true;
    Promise.all([getJson<Meta>(`/api/figma/meta?platform=${platform}`), getJson<{ id: string; name: string; logo: string | null }[]>(`/api/figma/apps?platform=${platform}`)])
      .then(([nextMeta, nextApps]) => {
        if (!current) return;
        setMeta(nextMeta);
        setApps(nextApps);
        Promise.all(nextApps.map(async (app) => [app.id, app.logo ? await logoHue(asset(app.logo)) : 'mono'] as const)).then(
          (read) => current && setHues(new Map(read)),
        );
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [platform]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 350);
    // A search that stays put for a moment is one the person meant: remember it.
    const settled = setTimeout(() => remember(typed), 2000);
    return () => {
      clearTimeout(timer);
      clearTimeout(settled);
    };
  }, [typed]);

  /** Newest first, no repeats (ignoring case), at most RECENT_MAX. */
  const remember = (value: string) => {
    const term = value.trim();
    if (term.length < 2) return;
    const lower = term.toLowerCase();
    const newest = prefs.recent[0]?.toLowerCase();
    if (newest === lower) return;
    // Typing on after a pause ("pay" → "paywall") finishes that search rather than adding another.
    const rest = prefs.recent.filter((item, index) => item.toLowerCase() !== lower && !(index === 0 && lower.startsWith(item.toLowerCase())));
    changePrefs({ recent: [term, ...rest].slice(0, RECENT_MAX) });
  };
  const forget = (term: string) => changePrefs({ recent: prefs.recent.filter((item) => item !== term) });

  /** The apps of the picked colours; undefined with none picked. */
  const colorApps = colors.length && hues ? apps.filter((app) => colors.includes(hues.get(app.id) ?? 'mono')).map((app) => app.id) : undefined;
  // Picked colours wait for the logos to be read, rather than showing every app first.
  const waitingForColors = colors.length > 0 && !hues;

  const fetchPage = async (offset: number): Promise<Page> => {
    if (colorApps && !colorApps.length) return { flows: showsFlows, platform, items: [], total: 0, next: null } as Page;
    const appsParam = colorApps?.join(',');
    if (showsFlows) {
      const data = await getJson<{ flows: Flow[]; total: number; next_offset: number | null }>(
        `/api/figma/flows?${query({ platform, q: search, category: filters.category, app: filters.app, apps: appsParam, offset, limit: PAGE_SIZE })}`,
      );
      return { flows: true, platform, items: data.flows, total: data.total, next: data.next_offset };
    }
    const data = await getJson<{ screens: Screen[]; total: number; next_offset: number | null }>(
      `/api/figma/screens?${query({ platform, q: search, type: filters.type, app: filters.app, industry: filters.industry, style: filters.style, state: filters.state, element: filters.element, apps: appsParam, offset, limit: PAGE_SIZE })}`,
    );
    return { flows: false, platform, items: data.screens, total: data.total, next: data.next_offset };
  };

  const report = (error: unknown) => {
    if (error instanceof SignedOutError) return; // The panel is already back on its sign-in screen.
    setFailure((error as Error).message);
  };

  // The first page whenever what is asked for changes; an answer to an older question is dropped.
  useEffect(() => {
    const mine = ++request.current;
    setLoading(true);
    setFailure(null);
    setPage(null);
    if (waitingForColors) return;
    list.current?.scrollTo({ top: 0 });
    setCompact(false);
    fetchPage(0)
      .then((next) => mine === request.current && setPage(next))
      .catch((error) => mine === request.current && report(error))
      .finally(() => mine === request.current && setLoading(false));
  }, [platform, mode, search, filters, colors.join(','), waitingForColors]);

  const loadMore = () => {
    if (!page || page.next === null || loading) return;
    const mine = request.current;
    setLoading(true);
    fetchPage(page.next)
      .then((next) => mine === request.current && setPage({ ...next, items: [...page.items, ...next.items] } as Page))
      .catch((error) => mine === request.current && report(error))
      .finally(() => mine === request.current && setLoading(false));
  };

  // Next page when the end of the list comes into view.
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!end.current) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { root: list.current, rootMargin: '400px' });
    observer.observe(end.current);
    return () => observer.disconnect();
  });

  // "/" jumps to the search box, as in most search UIs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== searchBox.current) {
        event.preventDefault();
        searchBox.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flash = (text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast((current) => (current?.text === text ? null : current)), 3500);
  };

  const addScreen = async (screen: Screen) => {
    if (adding) return;
    if (!email) return setSignIn({ screen });
    remember(search);
    setAdding({ id: screen.id, text: 'Adding…', progress: 0.3 });
    try {
      const parts = await screenParts(screen.id, screen.image.parts);
      await place({ type: 'place-screens', screens: [{ screen, parts }], captions: prefs.captions, placement: prefs.placement });
      flash(`Added ${screen.app.name} — ${screen.name}`);
    } catch (error) {
      if (error instanceof SignedOutError) setSignIn({ screen });
      else flash((error as Error).message, true);
    } finally {
      setAdding(null);
    }
  };

  const addFlow = async (flow: Flow) => {
    if (adding) return;
    if (!email) return setSignIn({ flow });
    remember(search);
    setAdding({ id: flow.id, text: 'Loading steps…', progress: 0.05 });
    try {
      const { steps } = await getJson<{ steps: Step[] }>(`/api/figma/flow/${encodeURIComponent(flow.id)}`);
      let done = 0;
      setAdding({ id: flow.id, text: `0 of ${steps.length}`, progress: 0.1 });
      const downloaded = await Promise.all(
        steps.map(async (step) => {
          const parts = await screenParts(step.id, step.image.parts);
          done += 1;
          setAdding({ id: flow.id, text: `${done} of ${steps.length}`, progress: 0.1 + (0.9 * done) / steps.length });
          return { step, parts };
        }),
      );
      await place({ type: 'place-flow', flow, steps: downloaded, captions: prefs.captions, placement: prefs.placement });
      flash(`Added ${flow.app.name} — ${flow.name} (${steps.length === 1 ? '1 step' : `${steps.length} steps`})`);
    } catch (error) {
      if (error instanceof SignedOutError) setSignIn({ flow });
      else flash((error as Error).message, true);
    } finally {
      setAdding(null);
    }
  };

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined }));
  // Screens and flows filter on different things; switching keeps only the app.
  const chooseMode = (value: Mode) => {
    if (value === mode) return;
    setMode(value);
    setFilters((current) => (current.app ? { app: current.app } : {}));
  };
  const filtered = Object.values(filters).some(Boolean);
  // The first filter sits on the main row; the rest open below it.
  const more = meta
    ? [
        { key: 'app' as const, label: platform === 'site' ? 'Site' : 'App', options: apps.map((app) => app.id), names: Object.fromEntries(apps.map((app) => [app.id, app.name])), images: Object.fromEntries(apps.map((app) => [app.id, app.logo ? asset(app.logo) : null])) },
        ...(showsFlows
          ? []
          : [
              { key: 'industry' as const, label: 'Industry', options: meta.industries },
              { key: 'style' as const, label: 'Style', options: meta.styles },
              { key: 'state' as const, label: 'State', options: meta.states },
              { key: 'element' as const, label: 'UI element', options: meta.elements },
            ]),
      ].filter((filter) => filter.options.length)
    : [];
  const moreSet = more.filter((filter) => filters[filter.key]).length;
  const clearSearch = () => {
    setTyped('');
    setSearch('');
  };
  const colorCounts = hues ? apps.reduce<Partial<Record<PaletteHue, number>>>((all, app) => {
    const hue = hues.get(app.id) ?? 'mono';
    all[hue] = (all[hue] ?? 0) + 1;
    return all;
  }, {}) : {};
  const reset = () => {
    setColors([]);
    setTyped('');
    setSearch('');
    setFilters({});
  };

  // What is on screen now: the chosen theme, or Figma's own until one is chosen. Each click flips it at once.
  const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && document.documentElement.classList.contains('figma-dark'));

  return (
    <div class={compact ? 'library compact' : 'library'}>
      <div class="chrome" ref={chrome}>
      <header class="top">
        <Logo />
        <span class="spacer" />
        <button class="try-icons" onClick={() => toMain({ type: 'open-url', url: `${SITE}/icons` })} title="Motvin Icons, on motvin.com">
          <IconsMark />
          Try Icons
        </button>
        <button class="icon-button" title={dark ? 'Switch to light' : 'Switch to dark'} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => changePrefs({ theme: dark ? 'light' : 'dark' })}>
          <span class={dark ? 'theme-icon is-dark' : 'theme-icon'}>
            <Icon name="sun" size={24} />
            <Icon name="moon" size={24} />
          </span>
        </button>
        <div class="account">
          <button class="icon-button" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}>
            <Icon name="menu" size={20} />
          </button>
          {menu ? (
            <div class="menu" onMouseLeave={() => setMenu(false)}>
              {email ? <p class="menu-email">{email}</p> : null}
              <button class="menu-item" onClick={() => toMain({ type: 'open-url', url: `${SITE}/inspirations` })}>
                <Icon name="external" size={16} /> Open Motvin
              </button>
              {email ? (
                <button class="menu-item" onClick={() => { setMenu(false); signOut(); }}>
                  <Icon name="logout" size={16} /> Sign out
                </button>
              ) : (
                <button class="menu-item" onClick={() => { setMenu(false); setSignIn({}); }}>
                  <Icon name="logout" size={16} /> Sign in
                </button>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <div class="controls">
        <div
          class="searchbar"
          // The bar is one big target for the search box, except the platform menu inside it.
          onMouseDown={(event) => {
            if (!(event.target as HTMLElement).closest('.dropdown, .clear, input')) {
              event.preventDefault();
              searchBox.current?.focus();
            }
          }}
        >
          <Icon name="search" size={20} />
          <input
            ref={searchBox}
            type="search"
            placeholder={platform === 'site' ? 'Search pages…' : 'Search screens…'}
            value={typed}
            onInput={(event) => setTyped((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const value = (event.target as HTMLInputElement).value;
                setSearch(value.trim());
                remember(value);
              }
            }}
          />
          {typed ? (
            <button class="clear" aria-label="Clear search" onClick={(event) => { event.preventDefault(); setTyped(''); setSearch(''); searchBox.current?.focus(); }}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
          <span class="divider" />
          <Dropdown
            class="platform"
            label="Platform"
            align="right"
            value={platform}
            options={(['ios', 'webapp', 'site'] as Platform[]).map((value) => ({ value, label: PLATFORM_LABEL[value] }))}
            onChange={(value) => choosePlatform(value as Platform)}
          />
        </div>

        <div class="row-controls">
          <div class={showsFlows ? 'modes flows' : 'modes'} role="tablist">
            <button role="tab" aria-selected={mode === 'screens' || platform === 'site'} class={!showsFlows ? 'mode on' : 'mode'} onClick={() => chooseMode('screens')} title="Screens">
              <Icon name="screens" size={17} /> Screens
            </button>
            <button role="tab" aria-selected={showsFlows} class={showsFlows ? 'mode on' : 'mode'} onClick={() => chooseMode('flows')} disabled={platform === 'site'} title={platform === 'site' ? 'Webs have no flows' : 'Flows'}>
              <Icon name="flows" size={17} /> Flows
            </button>
          </div>
          {meta ? (
            showsFlows ? (
              <Select label="Category" value={filters.category} options={meta.flow_categories} onChange={(value) => setFilter('category', value)} />
            ) : (
              <Select label="Type" value={filters.type} options={meta.screen_types} onChange={(value) => setFilter('type', value)} />
            )
          ) : null}
          <ColorFilter selected={colors} onChange={setColors} counts={colorCounts} />
          {more.length ? (
            <button class={showFilters || moreSet ? 'pill on' : 'pill'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} title="More filters">
              <Icon name="filter" size={18} />
              {moreSet ? <span class="count-badge">{moreSet}</span> : null}
            </button>
          ) : null}
        </div>

        {showFilters && more.length ? (
          <div class="more-filters">
            {more.map((filter) => (
              <Select key={filter.key} label={filter.label} value={filters[filter.key]} options={filter.options} names={'names' in filter ? filter.names : undefined} images={'images' in filter ? filter.images : undefined} onChange={(value) => setFilter(filter.key, value)} />
            ))}
          </div>
        ) : null}
      </div>
      </div>

      <div
        class="results"
        ref={list}
        onScroll={(event) => {
          const top = (event.currentTarget as HTMLDivElement).scrollTop;
          const moved = top - lastScroll.current;
          // Scrolling down folds the header away; any scroll back up (or reaching the top) brings it back.
          // A few pixels of slack, so a trackpad's jitter does not flicker it.
          if (top < 8 || moved < -6) setCompact(false);
          else if (top > 48 && moved > 6) setCompact(true);
          if (Math.abs(moved) > 6 || top < 8) lastScroll.current = top;
        }}
      >
        {prefs.recent.length || filtered || colors.length ? (
          <div class="chips" aria-label="Recent searches">
            {(Object.entries(filters) as [keyof Filters, string | undefined][])
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <Chip key={`${key}:${value}`} on label={key === 'app' ? apps.find((app) => app.id === value)?.name ?? (value as string) : capitalised(words(value as string))} onClose={() => setFilter(key, '')} />
              ))}
            {PALETTE_HUES.filter((hue) => colors.includes(hue.id)).map((hue) => (
              <Chip key={`color:${hue.id}`} on swatch={hue.swatch} label={hue.label} onClose={() => setColors(colors.filter((value) => value !== hue.id))} />
            ))}
            {prefs.recent.map((term) => (
              <Chip
                key={term}
                on={term.toLowerCase() === typed.trim().toLowerCase()}
                recent
                label={term}
                onClick={() => setTyped(term)}
                onClose={() => {
                  if (term.toLowerCase() === typed.trim().toLowerCase()) clearSearch();
                  forget(term);
                }}
              />
            ))}
          </div>
        ) : null}
        {failure ? <p class="error">{failure}</p> : null}
        {page && !page.items.length && !loading ? (
          <div class="empty">
            <span class="empty-icon"><Icon name="empty" size={28} /></span>
            <strong>No {PLATFORM_LABEL[page.platform]} {nouns(page)[1]} found</strong>
            <p class="muted">
              {search ? `Nothing matches “${search}”${filtered ? ' with these filters' : ''}.` : 'Nothing matches these filters.'} Try {filtered ? 'fewer filters or ' : ''}other words{page.platform === 'site' ? '' : ', or another platform'}.
            </p>
            {filtered || typed ? (
              <button class="secondary" onClick={reset}>
                Clear search and filters
              </button>
            ) : null}
          </div>
        ) : null}
        {!page && loading ? (
          <div class={`grid size-${prefs.size} ${platform}${showsFlows ? ' flows' : ''}`} aria-hidden="true">
            {Array.from({ length: 9 }, () => (
              <div class="card skeleton">
                <div class="thumb" />
                <span class="line" />
                <span class="line short" />
              </div>
            ))}
          </div>
        ) : null}
        {page ? (
          <div class={`grid size-${prefs.size} ${page.platform}${page.flows ? ' flows' : ''}`}>
            {page.flows
              ? page.items.map((flow) => <FlowCard key={flow.id} flow={flow} adding={adding?.id === flow.id ? adding : null} onAdd={() => addFlow(flow)} />)
              : page.items.map((screen) => <ScreenCard key={screen.id} screen={screen} adding={adding?.id === screen.id ? adding : null} onAdd={() => addScreen(screen)} />)}
          </div>
        ) : null}
        {loading && page ? <p class="center muted small">Loading more…</p> : null}
        <div ref={end} class="end" />
      </div>

      <footer class="bottom">
        <span class="total">{page ? (page.total === 1 ? `1 ${nouns(page)[0]}` : `${page.total.toLocaleString()} ${nouns(page)[1]}`) : loading ? 'Loading…' : ''}</span>
        <div class="sizes" role="radiogroup" aria-label="Thumbnail size">
          {(['s', 'm', 'l'] as Prefs['size'][]).map((size) => (
            <button role="radio" aria-checked={prefs.size === size} class={prefs.size === size ? 'size on' : 'size'} onClick={() => changePrefs({ size })} title={SIZE_LABEL[size]}>
              <span class={`dot dot-${size}`} />
            </button>
          ))}
        </div>
        <Settings
          prefs={prefs}
          changePrefs={changePrefs}
          email={email}
          canReset={filtered || Boolean(typed) || colors.length > 0}
          onReset={reset}
          onOpenSite={() => toMain({ type: 'open-url', url: `${SITE}/inspirations` })}
          onSignIn={() => setSignIn({})}
          onSignOut={() => signOut()}
        />
      </footer>

      {signIn ? (
        <SignInSheet
          pending={
            signIn.screen
              ? { thumb: signIn.screen.id, wide: signIn.screen.platform !== 'ios', title: `${signIn.screen.app.name} — ${signIn.screen.name}`, detail: `${capitalised(words(signIn.screen.screen_type))} · ${PLATFORM_LABEL[signIn.screen.platform]}` }
              : signIn.flow
                ? { thumb: signIn.flow.cover_id, wide: signIn.flow.platform !== 'ios', title: `${signIn.flow.app.name} — ${signIn.flow.name}`, detail: `Flow · ${signIn.flow.steps === 1 ? '1 step' : `${signIn.flow.steps} steps`} · ${PLATFORM_LABEL[signIn.flow.platform]}` }
                : null
          }
          onClose={() => setSignIn(null)}
        />
      ) : null}
      {toast ? <div class={toast.error ? 'toast error' : 'toast'}>{toast.text}</div> : null}
    </div>
  );
}

/**
 * A recent search (with × to forget it), a suggestion, or a filter in use.
 * `on` marks what is searched or filtered right now.
 */
function Chip({ label, on, recent, swatch, onClick, onClose }: { label: string; on?: boolean; recent?: boolean; swatch?: string; onClick?: () => void; onClose?: () => void }) {
  const closable = on || recent;
  return (
    <span class={`chip${on ? ' on' : ''}${closable ? ' closable' : ''}`}>
      <button class="chip-label" onClick={onClick} disabled={!onClick} title={recent ? `Search “${label}” again` : undefined}>
        {recent ? <Icon name="history" size={15} /> : null}
        {swatch ? <span class="chip-swatch" style={{ background: swatch }} /> : null}
        <span>{label}</span>
      </button>
      {closable ? (
        <button class="chip-close" aria-label={recent ? `Remove “${label}” from recent searches` : `Remove ${label}`} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </span>
  );
}

function Select(props: { label: string; value?: string; options: string[]; names?: Record<string, string>; images?: Record<string, string | null>; onChange: (value: string) => void }) {
  if (!props.options.length) return null;
  return (
    <Dropdown
      class="pill"
      label={props.label}
      value={props.value ?? ''}
      clearable
      options={props.options.map((option) => ({ value: option, label: props.names?.[option] ?? capitalised(words(option)), image: props.images?.[option] }))}
      onChange={props.onChange}
    />
  );
}

const capitalised = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** A thumbnail that loads once it scrolls into view. */
function Thumb({ id, alt, children }: { id: string | null; alt: string; children?: ComponentChildren }) {
  const [src, setSrc] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!id || !box.current) return;
    let current = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      thumbnail(id)
        .then((url) => current && setSrc(url))
        .catch(() => undefined);
    });
    observer.observe(box.current);
    return () => {
      current = false;
      observer.disconnect();
    };
  }, [id]);
  const [shown, setShown] = useState(false);
  return (
    <div class={shown ? 'thumb' : 'thumb loading'} ref={box}>
      {src ? <img src={src} alt={alt} draggable={false} class={shown ? 'in' : ''} onLoad={() => setShown(true)} /> : null}
      {children}
    </div>
  );
}

function AppName({ app }: { app: Screen['app'] }) {
  return (
    <strong class="app">
      {app.logo ? <img class="app-logo" src={asset(app.logo)} alt="" loading="lazy" crossOrigin="anonymous" /> : <span class="app-logo" />}
      <span>{app.name}</span>
    </strong>
  );
}

function Progress({ adding }: { adding: Adding }) {
  return (
    <>
      <span class="busy">{adding.text}</span>
      <span class="progress"><span style={{ width: `${Math.round(adding.progress * 100)}%` }} /></span>
    </>
  );
}

function ScreenCard({ screen, adding, onAdd }: { screen: Screen; adding: Adding | null; onAdd: () => void }) {
  return (
    <button class={adding ? 'card adding' : 'card'} onClick={onAdd} disabled={Boolean(adding)} aria-label={`Add ${screen.app.name} — ${screen.name} to the canvas`}>
      <Thumb id={screen.id} alt={screen.name}>
        <span class="overlay" />
        {adding ? <Progress adding={adding} /> : <span class="add"><Icon name="plus" size={14} /> Add</span>}
      </Thumb>
      <span class="caption">
        <AppName app={screen.app} />
        <span class="muted">{words(screen.screen_type)}</span>
      </span>
    </button>
  );
}

function FlowCard({ flow, adding, onAdd }: { flow: Flow; adding: Adding | null; onAdd: () => void }) {
  return (
    <button class={adding ? 'card adding' : 'card'} onClick={onAdd} disabled={Boolean(adding)} aria-label={`Add every step of ${flow.app.name} — ${flow.name}`}>
      <Thumb id={flow.cover_id} alt={flow.name}>
        <span class="overlay" />
        <span class="badge">{flow.steps === 1 ? '1 step' : `${flow.steps} steps`}</span>
        {adding ? <Progress adding={adding} /> : <span class="add"><Icon name="plus" size={14} /> Add flow</span>}
      </Thumb>
      <span class="caption">
        <AppName app={flow.app} />
        <span class="muted">{flow.name}</span>
      </span>
    </button>
  );
}
