import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_PREFS, PLATFORM_LABEL, type CanvasSelection, type ResizeEdge, type Flow, type Platform, type Prefs, type Screen, type Session, type Step } from '../shared';
import { withWatermark } from './watermark';
import { asset, attachSession, getJson, screenParts, signOut, SignedOutError, SITE, startPairing, thumbnail, type Pairing } from './api';
import { onMain, place, toMain } from './bridge';
import { ColorFilter } from './ColorFilter';
import { logoHue, PALETTE_HUES, type PaletteHue } from './colors';
import { decodeFigmaCopy, MAX_COPY_SCREENS, type FigmaCopy } from '../../../src/lib/figma/copy-code';
import { Dropdown } from './Dropdown';
import { PasteSheet, type PasteStatus } from './PasteSheet';
import { Settings } from './Settings';
import { Tour } from './Tour';
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
function SignInSheet({ pending, direct, onClose }: { pending: Pending | null; direct?: boolean; onClose: () => void }) {
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

  // Sign in from the menu or Settings: no extra step, motvin.com opens straight away and this shows the code to match.
  useEffect(() => {
    if (direct) begin();
  }, []);

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
              <button class="link-button" onClick={() => { pairing.cancel(); if (direct) onClose(); }}>
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
  const [signIn, setSignIn] = useState<{ screen?: Screen; flow?: Flow; screens?: Screen[]; direct?: boolean } | null>(null);
  useEffect(() => {
    if (!email || !signIn) return;
    setSignIn(null);
    if (signIn.screen) addScreen(signIn.screen);
    else if (signIn.flow) addFlow(signIn.flow);
    else if (signIn.screens) addScreens(signIn.screens);
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
  // Select mode: clicking a card ticks it, and one Add puts every ticked screen (or flow) on the canvas.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<(Screen | Flow)[]>([]);
  // Shuffle: a random stretch of the current results, in a random order (kept only while the question stays the same).
  const [shuffle, setShuffle] = useState<{ key: string; offset: number } | null>(null);
  // Far enough down the list to offer the way back up.
  const [farDown, setFarDown] = useState(false);
  // The tour: walks a first-time person through the panel once, and again from Settings when asked.
  const [touring, setTouring] = useState(!prefs.welcomed);
  const startTour = () => {
    list.current?.scrollTo({ top: 0 });
    setCompact(false);
    setShowFilters(false);
    setSelecting(false);
    setTouring(true);
  };
  const endTour = () => {
    setTouring(false);
    if (!prefs.welcomed) changePrefs({ welcomed: true });
  };
  const request = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  const showsFlows = mode === 'flows' && platform !== 'site';

  // Ticked screens belong to one platform and one kind: a different library starts the selection over.
  useEffect(() => {
    setPicked([]);
  }, [platform, showsFlows]);

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

  const fetchPage = async (from: number): Promise<Page> => {
    const offset = Math.floor(from);
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

  // What is being asked for: a shuffle holds only while this stays the same.
  const questionKey = JSON.stringify([platform, mode, search, filters, colors]);
  const shuffled = shuffle?.key === questionKey ? shuffle : null;

  // The first page whenever what is asked for changes; an answer to an older question is dropped.
  useEffect(() => {
    const mine = ++request.current;
    setLoading(true);
    setFailure(null);
    setPage(null);
    if (waitingForColors) return;
    list.current?.scrollTo({ top: 0 });
    setCompact(false);
    fetchPage(shuffled?.offset ?? 0)
      .then((next) => mine === request.current && setPage(shuffled ? ({ ...next, items: mixed<Screen | Flow>(next.items) } as Page) : next))
      .catch((error) => mine === request.current && report(error))
      .finally(() => mine === request.current && setLoading(false));
  }, [questionKey, waitingForColors, shuffled?.offset]);

  /** A fresh random stretch of the results; with too few to pick from, just a new order. */
  const shuffleResults = () => {
    const total = page?.total ?? 0;
    const room = Math.max(0, total - PAGE_SIZE);
    let offset = Math.floor(Math.random() * (room + 1));
    if (offset === shuffled?.offset && room > 0) offset = (offset + PAGE_SIZE) % (room + 1);
    setShuffle({ key: questionKey, offset: room ? offset : Math.random() });
  };

  const loadMore = () => {
    if (!page || page.next === null || loading) return;
    const mine = request.current;
    setLoading(true);
    fetchPage(page.next)
      .then((next) => mine === request.current && setPage({ ...next, items: [...page.items, ...(shuffled ? mixed<Screen | Flow>(next.items) : next.items)] } as Page))
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
      const parts = await withWatermark(screen, await screenParts(screen.id, screen.image.parts));
      await place({ type: 'place-screens', screens: [{ screen, parts }], captions: prefs.captions, placement: prefs.placement, layout: prefs.layout });
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
          const parts = await withWatermark(step, await screenParts(step.id, step.image.parts));
          done += 1;
          setAdding({ id: flow.id, text: `${done} of ${steps.length}`, progress: 0.1 + (0.9 * done) / steps.length });
          return { step, parts };
        }),
      );
      await place({ type: 'place-flow', flow, steps: downloaded, captions: prefs.captions, placement: prefs.placement, layout: prefs.layout });
      flash(`Added ${flow.app.name} — ${flow.name} (${steps.length === 1 ? '1 step' : `${steps.length} steps`})`);
    } catch (error) {
      if (error instanceof SignedOutError) setSignIn({ flow });
      else flash((error as Error).message, true);
    } finally {
      setAdding(null);
    }
  };

  /** Several screens at once (a "Copy to Figma" code from motvin.com), side by side; progress shows in the toast. */
  const addScreens = async (screens: Screen[]) => {
    if (adding) return;
    if (!email) return setSignIn({ screens });
    const label = screens.length === 1 ? `${screens[0].app.name} — ${screens[0].name}` : `${screens.length} screens`;
    setAdding({ id: 'pasted', text: 'Adding…', progress: 0 });
    try {
      let done = 0;
      setToast({ text: `Adding ${label}…` });
      const placed = await Promise.all(
        screens.map(async (screen) => {
          const parts = await withWatermark(screen, await screenParts(screen.id, screen.image.parts));
          done += 1;
          if (screens.length > 1) setToast({ text: `Adding ${label}… ${done} of ${screens.length}` });
          return { screen, parts };
        }),
      );
      await place({ type: 'place-screens', screens: placed, captions: prefs.captions, placement: prefs.placement, layout: prefs.layout });
      flash(`Added ${label}`);
    } catch (error) {
      if (error instanceof SignedOutError) setSignIn({ screens });
      else flash((error as Error).message, true);
    } finally {
      setAdding(null);
    }
  };

  const isPicked = (id: string) => picked.some((item) => item.id === id);
  const MAX_PICKED_FLOWS = 10;
  const togglePicked = (item: Screen | Flow) => {
    if (isPicked(item.id)) return setPicked(picked.filter((one) => one.id !== item.id));
    const limit = 'steps' in item ? MAX_PICKED_FLOWS : MAX_COPY_SCREENS;
    if (picked.length >= limit) return flash(`Up to ${limit} ${'steps' in item ? 'flows' : 'screens'} at a time`, true);
    setPicked([...picked, item]);
  };
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };

  /** Every ticked screen side by side, or every ticked flow one board after another. */
  const addPicked = async () => {
    if (!picked.length || adding) return;
    const flows = picked.filter((item): item is Flow => 'steps' in item);
    const screens = picked.filter((item): item is Screen => !('steps' in item));
    if (!email) return setSignIn(screens.length ? { screens } : { flow: flows[0] });
    if (screens.length) await addScreens(screens);
    for (const flow of flows) await addFlow(flow);
    stopSelecting();
  };

  /**
   * "Match selection": finds Motvin screens like the frame selected on the canvas, from what it is called
   * and the words on it (no AI: plain word matching). The frame's width picks iOS or Web Apps.
   */
  const pendingMatch = useRef<CanvasSelection | null>(null);
  const matchSelection = () =>
    new Promise<CanvasSelection | null>((resolve) => {
      const stop = onMain((message) => {
        if (message.type !== 'selection') return;
        stop();
        resolve(message.selection);
      });
      toMain({ type: 'read-selection' });
    }).then((selection) => {
      if (!selection) return flash('Select a frame on the canvas first, then try again', true);
      const wanted: Platform = platform === 'site' ? 'site' : selection.width > 600 ? 'webapp' : 'ios';
      if (wanted !== platform) {
        // The other platform's types and apps load first; the match is applied once they are in.
        pendingMatch.current = selection;
        choosePlatform(wanted);
        return;
      }
      applyMatch(selection);
    });

  const applyMatch = (selection: CanvasSelection) => {
    if (!meta) return;
    const found = matchFrame(selection, meta.screen_types, apps);
    setSelecting(false);
    setColors([]);
    setShowFilters(false);
    if (!found.type && !found.app && !found.words) {
      return flash('Could not tell what that frame is. Name it (like “Login”) and try again.', true);
    }
    setFilters({ ...(found.type ? { type: found.type } : {}), ...(found.app ? { app: found.app.id } : {}) });
    setMode('screens');
    setTyped(found.type || found.app ? '' : found.words);
    setSearch(found.type || found.app ? '' : found.words);
    const said = [found.app?.name, found.type ? capitalised(words(found.type)) : found.app ? '' : `“${found.words}”`].filter(Boolean).join(' · ');
    flash(`Showing ${PLATFORM_LABEL[platform]} screens like your frame: ${said}`);
  };
  useEffect(() => {
    if (!pendingMatch.current || !meta) return;
    const selection = pendingMatch.current;
    pendingMatch.current = null;
    applyMatch(selection);
  }, [meta, apps]);

  /**
   * A code copied on motvin.com ("Copy to Figma") and pasted here: look the screens or flow up, download
   * them and add them, showing each stage in the paste panel (opened for it when ⌘V came without it).
   */
  const addPasted = async (copy: FigmaCopy) => {
    if (adding) return flash('Still adding — paste again in a moment', true);
    setPasteOpen(true);
    setAdding({ id: 'pasted', text: '', progress: 0 });
    try {
      setPasteStatus({ phase: 'finding', title: copy.kind === 'flow' ? 'Finding the flow…' : copy.ids.length === 1 ? 'Finding the screen…' : `Finding ${copy.ids.length} screens…` });
      let flow: Flow | null = null;
      let screens: Screen[];
      if (copy.kind === 'flow') {
        const data = await getJson<{ flow: Flow; steps: Step[] }>(`/api/figma/flow/${encodeURIComponent(copy.id)}`);
        flow = data.flow;
        screens = data.steps;
      } else {
        screens = (await getJson<{ screens: Screen[] }>(`/api/figma/resolve?${query({ platform: copy.platform, ids: copy.ids.join(',') })}`)).screens;
      }
      if (!screens.length) {
        setPasteStatus({ phase: 'error', title: 'Nothing to add', detail: 'Those screens are no longer in the Motvin library.' });
        return;
      }
      const label = flow ? `${flow.app.name} — ${flow.name}` : screens.length === 1 ? `${screens[0].app.name} — ${screens[0].name}` : `${screens.length} screens`;
      // Adding needs a sign-in: hand over to the sign-in sheet, which adds them once signed in.
      if (!email) {
        setPasteOpen(false);
        setPasteStatus(null);
        setSignIn(flow ? { flow } : { screens });
        return;
      }
      const total = screens.length;
      const counting = (done: number) => (total === 1 ? 'Adding to your canvas…' : `Adding ${done} of ${total}…`);
      setPasteStatus({ phase: 'adding', title: counting(0), detail: label, progress: 0.06 });
      let done = 0;
      const downloaded = await Promise.all(
        screens.map(async (screen) => {
          const parts = await withWatermark(screen, await screenParts(screen.id, screen.image.parts));
          done += 1;
          setPasteStatus({ phase: 'adding', title: counting(done), detail: label, progress: 0.06 + (0.86 * done) / total });
          return { screen, parts };
        }),
      );
      if (flow) await place({ type: 'place-flow', flow, steps: downloaded.map(({ screen, parts }) => ({ step: screen as Step, parts })), captions: prefs.captions, placement: prefs.placement, layout: prefs.layout });
      else await place({ type: 'place-screens', screens: downloaded, captions: prefs.captions, placement: prefs.placement, layout: prefs.layout });
      setPasteStatus({ phase: 'done', title: 'Added to your canvas', detail: label, progress: 1 });
      // Said on the canvas too, in Figma's own notice, where the screens just landed.
      toMain({ type: 'notify', message: `✓ Added ${label} to your canvas` });
      // A moment to see it worked, then out of the way.
      setTimeout(() => {
        setPasteOpen(false);
        setPasteStatus(null);
      }, 1400);
    } catch (error) {
      if (error instanceof SignedOutError) {
        setPasteOpen(false);
        setPasteStatus(null);
        setSignIn({});
      } else {
        setPasteStatus({ phase: 'error', title: 'Could not add it', detail: (error as Error).message });
      }
    } finally {
      setAdding(null);
    }
  };

  // The paste panel (PasteSheet), opened from the bottom bar, and what a paste is doing (shown in it).
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<PasteStatus | null>(null);

  // ⌘V anywhere in the panel: a Motvin code adds its screens; any other text pastes as usual (into the search box).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const copy = decodeFigmaCopy(event.clipboardData?.getData('text/plain') ?? '');
      if (!copy) return;
      event.preventDefault();
      void addPasted(copy);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

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
                <button class="menu-item" onClick={() => { setMenu(false); setSignIn({ direct: true }); }}>
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
          setFarDown(top > 900);
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
              ? page.items.map((flow) => <FlowCard key={flow.id} flow={flow} adding={adding?.id === flow.id ? adding : null} selecting={selecting} picked={isPicked(flow.id)} onAdd={() => (selecting ? togglePicked(flow) : addFlow(flow))} />)
              : page.items.map((screen) => <ScreenCard key={screen.id} screen={screen} adding={adding?.id === screen.id ? adding : null} selecting={selecting} picked={isPicked(screen.id)} onAdd={() => (selecting ? togglePicked(screen) : addScreen(screen))} />)}
          </div>
        ) : null}
        {loading && page ? <p class="center muted small">Loading more…</p> : null}
        <div ref={end} class="end" />
      </div>

      {farDown ? (
        <button class="to-top" aria-label="Back to top" title="Back to top" onClick={() => list.current?.scrollTo({ top: 0, behavior: 'smooth' })}>
          <Icon name="up" size={18} />
        </button>
      ) : null}

      {selecting ? (
        <footer class="bottom selecting">
          <button class="icon-button" aria-label="Stop selecting" title="Stop selecting" onClick={stopSelecting}>
            <Icon name="close" size={18} />
          </button>
          <span class="picked-count">
            {picked.length ? `${picked.length} selected` : `Tap ${showsFlows ? 'flows' : 'screens'} to select`}
          </span>
          <span class="spacer" />
          {picked.length ? (
            <button class="link-button" onClick={() => setPicked([])}>
              Clear
            </button>
          ) : null}
          <button class="primary add-picked" disabled={!picked.length || Boolean(adding)} onClick={addPicked}>
            <Icon name="plus" size={16} />
            {picked.length ? `Add ${picked.length} to canvas` : 'Add to canvas'}
          </button>
        </footer>
      ) : (
        <footer class="bottom">
          {/* Opens the paste panel, whose big paste area takes the focus ⌘V needs. */}
          <button class="paste-button" title="Paste screens copied on motvin.com" onClick={() => setPasteOpen(true)}>
            Paste in
            <span class="paste-shortcut" aria-label="Command V">
              <kbd>⌘</kbd>
              <kbd>V</kbd>
            </span>
          </button>
          <div class="quick" role="group" aria-label="Quick actions">
            <button class="quick-button" data-tip="Select several" aria-label="Select several, then add them together" onClick={() => setSelecting(true)} disabled={!page?.items.length}>
              <Icon name="select" size={20} />
            </button>
            <button class="quick-button" data-tip="Shuffle" aria-label="Shuffle: a random mix of these results" onClick={shuffleResults} disabled={!page?.items.length}>
              <Icon name="shuffle" size={20} />
            </button>
            <button class="quick-button" data-tip="Match selection" aria-label="Match selection: screens like the frame selected on your canvas" onClick={() => void matchSelection()}>
              <Icon name="match" size={20} />
            </button>
          </div>
          <span class="spacer" />
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
            onSignIn={() => setSignIn({ direct: true })}
            onSignOut={() => signOut()}
            onTour={startTour}
            onResetPlugin={() => {
              // Every setting to its default (the tour is not shown again), the panel to its first size, search cleared.
              changePrefs({ ...DEFAULT_PREFS, welcomed: true });
              toMain({ type: 'reset-size' });
              reset();
              flash('Plugin reset to its default settings');
            }}
          />
        </footer>
      )}

      {pasteOpen ? (
        <PasteSheet
          status={pasteStatus}
          onRetry={() => setPasteStatus(null)}
          onClose={() => {
            setPasteOpen(false);
            if (pasteStatus?.phase !== 'adding' && pasteStatus?.phase !== 'finding') setPasteStatus(null);
          }}
        />
      ) : null}
      {signIn ? (
        <SignInSheet
          pending={
            signIn.screen
              ? { thumb: signIn.screen.id, wide: signIn.screen.platform !== 'ios', title: `${signIn.screen.app.name} — ${signIn.screen.name}`, detail: `${capitalised(words(signIn.screen.screen_type))} · ${PLATFORM_LABEL[signIn.screen.platform]}` }
              : signIn.flow
                ? { thumb: signIn.flow.cover_id, wide: signIn.flow.platform !== 'ios', title: `${signIn.flow.app.name} — ${signIn.flow.name}`, detail: `Flow · ${signIn.flow.steps === 1 ? '1 step' : `${signIn.flow.steps} steps`} · ${PLATFORM_LABEL[signIn.flow.platform]}` }
                : signIn.screens?.length
                  ? {
                      thumb: signIn.screens[0].id,
                      wide: signIn.screens[0].platform !== 'ios',
                      title: signIn.screens.length === 1 ? `${signIn.screens[0].app.name} — ${signIn.screens[0].name}` : `${signIn.screens.length} screens`,
                      detail: PLATFORM_LABEL[signIn.screens[0].platform],
                    }
                  : null
          }
          direct={signIn.direct}
          onClose={() => setSignIn(null)}
        />
      ) : null}
      {touring && page && !signIn && !pasteOpen ? <Tour onDone={endTour} /> : null}
      {toast ? <Toast text={toast.text} error={toast.error} /> : null}
      <ResizeEdges />
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

