'use client';

import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent,
  type WheelEvent,
} from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RetryIcon,
  SearchIcon,
  TrashIcon,
} from '@/components/inspirations/Icons';
import { askConfirm } from '@/components/inspirations/ConfirmDialog';
import { useSheet } from '@/components/inspirations/useSheet';
import { LibraryApiClient } from '@/lib/api/client';
import { DEFAULT_SORT, resultsKey, type LibraryParams } from '@/lib/api/libraryParams';
import type { LibraryStats } from '@/lib/api/stats';
import type { LibraryItem } from '@/lib/api/normalize';
import type { Category, CategoryConfig } from '@/lib/config/categories';
import { renderForCategory } from '@/lib/render';
import { greetingFor } from '@/lib/inspirations/guide-chatbot/guideGreeting';
import {
  groupChats,
  newChatId,
  previewOf,
  relativeTime,
  removeChat,
  upsertChat,
  type SavedChat,
  type SavedLine,
} from '@/lib/inspirations/guide-chatbot/guideHistory';
import { track } from '@/lib/analytics';
import {
  actionFromHref,
  LIBRARY_HISTORY_KEY,
  pillHref,
  readLibraryHistory,
  recordLibraryMiss,
  writeLibraryHistory,
} from '@/lib/library/buddy/history';
import {
  elsewhere,
  emptyResultReply,
  looserQueries,
  resolveBuddy,
  topicFor,
  starterChips,
  type BuddyAction,
  type BuddyChip,
  type BuddyContext,
} from '@/lib/library/buddy/resolve';
import { useToast } from './Toast';

/**
 * Motvin Buddy on the icons, logos and illustrations pages.
 *
 * It looks and behaves as the Inspirations Buddy does (UserChatbot.tsx, styled
 * by the same rules — styles/buddy-guide.css is generated from
 * inspirations.css): the dark round button, a panel that grows out of it and
 * dims the page, a greeting with examples, "Thinking…" and answers that fade
 * in word by word, the suggestion row over the box, copy / regenerate / edit,
 * saved chats, Esc, and a bottom sheet on a phone. It only searches the
 * library (lib/library/buddy): it sets the grid's search and filters, moves
 * between Icons, Logos and Illustrations, and — as the Inspirations Buddy shows
 * the app it found — shows the top matches in its answer, a tap from opening.
 */

type Line = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  chips?: BuddyChip[];
  /** What the answer did, as a pill that does it again ("Solid “linkedin” icons"). */
  opened?: { label: string; action: BuddyAction };
  pending?: boolean;
  /** While an answer streams in: the whole of it, and how many words show. */
  full?: string;
  shown?: number;
  /** The library page the answer was given on, so its pill is saved as a link to the right one. */
  page?: Category;
  /** Came over from another library's page: already on screen, so it doesn't animate in again. */
  carried?: boolean;
  /** The top matches the answer shows, once the grid has them. */
  found?: 'loading' | { items: LibraryItem[]; total: number };
};

/** Longest an answer waits on placeholder tiles before saying the search is taking too long. */
const WATCH_TIMEOUT_MS = 15_000;

/** How many matches an answer shows. */
const FOUND_TILES = 6;

type Props = {
  config: CategoryConfig;
  stats: LibraryStats;
  params: LibraryParams;
  setParams: (patch: Partial<LibraryParams>, options?: { replace?: boolean }) => void;
  /** The grid's state: its first matches go in the answer, and an empty find gets a follow-up. */
  results: { loading: boolean; total: number; items: LibraryItem[]; key: string | null; failedKey: string | null };
  /** The grid's own size, stroke and colour, so the tiles draw as its cards do. */
  globals: { size: number; stroke: number; color: string };
  /** Opens an item's detail view, as a tap on its card does. */
  onOpenItem: (item: LibraryItem) => void;
  /** Loads the grid's current search again. */
  onReload: () => void;
};

const LIST_KEYS = ['sources', 'styles', 'categories', 'licenses'] as const;
const LIBRARY_TITLES: Record<Category, string> = {
  icons: 'Icons',
  logos: 'Logos',
  illustrations: 'Illustrations',
};

/** Another library's URL with search and filters, built as useLibraryParams builds its own. */
function libraryHref(category: string, patch: Partial<LibraryParams> = {}) {
  const search = new URLSearchParams();
  if (patch.query) search.set('q', patch.query);
  for (const key of LIST_KEYS) if (patch[key]?.length) search.set(key, patch[key]!.join(','));
  if (patch.sort && patch.sort !== DEFAULT_SORT) search.set('sort', patch.sort);
  const qs = search.toString();
  return qs ? `/${category}?${qs}` : `/${category}`;
}

const BOT_ICON = '/ASSET/Icons/Motvin/bot-Illustration.svg';

/**
 * Moving to another library loads another page, and with it a new Buddy. The
 * chat goes with it in this tab's session storage, so the new page's Buddy
 * opens on the same conversation and fills in the answer that moved it.
 */
const HANDOFF_KEY = 'motvin-library-buddy-handoff';
const HANDOFF_FRESH_MS = 20_000;

type Handoff = {
  at: number;
  category: Category;
  chatId: string | null;
  lines: Line[];
  lineId: number | null;
  patch: Partial<LibraryParams>;
};

function readHandoff(category: Category): Handoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    const handoff = raw ? (JSON.parse(raw) as Handoff) : null;
    if (!handoff || handoff.category !== category || Date.now() - handoff.at > HANDOFF_FRESH_MS || !Array.isArray(handoff.lines))
      return null;
    return handoff;
  } catch {
    return null;
  }
}
const CHIP_ICON_SIZE = 15;