/** The tick in the corner of a card while selecting. */
function Tick({ on }: { on: boolean }) {
  return <span class={on ? 'tick on' : 'tick'} aria-hidden="true">{on ? <Icon name="check" size={13} /> : null}</span>;
}

const cardClass = (adding: Adding | null, selecting: boolean, picked: boolean) => `card${adding ? ' adding' : ''}${selecting ? ' selecting' : ''}${picked ? ' picked' : ''}`;

function ScreenCard({ screen, adding, selecting, picked, onAdd }: { screen: Screen; adding: Adding | null; selecting: boolean; picked: boolean; onAdd: () => void }) {
  return (
    <button class={cardClass(adding, selecting, picked)} onClick={onAdd} disabled={Boolean(adding)} aria-pressed={selecting ? picked : undefined} aria-label={selecting ? `Select ${screen.app.name} — ${screen.name}` : `Add ${screen.app.name} — ${screen.name} to the canvas`}>
      <Thumb id={screen.id} alt={screen.name}>
        <span class="overlay" />
        {selecting ? <Tick on={picked} /> : adding ? <Progress adding={adding} /> : <span class="add"><Icon name="plus" size={14} /> Add</span>}
      </Thumb>
      <span class="caption">
        <AppName app={screen.app} />
        <span class="muted">{words(screen.screen_type)}</span>
      </span>
    </button>
  );
}

function FlowCard({ flow, adding, selecting, picked, onAdd }: { flow: Flow; adding: Adding | null; selecting: boolean; picked: boolean; onAdd: () => void }) {
  return (
    <button class={cardClass(adding, selecting, picked)} onClick={onAdd} disabled={Boolean(adding)} aria-pressed={selecting ? picked : undefined} aria-label={selecting ? `Select ${flow.app.name} — ${flow.name}` : `Add every step of ${flow.app.name} — ${flow.name}`}>
      <Thumb id={flow.cover_id} alt={flow.name}>
        <span class="overlay" />
        <span class="badge">{flow.steps === 1 ? '1 step' : `${flow.steps} steps`}</span>
        {selecting ? <Tick on={picked} /> : adding ? <Progress adding={adding} /> : <span class="add"><Icon name="plus" size={14} /> Add flow</span>}
      </Thumb>
      <span class="caption">
        <AppName app={flow.app} />
        <span class="muted">{flow.name}</span>
      </span>
    </button>
  );
}

/** The same items in a random order (Fisher–Yates). */
function mixed<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Other ways people name a screen type, as the library's own type. */
const TYPE_WORDS: Record<string, string[]> = {
  login: ['sign in', 'signin', 'log in', 'welcome back'],
  signup: ['sign up', 'register', 'create account', 'create an account', 'get started'],
  settings: ['preferences'],
  profile: ['account', 'my profile'],
  checkout: ['payment', 'pay now', 'place order'],
  paywall: ['subscribe', 'upgrade', 'go premium', 'free trial'],
  search: ['search'],
  onboarding: ['walkthrough', 'intro'],
};