/**
 * Waits on the screen's own frames rather than a timer: some browsers (embedded
 * panes, power saving) stretch a 26ms timer to most of a second, which made the
 * answer crawl in word by word. A hidden tab has no frames, so it falls back to
 * a timer there.
 */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    if (document.hidden) return void window.setTimeout(resolve, ms);
    const end = performance.now() + ms;
    const tick = () => (performance.now() >= end || document.hidden ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
/** A beat of "Thinking…" before an answer, a little different each time. */
const thinkingBeat = () => 320 + Math.random() * 280;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Ties a one-letter word ("I", "a") to the next, so a line never ends on it. */
const keepShortWords = (text: string) => text.replace(/(^|\s)(I|a|A)\s+(?=\S)/g, '$1$2 ');

/** The Inspirations Buddy's thinking orb: three coloured lights circling in a glossy sphere. */
function Thinking() {
  return (
    <span className="ins-guide-thinking" role="status">
      <span className="ins-guide-orb" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="ins-guide-thinking-text">Thinking…</span>
    </span>
  );
}

/** The pill an action leaves in its answer: what the page now shows. */
function openedLabel(action: BuddyAction, said: string, nounPlural: string): string {
  // Only the first sentence names what's shown ("… icons. The others are below.").
  const text = said.split(/(?<=\.)\s/)[0];
  if (action.type === 'library') return `Open ${LIBRARY_TITLES[action.category]}`;
  // "Showing Solid “linkedin” icons." → "Solid “linkedin” icons"
  // "Kept “home” — now Solid." → "Solid “home” icons"
  // "Now MIT only." (filters on filters, no search words) → "matching icons"
  if (/^Now /.test(text)) return `matching ${nounPlural}`;
  const kept = text.match(/^Kept (“.+”) — now (.+?)\.?$/);
  if (kept) return `${kept[2][0].toUpperCase()}${kept[2].slice(1)} ${kept[1]} ${nounPlural}`;
  const shown = text.match(/^(?:Showing|Opening) (.+?)(?: — .*)?\.?$/)?.[1] ?? text.match(/— now (.+?)\.?$/)?.[1];
  return shown ? shown[0].toUpperCase() + shown.slice(1) : 'Show again';
}

export function LibraryBuddy({ config, stats, params, setParams, results, globals, onOpenItem, onReload }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();
  const name = ready && user && !user.isAnonymous ? user.displayName : null;

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  // The box's glow at rest: on each time Buddy opens (and on a new chat), off once something is typed or sent.
  const [restGlow, setRestGlow] = useState(true);
  // The message just sent: only its bubble plays the sent animation.
  const [freshId, setFreshId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // The page is dimmed while Buddy is a modal, and un-dimmed once it has changed the grid, so the
  // visitor sees the result; a click outside then closes it.
  const [dimmed, setDimmed] = useState(true);
  const [history, setHistory] = useState<SavedChat[]>([]);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [now, setNow] = useState(0);
  const [hour, setHour] = useState(12);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const chatId = useRef<string | null>(null);
  // The chat as it stands, for handing over when Buddy moves to another library.
  const linesRef = useRef<Line[]>([]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const [move, setMove] = useState<{ category: Category; patch: Partial<LibraryParams>; lineId: number | null } | null>(null);
  const nextId = useRef(1);
  const alive = useRef(true);
  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The latest page state, read when a reply lands rather than when it was asked.
  const shownTotal = results.loading ? undefined : results.total;
  const ctx = useMemo<BuddyContext>(
    () => ({ config, stats: stats.loading ? null : stats, params, shownTotal }),
    [config, stats, params, shownTotal],
  );
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const closeBuddy = useCallback(() => {
    if (window.matchMedia('(max-width: 759px), (prefers-reduced-motion: reduce)').matches) {
      setOpen(false);
      return;
    }
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 170);
  }, []);

  // On a phone Buddy is a sheet: its top drags up to fill the screen, down to settle or close.
  const { ref: sheetRef, className: sheetClass, dragProps: sheetDrag, handle: sheetHandle } = useSheet(() => setOpen(false));
  const setPanel = useCallback(
    (node: HTMLElement | null) => {
      panelRef.current = node;
      sheetRef(node as HTMLDivElement | null);
    },
    [sheetRef],
  );

  const openBuddy = () => {
    setHour(new Date().getHours());
    setHistory(readLibraryHistory());
    setDimmed(true);
    setRestGlow(true);
    setOpen(true);
  };

  // Sit in the grid's own corner, the right gap matching the bottom one. The corner is the panel's
  // border line (its inner box sits inside 42px of white padding) while the panel is docked; once it's
  // a drawer, the window's edge.
  useEffect(() => {
    const main = document.getElementById('discover');
    if (!main) return;
    let recheck = 0;
    const place = () => {
      const panel = document.querySelector<HTMLElement>('.mi-right-panel');
      const docked = panel && getComputedStyle(panel).position !== 'fixed';
      const line = docked ? [...panel.querySelectorAll<HTMLElement>('.mi-right-panel-inner')].find((el) => el.offsetWidth > 0) : null;
      const rect = main.getBoundingClientRect();
      const corner = line ? line.getBoundingClientRect().left : rect.left + main.clientWidth;
      const edge = Math.max(0, window.innerWidth - corner);
      document.documentElement.style.setProperty('--mi-buddy-edge', `${Math.round(edge)}px`);
      // The cookie banner (a first visit, bottom right) would cover the button: it rises above it while
      // the banner shows, and settles back in its corner once the banner is answered.
      const banner = document.getElementById('cookiesBanner');
      const box = banner?.isConnected && getComputedStyle(banner).display !== 'none' ? banner.getBoundingClientRect() : null;
      const buttonRight = window.innerWidth - edge - 20;
      const covers = box && box.width > 0 && box.right > buttonRight - 55 && box.left < buttonRight;
      const lift = covers ? Math.max(0, window.innerHeight - box.top + 16 - 20) : 0;
      document.documentElement.style.setProperty('--mi-buddy-lift', `${Math.round(lift)}px`);
      // While lifted, look again shortly: the banner can be answered, hidden or taken off the page in
      // ways no observer here sees (it mounts on its own), and the button should settle back at once.
      window.clearTimeout(recheck);
      if (lift > 0) recheck = window.setTimeout(place, 500);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(main);
    const panelEl = document.querySelector('.mi-right-panel');
    const tabs = new MutationObserver(place);
    if (panelEl)
      tabs.observe(panelEl, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'style'],
      });
    // The cookie banner showing or going (it toggles its own display).
    const bannerEl = document.getElementById('cookiesBanner');
    if (bannerEl) tabs.observe(bannerEl, { attributes: true, attributeFilter: ['style', 'class'] });
    // …or being taken off the page altogether.
    if (bannerEl?.parentElement) tabs.observe(bannerEl.parentElement, { childList: true });
    window.addEventListener('resize', place);
    // The banner shows a moment after the page (its own effect): look once it's had the chance.
    const late = window.setTimeout(place, 800);
    return () => {
      window.clearTimeout(recheck);
      window.clearTimeout(late);
      observer.disconnect();
      tabs.disconnect();
      window.removeEventListener('resize', place);
      document.documentElement.style.removeProperty('--mi-buddy-edge');
      document.documentElement.style.removeProperty('--mi-buddy-lift');
    };
  }, []);

  // The box grows with what's typed, a line at a time, up to its max-height, and scrolls after that.
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    const atEnd = field.selectionEnd === field.value.length;
    const scrolled = field.scrollTop;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
    field.scrollTop = atEnd ? field.scrollHeight : scrolled;
  }, [question, open]);

  // The thread follows a reply only while it's read at the bottom; scrolled up, a "latest" button takes it down.
  const stick = useRef(true);
  const autoScrolling = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [away, setAway] = useState(false);
  const [raised, setRaised] = useState(false);
  const toLatest = () => {
    const body = bodyRef.current;
    if (!body) return;
    stick.current = true;
    setAway(false);
    autoScrolling.current = true;
    body.scrollTo({
      top: body.scrollHeight,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => (autoScrolling.current = false), 450);
  };
  const onThreadScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const fromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
    if (!autoScrolling.current) stick.current = fromBottom < 60;
    setAway(!stick.current && fromBottom > 160);
    setRaised(body.scrollTop > 2);
  };
  const leaveBottom = (event: WheelEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => {
    if ('deltaY' in event && event.deltaY >= 0) return;
    autoScrolling.current = false;
  };
  useEffect(() => {
    if (stick.current) toLatest();
  }, [lines]);
  useEffect(() => {
    if (!open || view !== 'chat') return;
    toLatest();
  }, [open, view]);

  // Keep the conversation as it settles — never mid-reply — so a later visit can pick it up.
  useEffect(() => {
    const id = chatId.current;
    if (busy || lines.length === 0 || !id) return;
    // Each answer's pill goes along as a link inside the site, so a reopened chat can still use it —
    // to the library the answer was given in, not the one the chat is saved from.
    const saved: SavedLine[] = lines
      .filter((line) => !line.pending)
      .map(({ id: lineId, role, text, opened, page }) => ({
        id: lineId,
        role,
        text,
        ...(opened ? { opened: { label: opened.label, hint: 'Search', href: pillHref(page ?? config.slug, opened.action) } } : {}),
      }));
    // From what's stored now, not this tab's copy: another tab may have saved chats since this one
    // read them, and writing the old copy back would erase those.
    const stored = readLibraryHistory();
    // upsertChat keeps a chat with as many lines as before unchanged; here an answer also changes in
    // place (its tiles counted, an empty search's pill taken away), so those changes are saved too.
    const existing = stored.find((chat) => chat.id === id);
    const changed = existing && existing.lines.length === saved.length && JSON.stringify(existing.lines) !== JSON.stringify(saved);
    const next = changed
      ? stored.map((chat) => (chat.id === id ? { ...chat, lines: saved, updatedAt: Date.now() } : chat))
      : upsertChat(stored, { id, lines: saved, appId: config.slug }, Date.now());
    if (next !== stored) writeLibraryHistory(next);
    setHistory(next);
  }, [lines, busy, config.slug]);

  // Another tab saved or cleared chats: this tab's list shows them too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === LIBRARY_HISTORY_KEY) setHistory(readLibraryHistory());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Closing hands keyboard focus back to the bot button.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      pillRef.current?.focus();
    }
  }, [open]);

  // Escape steps back one level: out of chat history first. A detail popup on top keeps its own Esc.
  useEffect(() => {
    if (!open) return;
    // The panel mounts on <body> a beat after opening (ModalPortal), so focus the box once it's there.
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      if (document.querySelector('.mi-modal.is-open')) return;
      if (viewRef.current === 'history') setView('chat');
      else closeBuddy();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closeBuddy]);

  // Floating over the live grid (no backdrop), a click anywhere outside closes it.
  useEffect(() => {
    if (!open || dimmed) return;
    const onDown = (event: PointerEvent) => {
      // The confirm box Buddy opened ("Clear chat history?") is part of it, not outside it.
      if ((event.target as Element).closest?.('.ins-confirm-overlay')) return;
      if (!panelRef.current?.contains(event.target as Node)) closeBuddy();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, dimmed, closeBuddy]);

  // Set when Buddy changes the grid: the next finished load fills the answer's tiles (lineId), or,
  // when it's empty, gets a follow-up.
  // `key` and `sort`: the search Buddy asked for, so only its own results fill the answer.
  const watchingRef = useRef<{ key: string; sort: string; lineId: number | null } | null>(null);
  // failWatching is declared further down; the timeouts set before it reach it through this ref.
  const failWatchingRef = useRef<(why: 'failed' | 'slow') => void>(() => {});
  // The latest apply (declared below), for the loosening step, which runs after a search has loaded.
  const applyRef = useRef<(action: BuddyAction, lineId?: number | null) => void>(() => {});
  // Answers already loosened once ("person working laptop" → "laptop"), so they never loop.
  const loosenedRef = useRef(new Set<number>());
  const resultsRef = useRef(results);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const finishWatching = useCallback(() => {
    const watching = watchingRef.current;
    if (!watching) return;
    watchingRef.current = null;
    const { total, items } = resultsRef.current;
    const lineId = watching.lineId;
    if (total > 0) {
      if (lineId === null) return;
      setLines((all) =>
        all.map((line) =>
          line.id === lineId
            ? {
                ...line,
                found: { items: items.slice(0, FOUND_TILES), total },
                text: line.text === 'Trying again…' ? 'Here they are.' : line.text,
                opened: line.opened && { ...line.opened, label: `See all ${total.toLocaleString('en-US')} ${line.opened.label}` },
              }
            : line,
        ),
      );
      return;
    }
    const { params: asked, config: current } = ctxRef.current;
    // "business illustrations": no name says it, but it's one of the library's topics — show that.
    // Only a topic that has something in it; "tech" is Technology.
    const topic = topicFor(asked.query, ctxRef.current.stats?.counts.category ?? {});
    if (topic && lineId !== null && !loosenedRef.current.has(lineId) && !asked.categories.includes(topic)) {
      loosenedRef.current.add(lineId);
      const action: BuddyAction = { type: 'params', patch: { query: '', categories: [topic] } };
      setLines((all) =>
        all.map((line) =>
          line.id === lineId
            ? {
                ...line,
                text: `No names say “${asked.query}”, so here's the ${topic} topic.`,
                found: 'loading',
                opened: { label: `${topic} ${current.nounPlural}`, action },
              }
            : line,
        ),
      );
      applyRef.current(action, lineId);
      return;
    }
    // Every word together found nothing: try fewer words, as a designer would, before giving up.
    const tries = lineId !== null && !loosenedRef.current.has(lineId) ? looserQueries(asked.query) : [];
    if (tries.length) {
      loosenedRef.current.add(lineId!);
      const options = { limit: 1, collection: asked.sources, style: asked.styles, license: asked.licenses, category: asked.categories };
      void Promise.all(
        tries.map((query) =>
          // A client each: the shared one cancels a search when the next starts.
          new LibraryApiClient(current.slug)
            .search(query, options)
            .then((result) => result.total ?? 0)
            .catch(() => 0),
        ),
      ).then((totals) => {
        if (!alive.current) return;
        const size = (query: string) => query.split(' ').length;
        let best = -1;
        totals.forEach((total, index) => {
          if (total <= 0) return;
          if (best < 0 || size(tries[index]) > size(tries[best]) || (size(tries[index]) === size(tries[best]) && total > totals[best]))
            best = index;
        });
        if (best < 0) {
          // Last resort: a topic one of the words names ("happy person" → People).
          const counts = ctxRef.current.stats?.counts.category ?? {};
          const word = asked.query.split(/\s+/).find((w) => topicFor(w, counts));
          const wordTopic = word ? topicFor(word, counts) : null;
          if (wordTopic && !asked.categories.includes(wordTopic)) {
            const action: BuddyAction = { type: 'params', patch: { query: '', categories: [wordTopic] } };
            setLines((all) =>
              all.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      text: `Nothing is named “${asked.query}”, so here's the ${wordTopic} topic.`,
                      found: 'loading',
                      opened: { label: `${wordTopic} ${current.nounPlural}`, action },
                    }
                  : line,
              ),
            );
            applyRef.current(action, lineId);
            return;
          }
          recordLibraryMiss({ library: current.slug, question: asked.query, answer: 'no results, even with fewer words', kind: 'empty' });
          // Every smaller search was tried too: one honest answer in place of "Showing…", and only the
          // ways out that are left (dropping a filter), never "Just “word”" again.
          const reply = emptyResultReply(asked, ctxRef.current);
          const left = reply.chips.filter((chip) => !chip.label.startsWith('Just “'));
          const loosen = left.filter((chip) => chip.action?.type === 'params');
          const text = loosen.length
            ? `No ${current.nounPlural} for “${asked.query}” with these filters. Loosen one:`
            : left.length
              ? `No ${current.nounPlural} for “${asked.query}”. Try another word, or look in ${elsewhere(ctxRef.current)}:`
              : `No ${current.nounPlural} for “${asked.query}”. Try another word, or pick one below.`;
          setLines((all) =>
            all.map((line) =>
              line.id === lineId
                ? { ...line, text, found: undefined, opened: undefined, chips: left.length ? left : starterChips(ctxRef.current) }
                : line,
            ),
          );
          return;
        }
        const query = tries[best];
        const action: BuddyAction = { type: 'params', patch: { query } };
        setLines((all) =>
          all.map((line) =>
            line.id === lineId
              ? {
                  ...line,
                  text: `Nothing had all of “${asked.query}”, so here's “${query}”.`,
                  found: 'loading',
                  opened: { label: `“${query}” ${current.nounPlural}`, action },
                }
              : line,
          ),
        );
        applyRef.current(action, lineId);
      });
      return;
    }
    // Nothing found: the answer says so in its own place rather than "Showing…" with a second bubble.
    const reply = emptyResultReply(ctxRef.current.params, ctxRef.current);
    recordLibraryMiss({ library: ctxRef.current.config.slug, question: ctxRef.current.params.query, answer: reply.text, kind: 'empty' });
    setLines((all) =>
      lineId === null
        ? [...all, { id: nextId.current++, role: 'assistant', text: reply.text, chips: reply.chips }]
        : all.map((line) =>
            line.id === lineId ? { ...line, text: reply.text, chips: reply.chips, found: undefined, opened: undefined } : line,
          ),
    );
  }, []);

  const apply = useCallback(
    (action: BuddyAction, lineId: number | null = null) => {
      if (action.type === 'params') {
        // The params this asks for, worked out as useLibraryParams does (any change but the page resets it).
        const current = ctxRef.current.params;
        const resetsPage = Object.keys(action.patch).some((key) => key !== 'page');
        const next = { ...current, ...action.patch, page: action.patch.page ?? (resetsPage ? 1 : current.page) };
        const key = resultsKey(ctxRef.current.config.slug, next);
        watchingRef.current = { key, sort: next.sort, lineId };
        // Never more than a while on placeholder tiles, whatever happens to the request.
        const started = watchingRef.current;
        window.setTimeout(() => {
          if (watchingRef.current === started) failWatchingRef.current('slow');
        }, WATCH_TIMEOUT_MS);
        // Asking for what's already showing changes nothing, so nothing would report back: answer now.
        if (resultsRef.current.key === key && !resultsRef.current.loading && current.sort === next.sort)
          window.setTimeout(finishWatching, 0);
        setParams(action.patch);
        document.getElementById('grid-scroll')?.scrollTo({ top: 0 });
      } else {
        // Go once the answer has settled into the chat, so it moves along with it (effect below).
        setMove({ category: action.category, patch: action.patch ?? {}, lineId });
      }
      setDimmed(false);
    },
    [setParams, finishWatching],
  );

  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  // Moving to another library: hand the chat over, then go.
  useEffect(() => {
    if (!move) return;
    try {
      const handoff: Handoff = {
        at: Date.now(),
        category: move.category,
        chatId: chatId.current,
        lines: linesRef.current,
        lineId: move.lineId,
        patch: move.patch,
      };
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      // Storage blocked: the move still happens, Buddy just starts closed there.
    }
    router.push(libraryHref(move.category, move.patch));
  }, [move, router]);

  // On <body>, like the library's popups (inside the page shell it would sit under the beta banner).
  // Ready before the first paint, so a Buddy carried over from another library is there at once.
  const [portalReady, setPortalReady] = useState(false);
  // Carried over from another library: the same panel as before, so it never replays its opening
  // (kept while it stays open — taking the mark off would restart the animation). `carriedKey` is the
  // suggestion row it arrived with, which likewise stays still.
  const [restored, setRestored] = useState(false);
  const [carriedKey, setCarriedKey] = useState<number | null>(null);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- document.body exists only after mount
    setPortalReady(true);
  }, []);

  // Arrived from another library's Buddy: open on the same chat, and fill in the answer that moved here.
  // Before the first paint (a layout effect), so the panel never blinks out or replays its opening.
  useLayoutEffect(() => {
    const handoff = readHandoff(config.slug);
    if (!handoff) return;
    chatId.current = handoff.chatId;
    nextId.current = Math.max(0, ...handoff.lines.map((line) => line.id)) + 1;
    const lineId = handoff.lineId;
    const finds = lineId !== null && Boolean(handoff.patch.query || handoff.patch.styles?.length);
    const action: BuddyAction = { type: 'params', patch: handoff.patch };
    /* eslint-disable react-hooks/set-state-in-effect -- restoring the chat the last page handed over */
    setLines(
      handoff.lines.map((line) =>
        line.id === lineId && finds
          ? { ...line, carried: true, page: config.slug, found: 'loading', opened: { label: openedLabel(action, line.text, config.nounPlural), action } }
          : { ...line, carried: true },
      ),
    );
    setCarriedKey([...handoff.lines].reverse().find((line) => line.role === 'assistant' && !line.pending)?.id ?? 0);
    setHistory(readLibraryHistory());
    setHour(new Date().getHours());
    setDimmed(false);
    setRestGlow(false);
    setOpen(true);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    stick.current = true;
    if (finds) {
      // The page arrives with the search the move asked for: its results fill the answer.
      const key = resultsKey(config.slug, ctxRef.current.params);
      watchingRef.current = { key, sort: ctxRef.current.params.sort, lineId };
      // Never more than a while on placeholder tiles, whatever happens to the request.
      const started = watchingRef.current;
      window.setTimeout(() => {
        if (watchingRef.current === started) failWatchingRef.current('slow');
      }, WATCH_TIMEOUT_MS);
      if (resultsRef.current.key === key && !resultsRef.current.loading) window.setTimeout(finishWatching, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arriving
  }, []);

  // Closed (from open — not the closed state a page starts in): a later open is a fresh one, with its
  // usual opening.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const closed = wasOpenRef.current && !open;
    wasOpenRef.current = open;
    if (!closed) return;
    setRestored(false);
    setCarriedKey(null);
  }, [open]);

  // A carried-over chat opens already at its latest answer: set, not scrolled to.
  useLayoutEffect(() => {
    if (!restored || !open) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [restored, open, portalReady]);

  const patch = (id: number, next: Partial<Line>) => setLines((all) => all.map((line) => (line.id === id ? { ...line, ...next } : line)));

  /** Works out the reply and streams it into the reply line, from "Thinking…" to the last word. */
  const answer = async (asked: string, replyId: number) => {
    const calm = reducedMotion();
    if (!calm) await sleep(thinkingBeat());
    const reply = resolveBuddy(asked, ctxRef.current);
    // A fixed typo is said only when the answer doesn't already show the word it was read as.
    const unseen = reply.corrections.filter((c) => !reply.text.toLowerCase().includes(c.to));
    const fixed = unseen.length ? ` (Read “${unseen.map((c) => c.to).join(', ')}”.)` : '';
    const full = keepShortWords(reply.text + fixed);
    const words = full.split(' ');
    for (let count = 1; count <= words.length && alive.current && !calm; count++) {
      patch(replyId, {
        text: words.slice(0, count).join(' '),
        full,
        shown: count,
        pending: false,
      });
      await sleep(26);
    }
    // The last words finish fading in before the answer settles.
    if (!calm) await sleep(320);
    if (!alive.current) return;
    // A pill only for what the page now shows ("Solid “home” icons"); "Page 2" or "Cleared" need none.
    const shows = /^(Showing|Opening|Kept|Now) /.test(reply.text);
    const opened =
      reply.action && reply.kind === 'action' && shows
        ? { label: openedLabel(reply.action, reply.text, ctxRef.current.config.nounPlural), action: reply.action }
        : undefined;
    patch(replyId, {
      page: config.slug,
      text: full,
      full: undefined,
      shown: undefined,
      pending: false,
      chips: reply.chips,
      opened,
      found: opened && reply.action?.type === 'params' ? 'loading' : undefined,
    });
    setBusy(false);
    if (reply.kind === 'fallback' || reply.kind === 'clarify') {
      recordLibraryMiss({ library: ctxRef.current.config.slug, question: asked, answer: reply.text, kind: reply.kind });
    }
    if (reply.action) apply(reply.action, opened ? replyId : null);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setRestGlow(false);
    setQuestion('');
    setBusy(true);
    // Counted as the Inspirations Buddy counts its messages, with the library it was asked in.
    track('library_buddy_message', { library: config.slug });
    if (!chatId.current) chatId.current = newChatId();
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setFreshId(userId);
    stick.current = true;
    setLines((all) => [...all, { id: userId, role: 'user', text }, { id: replyId, role: 'assistant', text: '', pending: true }]);
    await answer(text, replyId);
  };

  // The search Buddy asked for failed, or never came back: the answer says so, with a way to try again,
  // instead of waiting on placeholder tiles.
  const failWatching = useCallback(
    (why: 'failed' | 'slow') => {
      const watching = watchingRef.current;
      if (!watching) return;
      watchingRef.current = null;
      const lineId = watching.lineId;
      const text =
        why === 'failed'
          ? `I couldn't load those ${ctxRef.current.config.nounPlural} just now. Try again in a moment.`
          : `That's taking longer than it should. Try again in a moment.`;
      const chips: BuddyChip[] = [{ label: 'Try again', retry: true }];
      setLines((all) =>
        lineId === null
          ? [...all, { id: nextId.current++, role: 'assistant', text, chips }]
          : all.map((line) => (line.id === lineId ? { ...line, text, chips, found: undefined, opened: undefined } : line)),
      );
    },
    [],
  );

  useEffect(() => {
    failWatchingRef.current = failWatching;
  }, [failWatching]);

  useEffect(() => {
    const watching = watchingRef.current;
    if (watching && results.failedKey === watching.key) failWatching('failed');
  }, [results.failedKey, failWatching]);

  // The grid is showing what Buddy asked for — that search, sorted that way, loaded: its top
  // matches go in the answer. (The address can take a moment to change, so earlier renders, still
  // showing the last search, are passed over.)
  useEffect(() => {
    const watching = watchingRef.current;
    if (!watching || results.loading || results.key !== watching.key || params.sort !== watching.sort) return;
    finishWatching();
  }, [results.loading, results.key, params.sort, finishWatching]);

  // A link can open Buddy with a question already asked — /icons?buddy=thin+weather+icons — as
  // /inspirations?buddy= does. Taken off the address once read, so a reload doesn't ask it again.
  const askedFromLink = useRef(false);
  useEffect(() => {
    if (askedFromLink.current) return;
    askedFromLink.current = true;
    const url = new URL(window.location.href);
    const asked = url.searchParams.get('buddy')?.trim();
    if (!asked) return;
    url.searchParams.delete('buddy');
    window.history.replaceState(window.history.state, '', url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address on arriving
    openBuddy();
    void send(asked.slice(0, 200));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arriving
  }, []);

  const choose = (chip: BuddyChip) => {
    // "Try again": the same search, loaded again, answering in the place of the failed answer.
    if (chip.retry) {
      const last = [...lines].reverse().find((line) => line.role === 'assistant');
      if (!last) return;
      const current = ctxRef.current;
      watchingRef.current = { key: resultsKey(current.config.slug, current.params), sort: current.params.sort, lineId: last.id };
      const started = watchingRef.current;
      window.setTimeout(() => {
        if (watchingRef.current === started) failWatchingRef.current('slow');
      }, WATCH_TIMEOUT_MS);
      const label = current.params.query ? `“${current.params.query}” ${current.config.nounPlural}` : `all ${current.config.nounPlural}`;
      patch(last.id, {
        text: 'Trying again…',
        chips: undefined,
        found: 'loading',
        opened: { label, action: { type: 'params', patch: { query: current.params.query } } },
      });
      onReload();
      return;
    }
    if (chip.ask) return void send(chip.ask);
    if (!chip.action) return;
    if (!chatId.current) chatId.current = newChatId();
    const userId = nextId.current++;
    setFreshId(userId);
    stick.current = true;
    const action = chip.action;
    // A chip that changes what's shown answers with the matches, as a typed find does.
    const replyId = nextId.current++;
    const finds = chip.action.type === 'params' && !('page' in chip.action.patch);
    setLines((all) => [
      ...all,
      { id: userId, role: 'user', text: chip.label },
      {
        id: replyId,
        page: config.slug,
        role: 'assistant',
        text: action.type === 'library' ? `Opening ${LIBRARY_TITLES[action.category]}.` : 'Here they are.',
        found: finds ? 'loading' : undefined,
        // A chip that names a search ("“notion” logos") gets the same "See all" pill as a typed one.
        opened: finds && chip.label.endsWith(config.nounPlural) ? { label: chip.label, action } : undefined,
      },
    ]);
    apply(chip.action, finds ? replyId : null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(question);
  };

  const resetConversation = () => {
    chatId.current = null;
    nextId.current = 1;
    setLines([]);
    setRestGlow(true);
  };

  const clear = () => {
    resetConversation();
    setView('chat');
  };

  const showHistory = () => {
    setNow(Date.now());
    setView('history');
  };

  const openChat = (chat: SavedChat) => {
    chatId.current = chat.id;
    nextId.current = Math.max(0, ...chat.lines.map((line) => line.id)) + 1;
    setLines(
      chat.lines.map(({ id, role, text, opened }) => {
        // The pill comes back from its link: here, a search; in another library, a move there.
        const action = opened?.href ? actionFromHref(opened.href, config.slug) : null;
        return { id, role, text, page: config.slug, ...(opened && action ? { opened: { label: opened.label, action } } : {}) };
      }),
    );
    setView('chat');
  };

  const deleteChat = (id: string) => {
    const next = removeChat(readLibraryHistory(), id);
    setHistory(next);
    writeLibraryHistory(next);
    if (chatId.current === id) resetConversation();
    toast.show('Chat deleted');
  };

  // Every past chat at once, so it asks first — in the same confirm box as the Inspirations Buddy.
  const clearHistory = () => {
    void askConfirm({
      title: 'Clear chat history?',
      description: 'Every past chat with Motvin Buddy will be removed. This can’t be undone.',
      confirmLabel: 'Clear history',
    }).then((ok) => {
      if (!ok) return;
      setHistory([]);
      writeLibraryHistory([]);
      resetConversation();
      toast.show('Chat history cleared');
    });
  };

  const copy = async (line: Line) => {
    try {
      await navigator.clipboard.writeText(line.text.replace(/ /g, ' '));
      setCopiedId(line.id);
      setTimeout(() => setCopiedId((current) => (current === line.id ? null : current)), 1200);
      toast.show('Copied');
    } catch {
      toast.show('Couldn’t copy that');
    }
  };

  const edit = (line: Line) => {
    setQuestion(line.text);
    inputRef.current?.focus();
  };

  /** The visitor's message that an answer replied to. */
  const questionFor = (line: Line) => {
    const at = lines.findIndex((candidate) => candidate.id === line.id);
    for (let i = at - 1; i >= 0; i--) if (lines[i].role === 'user') return lines[i].text;
    return '';
  };

  /** Answers the same question again, in the reply's place. */
  const regenerate = async (line: Line) => {
    const asked = questionFor(line);
    if (!asked || busy) return;
    setRestGlow(false);
    setBusy(true);
    patch(line.id, {
      text: '',
      pending: true,
      chips: undefined,
      opened: undefined,
      full: undefined,
      shown: undefined,
    });
    await answer(asked, line.id);
  };

  /** Enter sends, Shift+Enter is a new line; ↑ in an empty box brings back the last message. */
  const onComposerKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
    if (event.key !== 'ArrowUp' || question.trim()) return;
    const last = [...lines].reverse().find((line) => line.role === 'user');
    if (!last) return;
    event.preventDefault();
    setQuestion(last.text);
  };

  // The suggestion row over the box follows the conversation: places to go at first, then what the
  // latest answer offers next. While a reply is being written, the last settled one's stay put.
  const settled = busy ? lines.slice(0, -2) : lines;
  const latest = [...settled].reverse().find((line) => line.role === 'assistant' && !line.pending);
  const quick: BuddyChip[] = useMemo(
    () => [
      ...(Object.keys(LIBRARY_TITLES) as Category[])
        .filter((slug) => slug !== config.slug)
        .map((slug) => ({
          label: LIBRARY_TITLES[slug],
          action: { type: 'library', category: slug } as BuddyAction,
        })),
      { label: 'Most popular', ask: 'sort by popular' },
      { label: 'Free for commercial use', ask: `commercial ${config.nounPlural}` },
      { label: 'Clear filters', ask: 'clear filters' },
    ],
    [config.slug, config.nounPlural],
  );
  const suggestions = latest?.chips && latest.chips.length > 0 ? latest.chips : quick;
  const suggestKey = latest?.id ?? 0;

  const updateArrows = () => {
    const row = suggestRef.current;
    if (!row) return;
    setCanLeft(row.scrollLeft > 4);
    setCanRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  };
  useEffect(() => {
    suggestRef.current?.scrollTo({ left: 0 });
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [suggestKey, open, view]);
  const scrollSuggest = (direction: -1 | 1) =>
    suggestRef.current?.scrollBy({
      left: direction * 220,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  const onSuggestWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
  };

  // While Buddy is a modal, Tab stays inside it.
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !dimmed) return;
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]'),
    ].filter((item) => item.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) {
    return (
      <div className="mi-buddy-scope">
        <button
          ref={pillRef}
          type="button"
          className="ins-dock-pill ins-dock-user"
          onClick={openBuddy}
          aria-label="Open Motvin Buddy"
          title="Ask Motvin Buddy"
        >
          <img src={BOT_ICON} alt="" width={33} height={33} />
        </button>
      </div>
    );
  }

  const welcome = lines.length === 0;
  const inHistory = view === 'history';
  const examples = starterChips(ctx);

  if (!portalReady) return null;
  return createPortal(
    <div className="mi-buddy-scope">
      {dimmed && <div className={`ins-guide-backdrop ${closing ? 'is-closing' : ''}`} onClick={closeBuddy} aria-hidden />}
      <aside
        ref={setPanel}
        className={`ins-guide ${dimmed ? '' : 'is-floating'} ${closing ? 'is-closing' : ''} ${restored ? 'is-carried' : ''} ${sheetClass}`}
        role="dialog"
        aria-modal={dimmed || undefined}
        aria-label="Motvin Buddy"
        onKeyDown={keepFocusInside}
        {...sheetDrag}
      >
        {sheetHandle}
        <div className={`ins-guide-top ${raised && !inHistory && !welcome ? 'is-raised' : ''}`}>
          {inHistory ? (
            <button type="button" className="ins-guide-back" onClick={() => setView('chat')} title="Back to the chat">
              <span className="ins-guide-back-arrow" aria-hidden>
                <img src="/ASSET/Icons/Motvin/chat-back.svg" alt="" width={20} height={20} />
              </span>
              Chat history
            </button>
          ) : (
            !welcome && (
              <span className="ins-guide-brand">
                <span className="ins-guide-mark" aria-hidden>
                  <img src={BOT_ICON} alt="" width={28} height={28} />
                </span>
                <strong>Motvin Buddy</strong>
              </span>
            )
          )}
          <div className="ins-guide-top-actions">
            {(inHistory || !welcome) && (
              <button
                type="button"
                className="ins-guide-newchat is-icon"
                onClick={clear}
                disabled={busy}
                aria-label="New chat"
                title="New chat"
              >
                {/* Drawn as chat-history.svg is (20px grid, 1.2 black line, round ends) and shown at its
                    size, so the two buttons' lines match — new-chat.svg is a 15px grid, heavier scaled up. */}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M10 3.75V16.25M3.75 10H16.25" stroke="black" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {!inHistory && (
              <button type="button" className="ins-guide-history-btn" onClick={showHistory} aria-label="Chat history" title="Chat history">
                <img src="/ASSET/Icons/Motvin/chat-history.svg" alt="" width={20} height={20} />
              </button>
            )}
          </div>
        </div>

        {inHistory ? (
          <div className="ins-guide-history" role="region" aria-label="Chat history">
            {history.length === 0 ? (
              <div className="ins-guide-history-empty">
                <div className="ins-guide-history-art" aria-hidden>
                  <div className="ins-guide-ghosts">
                    {[2, 1, 0].map((row) => (
                      <div key={row} className={`ins-guide-ghost is-row-${row}`}>
                        <i />
                        <i />
                      </div>
                    ))}
                  </div>
                  <span className="ins-guide-history-bot">
                    <img src={BOT_ICON} alt="" width={30} height={30} />
                  </span>
                </div>
                <h3>No chats yet</h3>
                <p>
                  Ask Buddy for {config.nounPlural}, a style or a source and your conversation will be saved here, in this browser only.
                </p>
                <button type="button" className="ins-guide-empty-cta" onClick={clear}>
                  Start a chat
                </button>
              </div>
            ) : (
              <div className="ins-guide-history-groups">
                {groupChats(history, now).map((group, groupIndex) => (
                  <section key={group.label} className="ins-guide-history-group" aria-label={group.label}>
                    <div className="ins-guide-history-grouphead">
                      <h3>{group.label}</h3>
                      {groupIndex === 0 && (
                        <span className="ins-guide-grouphead-actions">
                          <button type="button" className="ins-guide-link" onClick={clearHistory}>
                            Clear all
                          </button>
                        </span>
                      )}
                    </div>
                    <ul className="ins-guide-history-list">
                      {group.chats.map((chat) => {
                        const preview = previewOf(chat);
                        return (
                          <li key={chat.id}>
                            <button type="button" className="ins-guide-history-item" onClick={() => openChat(chat)}>
                              <span className="ins-guide-history-body">
                                <span className="ins-guide-history-title">{chat.title}</span>
                                {preview && <span className="ins-guide-history-preview">{preview}</span>}
                              </span>
                              <span className="ins-guide-history-side">
                                <span className="ins-guide-history-time">{relativeTime(chat.updatedAt, now)}</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="ins-guide-history-del"
                              onClick={() => deleteChat(chat.id)}
                              aria-label={`Delete “${chat.title}”`}
                              title="Delete this chat"
                            >
                              <TrashIcon size={20} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        ) : welcome ? (
          <div className="ins-guide-welcome">
            <span className="ins-guide-avatar" aria-hidden>
              <img src={BOT_ICON} alt="" width={38} height={38} />
            </span>
            <p className="ins-guide-hi">
              {greetingFor(hour, name)}{' '}
              <span className="ins-guide-wave" aria-hidden>
                👋
              </span>
            </p>
            <h2 className="ins-guide-title">What {config.nounPlural} do you need?</h2>
            <div className="ins-guide-examples">
              <span className="ins-guide-examples-label">Try asking</span>
              {examples.map((chip) => (
                <button key={chip.label} type="button" className="ins-guide-example" onClick={() => choose(chip)} disabled={busy}>
                  <span>{chip.label}</span>
                  <span className="ins-chip-ai" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={bodyRef}
            className="ins-guide-thread"
            role="log"
            aria-live="polite"
            aria-busy={busy}
            onScroll={onThreadScroll}
            onWheel={leaveBottom}
            onTouchMove={leaveBottom}
          >
            {lines.map((line) => (
              <div key={line.id} className={`ins-chat${line.carried ? ' is-carried' : ''}`}>
                <div
                  className={`ins-chat-msg ins-chat-msg--${line.role} ${line.pending ? 'is-typing' : ''} ${line.id === freshId ? 'is-fresh' : ''}`}
                >
                  {line.role === 'user' ? (
                    <span>{line.text}</span>
                  ) : line.pending ? (
                    <Thinking />
                  ) : line.full ? (
                    // Each word fades in out of a blur as it arrives; the whole answer is laid out from the
                    // start (the words to come unseen), so the bubble opens at its size rather than growing.
                    <p className="ins-chat-line">
                      {line.full.split(' ').map((word, index) => (
                        <span key={index} className={`ins-guide-word ${index < (line.shown ?? 0) ? '' : 'is-unseen'}`}>
                          {index > 0 ? ' ' : ''}
                          {word}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="ins-chat-line">{line.text}</p>
                  )}
                  {line.found && (
                    <div className={`mi-buddy-found is-${config.slug}`} aria-busy={line.found === 'loading'}>
                      {line.found === 'loading'
                        ? Array.from({ length: FOUND_TILES }, (_, index) => (
                            <span key={index} className="mi-buddy-tile mi-skel" aria-hidden />
                          ))
                        : line.found.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="mi-buddy-tile"
                              title={`${item.name} · ${item.sourceName}`}
                              aria-label={`Open ${item.name}`}
                              onClick={() => {
                                closeBuddy();
                                onOpenItem(item);
                              }}
                              dangerouslySetInnerHTML={{ __html: renderForCategory(config.slug, item, globals) }}
                            />
                          ))}
                    </div>
                  )}
                  {line.opened && (
                    <button
                      type="button"
                      className="ins-guide-file"
                      onClick={() => apply(line.opened!.action)}
                      title="Show these in the grid"
                    >
                      <span>{line.opened.label}</span>
                      <ArrowRightIcon size={16} />
                    </button>
                  )}
                </div>
                {line.role === 'assistant' && !line.pending && !line.full && (
                  <div className="ins-guide-tools is-assistant" role="toolbar" aria-label="Answer actions">
                    <button type="button" onClick={() => void copy(line)} aria-label="Copy this answer" title="Copy">
                      {copiedId === line.id ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void regenerate(line)}
                      disabled={busy || !questionFor(line)}
                      aria-label="Regenerate this answer"
                      title="Regenerate"
                    >
                      <RetryIcon size={15} />
                    </button>
                  </div>
                )}
                {line.role === 'user' && (
                  <div className="ins-guide-tools" role="toolbar" aria-label="Message actions">
                    <button type="button" onClick={() => edit(line)} aria-label="Edit this message" title="Edit">
                      <PencilIcon size={15} />
                    </button>
                    <button type="button" onClick={() => void send(line.text)} disabled={busy} aria-label="Ask again" title="Ask again">
                      <RetryIcon size={15} />
                    </button>
                    <button type="button" onClick={() => void copy(line)} aria-label="Copy this message" title="Copy">
                      {copiedId === line.id ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {away && (
              <div className="ins-guide-jump-wrap">
                <button type="button" className="ins-guide-jump" onClick={toLatest} aria-label="Jump to the latest message" title="Latest">
                  <ChevronDownIcon size={18} />
                </button>
              </div>
            )}
          </div>
        )}

        {!inHistory && (
          <>
            <div className="ins-guide-suggest-wrap">
              {canLeft && (
                <button
                  type="button"
                  className="ins-guide-suggest-arrow is-left"
                  onClick={() => scrollSuggest(-1)}
                  aria-label="Earlier suggestions"
                >
                  <ChevronLeftIcon size={16} />
                </button>
              )}
              <div
                ref={suggestRef}
                className={`ins-guide-suggest ${canLeft ? 'fade-left' : ''} ${canRight ? 'fade-right' : ''} ${suggestKey === carriedKey ? 'is-carried' : ''}`}
                role="toolbar"
                aria-label="Suggestions"
                onWheel={onSuggestWheel}
                onScroll={updateArrows}
              >
                {suggestions.map((chip, index) => (
                  <button
                    key={`${suggestKey}-${chip.label}`}
                    type="button"
                    className="ins-chip-btn"
                    style={{ '--i': index } as CSSProperties}
                    onClick={() => choose(chip)}
                    disabled={busy}
                  >
                    <span className="ins-chip-icon" aria-hidden>
                      {chip.label.startsWith('Search for') ? <SearchIcon size={CHIP_ICON_SIZE} /> : <span className="ins-chip-ai" />}
                    </span>
                    {chip.label}
                  </button>
                ))}
              </div>
              {canRight && (
                <button
                  type="button"
                  className="ins-guide-suggest-arrow is-right"
                  onClick={() => scrollSuggest(1)}
                  aria-label="More suggestions"
                >
                  <ChevronRightIcon size={16} />
                </button>
              )}
            </div>

            {/* The border beam: slow and soft each time Buddy opens until something is typed; faster and
                brighter as the loader while an answer is worked out. */}
            <form className={`ins-guide-composer ${busy ? 'is-working' : restGlow ? 'is-fresh' : ''}`} onSubmit={submit}>
              <span className="ins-guide-beam" aria-hidden>
                <span className="ins-guide-beam-glow">
                  <span />
                </span>
              </span>
              <textarea
                ref={inputRef}
                rows={1}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  if (e.target.value.trim()) setRestGlow(false);
                }}
                onKeyDown={onComposerKey}
                placeholder={`Ask for ${config.nounPlural}, a style or a source…`}
                aria-label={`Ask Motvin Buddy for ${config.nounPlural}`}
              />
              <div className="ins-guide-composer-bar">
                <button type="button" className="ins-guide-esc" onClick={closeBuddy} title="Close Motvin Buddy">
                  <kbd>Esc</kbd>
                  <span className="ins-guide-esc-label">to close</span>
                  <span className="ins-guide-close-label">Close</span>
                </button>
                <button type="submit" className="ins-guide-send" disabled={!question.trim() || busy} aria-label="Send">
                  <ArrowRightIcon size={18} />
                </button>
              </div>
            </form>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