const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const DEFAULT_NAME = /^(frame|group|rectangle|component|instance|section|screen|artboard|iphone|desktop|macbook|android)( \d+)*( pro| max| plus| mini)*( \d+)*$/;

/**
 * What a canvas frame looks like in Motvin's terms: a screen type and an app named in its layer names
 * (first) or its text, else its own name to search for. Plain word matching, nothing sent anywhere else.
 */
function matchFrame(selection: CanvasSelection, types: string[], apps: { id: string; name: string }[]): { type?: string; app?: { id: string; name: string }; words: string } {
  const names = ` ${selection.names.map(plain).join(' ')} `;
  const texts = ` ${selection.texts.map(plain).join(' ')} `;
  const findType = (haystack: string) =>
    types.find((type) => {
      const own = plain(words(type));
      return [own, own.replace(/ /g, ''), ...(TYPE_WORDS[type] ?? [])].some((word) => haystack.includes(` ${word} `));
    });
  const findApp = (haystack: string) => apps.find((app) => plain(app.name).length > 2 && haystack.includes(` ${plain(app.name)} `));
  const type = findType(names) ?? findType(texts);
  const app = findApp(names) ?? findApp(texts);
  const own = selection.names.map(plain).find((name) => name && !DEFAULT_NAME.test(name)) ?? '';
  return { type, app, words: own };
}

const EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/**
 * Resizing the panel from any edge or corner: Figma has no resize of its own for plugin windows, so each drag
 * asks the main code to resize (and, from the left or top, move) the window. The size is kept once the drag ends.
 * Only the bottom-right corner shows a grip; the other edges show a resize cursor under the pointer.
 */
function ResizeEdges() {
  const start = (edge: ResizeEdge) => (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const grip = event.currentTarget as HTMLElement;
    // Screen coordinates: the window moves under the pointer when dragged from the left or top.
    const from = { x: event.screenX, y: event.screenY };
    let frame = 0;
    let done = false;
    let moved = { dx: 0, dy: 0 };
    toMain({ type: 'resize-start' });
    const move = (next: PointerEvent) => {
      // A move with no button held means the release was missed (it happened outside the panel): finish here.
      if (next.buttons === 0) return end();
      moved = { dx: next.screenX - from.x, dy: next.screenY - from.y };
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        toMain({ type: 'resize', edge, ...moved });
      });
    };
    // Ends once, however the drag stops: release, cancel, lost capture (the panel resized out from under the
    // pointer), or the window losing focus. Before, a lost capture left the drag half-finished and the next one stuck.
    function end() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      toMain({ type: 'resize', edge, ...moved, save: true });
      grip.removeEventListener('lostpointercapture', end);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
      document.documentElement.classList.remove('resizing', `resizing-${edge}`);
    }
    document.documentElement.classList.add('resizing', `resizing-${edge}`);
    // Listen on the window, not only the grip, so the drag keeps going if pointer capture is dropped.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    try {
      grip.setPointerCapture(event.pointerId);
      grip.addEventListener('lostpointercapture', end);
    } catch {
      // Capture is a nicety; the window listeners above carry the drag without it.
    }
  };
  return (
    <>
      {EDGES.map((edge) => (
        <div key={edge} class={`resize-edge edge-${edge}`} aria-hidden="true" onPointerDown={start(edge)}>
          {edge === 'se' ? (
            <svg width="8" height="8" viewBox="0 0 10 10">
              <path d="M9 1 1 9M9 5 5 9" />
            </svg>
          ) : null}
        </div>
      ))}
    </>
  );
}

/** The note at the bottom of the panel; "Added…" gets a green tick before it. */
function Toast({ text, error }: { text: string; error?: boolean }) {
  const done = !error && text.startsWith('Added');
  return (
    <div class={error ? 'toast is-error' : 'toast'} role={error ? 'alert' : 'status'}>
      {done ? (
        <span class="toast-mark" aria-hidden="true">
          <Icon name="check" size={13} />
        </span>
      ) : null}
      <span>{text}</span>
    </div>
  );
}

