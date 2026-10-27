'use client';

import { usePathname, useRouter } from 'next/navigation';
import { isOverlayMove } from './useFitResults';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type WheelEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { askConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { useSheet } from './useSheet';
import { useIsLibraryAdmin } from './useIsLibraryAdmin';
import { inspirationsApi } from '@/lib/inspirations/api';
import { greetingFor } from '@/lib/inspirations/guide-chatbot/guideGreeting';
import { nextNudge, nudgeMessages, readNudgeState, writeNudgeState } from '@/lib/inspirations/guide-chatbot/guideNudge';
import { groupChats, newChatId, previewOf, readHistory, relativeTime, removeChat, upsertChat, writeHistory, type SavedChat, type SavedLine } from '@/lib/inspirations/guide-chatbot/guideHistory';
import { recordMiss } from '@/lib/inspirations/guide-chatbot/guideTelemetry';
import { QUICK_PAGES, resolveNavigation, type GuideAction, type NavCard, type NavTarget, type ReplyKind } from '@/lib/inspirations/guide-chatbot/navAssistant';
import type { App } from '@/lib/inspirations/types';
import { countsOn } from '@/lib/inspirations/appCounts';
import { browsedPlatforms } from '@/lib/inspirations/filters';

// A short reply that starts with yes or no ("yes copy it", "yes, bro", "nope not now"), not a new question.
const TYPED_YES = /^(?:y|yes|yeah|yep|yup|ya|yea|sure|ok|okay|k|please|do it|go ahead|go for it|copy it|confirm|of course|absolutely|definitely)\b(?![^?]*\?)(?:[\s,!.]+[\p{L}'’]+){0,4}[\s!.]*$/iu;
const TYPED_NO = /^(?:n|no|nope|nah|not now|cancel|no thanks|don'?t|stop|never mind|nevermind|skip)\b(?![^?]*\?)(?:[\s,!.]+[\p{L}'’]+){0,4}[\s!.]*$/iu;

/** The apps of the section being browsed (Webs or iOS), biggest there first — what examples and nudges name. */
function sectionApps(apps: App[]): App[] {
  const section = browsedPlatforms(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''));
  return apps
    .filter((app) => app.platforms.some((platform) => section.includes(platform)))
    .sort((a, b) => countsOn(b, section).screens - countsOn(a, section).screens);
}
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  ExternalIcon,
  PencilIcon,
  RetryIcon,
  SearchIcon,
  TrashIcon,
} from './Icons';

type Line = { id: number; role: 'user' | 'assistant'; text: string; targets?: NavTarget[]; card?: NavCard; opened?: NavTarget; pending?: boolean; streaming?: boolean; full?: string; shown?: number; slow?: boolean; error?: boolean; kind?: ReplyKind; action?: GuideAction };

/** Where the guide files what a visitor asks to keep. */

/** The query parameter that opens the guide with a question (see INSPIRATIONS_ROUTES.askBuddy). */
const BUDDY_PARAM = 'buddy';

const NUDGE_DELAY = 2500;
const NUDGE_LIFETIME = 6500;
const NUDGE_GAP = 12000;
const SLOW_AFTER_MS = 900;

const CHIP_ICON_SIZE = 15;

/** Every suggestion carries the ai-chip icon; the "Search for …" chip keeps the magnifier. */
function chipIcon(target: NavTarget): ReactNode {
  if (target.label.startsWith('Search for')) return <SearchIcon size={CHIP_ICON_SIZE} />;
  return <span className="ins-chip-ai" />;
}

/** Ties a one-letter word ("I", "a") to the next, so a line never ends on it. */
const keepShortWords = (text: string) => text.replace(/(^|\s)(I|a|A)\s+(?=\S)/g, '$1$2\u00a0');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What the guide says while it works: "Thinking…", then, when it's slow, what it's up to. */
const THINKING_STEPS = ['Reading the library…', 'Connecting the dots…', 'Picking the best screens…', 'Almost there…'];

/**
 * The guide at work: a small glossy orb in the sent message's colours. Three
 * lights drift round inside it at their own speeds and melt into each other,
 * as the orb breathes in a soft glow (all CSS, see .ins-guide-orb).
 */
function ThinkingOrb() {
  return (
    <span className="ins-guide-orb" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

type CompareApp = { name: string; iconSrc?: string; href?: string; subtitle?: string };

/** A value as a number, for the bars ("1,204" → 1204, "★ 4.5" → 4.5), or null when it isn't one. */
const asNumber = (value: string) => (/^[★\s\d.,]+$/.test(value) && /\d/.test(value) ? Number(value.replace(/[^\d.]/g, '')) : null);

/** An app at the head of a comparison: logo, name and category; it opens the app. */
function CompareHead({ app, open, end }: { app: CompareApp; open: (app: CompareApp) => void; end?: boolean }) {
  const body = (
    <>
      {app.iconSrc ? <img src={app.iconSrc} alt="" width={36} height={36} /> : <span className="ins-guide-compare-noicon" aria-hidden />}
      <strong>{app.name}</strong>
      {app.subtitle && <span>{app.subtitle}</span>}
    </>
  );
  return app.href ? (
    <button type="button" className={`ins-guide-compare-app ${end ? 'is-end' : ''}`} onClick={() => open(app)} title={`Open ${app.name}`}>
      {body}
    </button>
  ) : (
    <span className={`ins-guide-compare-app ${end ? 'is-end' : ''}`}>{body}</span>
  );
}

/**
 * Apps side by side. Two face each other ("vs" between them), and each number
 * sits over a bar split by their shares, the bigger side dark, so who's ahead
 * shows at a glance; a value both share is said once ("iOS · both"). Three
 * line up in columns under their apps, the most in each row in bold.
 */
function CompareCard({ card, open }: { card: NavCard; open: (app: CompareApp) => void }) {
  const apps: CompareApp[] = card.apps ?? (card.columns ?? []).map((name) => ({ name }));
  const rows = card.rows ?? [];
  if (apps.length === 2) {
    return (
      <div className="ins-guide-vs" role="group" aria-label={`${apps[0].name} and ${apps[1].name} side by side`}>
        <div className="ins-guide-vs-head">
          <CompareHead app={apps[0]} open={open} />
          <span className="ins-guide-vs-badge" aria-hidden>
            vs
          </span>
          <CompareHead app={apps[1]} open={open} end />
        </div>
        {rows.map((row) => {
          const [a, b] = row.values;
          if (a === b) {
            return (
              <div key={row.label} className="ins-guide-vs-row is-same">
                <span className="ins-guide-vs-label">{row.label}</span>
                <span className="ins-guide-vs-same">{a === '—' ? 'Not known' : `${a} · both`}</span>
              </div>
            );
          }
          const x = asNumber(a);
          const y = asNumber(b);
          const bars = x !== null && y !== null && x + y > 0;
          return (
            <div key={row.label} className="ins-guide-vs-row">
              <div className="ins-guide-vs-line">
                <span className={`ins-guide-vs-value ${row.lead === 0 ? 'is-lead' : ''}`}>{a}</span>
                <span className="ins-guide-vs-label">{row.label}</span>
                <span className={`ins-guide-vs-value ${row.lead === 1 ? 'is-lead' : ''}`}>{b}</span>
              </div>
              {bars && (
                <div className="ins-guide-vs-bar" aria-hidden>
                  <i className={row.lead === 0 ? 'is-lead' : ''} style={{ flexGrow: Math.max(x, (x + y) * 0.04) }} />
                  <i className={row.lead === 1 ? 'is-lead' : ''} style={{ flexGrow: Math.max(y, (x + y) * 0.04) }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="ins-guide-compare" role="table" aria-label={card.title} style={{ ['--cols' as string]: apps.length }}>
      <div className="ins-guide-compare-row is-head" role="row">
        <span role="columnheader" />
        {apps.map((app) => (
          <span key={app.name} role="columnheader">
            <CompareHead app={app} open={open} />
          </span>
        ))}
      </div>
      {rows.map((row) =>
        row.values.every((value) => value === row.values[0]) ? (
          <div key={row.label} className="ins-guide-compare-row" role="row">
            <span role="rowheader">{row.label}</span>
            <span role="cell" className="ins-guide-compare-all">
              {row.values[0] === '—' ? 'Not known' : `${row.values[0]} · all`}
            </span>
          </div>
        ) : (
          <div key={row.label} className={`ins-guide-compare-row ${row.lead !== undefined ? 'has-lead' : ''}`} role="row">
            <span role="rowheader">{row.label}</span>
            {row.values.map((value, index) => (
              <span key={`${row.label}-${index}`} role="cell" className={row.lead === index ? 'is-lead' : undefined}>
                {value}
              </span>
            ))}
          </div>
        ),
      )}
    </div>
  );
}

/** "Thinking…", and once a reply is slow, a new line every so often on what it's doing. */
function ThinkingStatus({ slow }: { slow?: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!slow) return;
    const timer = setInterval(() => setStep((n) => (n + 1) % THINKING_STEPS.length), 1600);
    return () => clearInterval(timer);
  }, [slow]);
  const text = slow ? THINKING_STEPS[step] : 'Thinking…';
  return (
    <span className="ins-guide-thinking" role="status">
      <ThinkingOrb />
      <span key={text} className="ins-guide-thinking-text">
        {text}
      </span>
    </span>
  );
}

export function UserChatbot() {
  const router = useRouter();
  const pathname = usePathname();
  const { show } = useToast();
  const { user, ready } = useAuth();
  const signedIn = ready && Boolean(user && !user.isAnonymous);
  const libraryAdmin = useIsLibraryAdmin();
  const alongsideAdmin = signedIn && libraryAdmin.status === 'admin';
  const displayName = signedIn ? user?.displayName : null;
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  // The message just sent: only its bubble plays the sent animation (not history, on reopening).
  const [freshId, setFreshId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // The page behind is dimmed while the guide is a modal, and un-dimmed once it
  // has taken the visitor somewhere, so they can see where they landed.
  const [dimmed, setDimmed] = useState(true);
  const [nudge, setNudge] = useState<{ text: string; key: number } | null>(null);
  const allApps = useRef<App[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  // On a phone the guide is a sheet, as the modals are: its top drags up to fill the screen, down to settle or close.
  const { ref: sheetRef, className: sheetClass, dragProps: sheetDrag, handle: sheetHandle } = useSheet(() => setOpen(false));
  const setPanel = useCallback(
    (node: HTMLElement | null) => {
      panelRef.current = node;
      sheetRef(node as HTMLDivElement | null);
    },
    [sheetRef],
  );
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  // Past conversations, kept in this browser, and which screen the panel shows.
  const [history, setHistory] = useState<SavedChat[]>([]);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [now, setNow] = useState(0);
  // The welcome screen: a time-of-day greeting and example questions drawn from the real library.
  const [hour, setHour] = useState(12);
  const [examples, setExamples] = useState<string[]>([]);
  // The saved chat being continued.
  const chatId = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The box grows with what's typed, a line at a time, up to its max-height
  // (in CSS), and scrolls after that.
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    // Measuring (height: auto) throws away the scroll to the caret, so keep
    // it: typing or pasting at the end shows the end, elsewhere stays put.
    const atEnd = field.selectionEnd === field.value.length;
    const scrolled = field.scrollTop;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
    field.scrollTop = atEnd ? field.scrollHeight : scrolled;
  }, [question, open]);
  const pillRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const nextId = useRef(1);
  const lastApp = useRef<App | null>(null);
  const lastSection = useRef<string | null>(null);
  // What the last answer listed, so "the second one" has something to point at.
  const lastResults = useRef<NavTarget[] | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The thread follows a reply as it comes in only while it's read at the
  // bottom: scrolled up (to read back, or regenerating an older answer), it
  // stays put, and a "latest" button takes it down. Sending always goes down.
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
    body.scrollTo({ top: body.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => (autoScrolling.current = false), 450);
  };
  const onThreadScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const fromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
    // Its own smooth scroll passes through the middle; only the reader's own scrolling unsticks it.
    if (!autoScrolling.current) stick.current = fromBottom < 60;
    setAway(!stick.current && fromBottom > 160);
    setRaised(body.scrollTop > 2);
  };
  // Scrolling up mid-reply wins over following it down.
  const leaveBottom = (event: WheelEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if ('deltaY' in event && event.deltaY >= 0) return;
    autoScrolling.current = false;
  };
  useEffect(() => {
    if (stick.current) toLatest();
  }, [lines]);
  // Opened, or back from the history: at the latest.
  useEffect(() => {
    if (!open || view !== 'chat') return;
    toLatest();
  }, [open, view]);

  // Keep the conversation as it settles — never mid-reply — so a later visit can pick it up.
  useEffect(() => {
    const id = chatId.current;
    if (busy || lines.length === 0 || !id) return;
    const saved: SavedLine[] = lines.filter((line) => !line.pending).map(({ id: lineId, role, text, targets, card, opened, error }) => ({ id: lineId, role, text, targets, card, opened, error }));
    const appId = lastApp.current?.id ?? history.find((chat) => chat.id === id)?.appId ?? null;
    const next = upsertChat(history, { id, lines: saved, appId }, Date.now());
    if (next !== history) {
      setHistory(next);
      writeHistory(next);
    }
  }, [lines, busy, history]);

  // Closing the panel hands keyboard focus back to the bot button it came from.
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

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Escape steps back one level: out of chat history first, and never while typing in another script (IME).
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      if (viewRef.current === 'history') setView('chat');
      else setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Once the guide has taken the visitor somewhere it floats over the live page (no backdrop), so a
  // click anywhere outside it closes it.
  useEffect(() => {
    if (!open || dimmed) return;
    const onDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, dimmed]);

  // The most-browsed app's name, so one of the nudges can mention something real.
  useEffect(() => {
    void inspirationsApi
      .listApps()
      .then((apps) => {
        allApps.current = apps;
      })
      .catch(() => undefined);
  }, []);

  // The guide calls out from its button with a different line each time — a few
  // times a visit, for everyone including the owner, and not again once it has
  // been dismissed or opened.
  useEffect(() => {
    if (!ready || open) return;
    const first = readNudgeState();
    if (nextNudge(first, nudgeMessages(null)) === null) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (run: () => void, ms: number) => {
      timers.push(setTimeout(run, ms));
    };
    const callOut = () => {
      if (cancelled) return;
      const state = readNudgeState();
      const text = nextNudge(state, nudgeMessages(sectionApps(allApps.current)[0]?.name ?? null));
      if (!text) return;
      writeNudgeState({ ...state, shown: state.shown + 1 });
      setNudge({ text, key: state.shown });
      later(() => {
        setNudge(null);
        later(callOut, NUDGE_GAP);
      }, NUDGE_LIFETIME);
    };
    later(callOut, first.shown === 0 ? NUDGE_DELAY : NUDGE_GAP);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [ready, open]);

  const patch = (id: number, change: Partial<Line>) => setLines((all) => all.map((line) => (line.id === id ? { ...line, ...change } : line)));

  const openGuide = () => {
    setNudge(null);
    writeNudgeState({ ...readNudgeState(), dismissed: true });
    setDimmed(true);
    setView('chat');
    // Saved conversations live in this browser's storage, which the server render never sees.
    setHistory(readHistory());
    setHour(new Date().getHours());
    void inspirationsApi
      .listApps()
      .then((apps) => {
        const top = sectionApps(apps).slice(0, 2);
        if (top.length === 0) return;
        const [first, second] = top;
        setExamples([`Open ${first.name}`, `Which app has the most flows?`, ...(second ? [`Compare ${first.name} and ${second.name}`] : [`How many screens does ${first.name} have?`])]);
      })
      .catch(() => undefined);
    setOpen(true);
  };

  const go = (target: NavTarget, said?: string) => {
    if (target.href === '__back__') router.back();
    // A screen or flow the assistant opens on this page lays over it, without scrolling the page.
    else router.push(target.href, isOverlayMove(target.href, pathname, new URLSearchParams(window.location.search)) ? { scroll: false } : undefined);
    setDimmed(false);
    if (window.matchMedia('(max-width: 900px)').matches) {
      // On a phone the sheet would hide the page, so it closes — the answer stays readable in a bubble by the
      // button for a few seconds, and a tap opens the chat again where it was.
      setOpen(false);
      if (said) {
        setNudge({ text: said, key: -1 });
        setTimeout(() => setNudge((shown) => (shown?.key === -1 && shown.text === said ? null : shown)), 6000);
      }
    }
  };

  const say = (text: string, extra: Partial<Line> = {}) => setLines((all) => [...all, { id: nextId.current++, role: 'assistant', text, kind: 'answer', ...extra }]);

  /** The visitor said yes to copying a link. */
  const confirmAction = async (line: Line) => {
    const action = line.action;
    if (!action) return;
    patch(line.id, { action: undefined });
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${action.href}`);
      say(`Copied the link to ${action.label}.`);
    } catch {
      say(`I couldn’t reach the clipboard. Here’s the link to copy: ${window.location.origin}${action.href}`);
    }
  };

  const declineAction = (line: Line) => {
    patch(line.id, { action: undefined });
    say('No problem.');
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    // A typed "yes" or "no" answers the copy Buddy just asked about, like its buttons.
    const asking = [...lines].reverse().find((line) => line.role === 'assistant' && !line.pending);
    if (asking?.action && (TYPED_YES.test(text) || TYPED_NO.test(text))) {
      setQuestion('');
      setLines((all) => [...all, { id: nextId.current++, role: 'user', text }]);
      if (TYPED_YES.test(text)) await confirmAction(asking);
      else declineAction(asking);
      return;
    }
    setQuestion('');
    setBusy(true);
    if (!chatId.current) {
      chatId.current = newChatId();
    }
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setFreshId(userId);
    stick.current = true;
    setLines((all) => [...all, { id: userId, role: 'user', text }, { id: replyId, role: 'assistant', text: '', pending: true }]);
    await answer(text, replyId);
  };

  /** Works out the reply to a question and streams it into the reply line, from "Thinking…" to the last word. */
  const answer = async (text: string, replyId: number) => {
    // A reply that is quick needs only the dots; one that drags says what it is doing.
    const slowTimer = setTimeout(() => patch(replyId, { slow: true }), SLOW_AFTER_MS);
    try {
      // The app talked about belongs to its section: after moving from iOS to Webs, "how many screens?" is not about the iOS app.
      const section = browsedPlatforms(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')).join(',');
      if (section !== lastSection.current) {
        lastSection.current = section;
        lastApp.current = null;
        lastResults.current = null;
      }
      const reply = await resolveNavigation(text, { app: lastApp.current, results: lastResults.current, page: { pathname, search: typeof window !== 'undefined' ? window.location.search : '' } });
      if (reply.app) {
        lastApp.current = reply.app;
        // A list belongs to the answer that made it; one about a single app ends it.
        lastResults.current = reply.results ?? null;
      } else if (reply.results) lastResults.current = reply.results;
      if (reply.kind === 'fallback' || reply.kind === 'clarify' || reply.kind === 'error') recordMiss(text, reply.kind, reply.text);
      const calm = reducedMotion();
      if (!calm) await sleep(320 + Math.random() * 280);
      reply.text = keepShortWords(reply.text);
      const words = reply.text.split(' ');
      for (let count = 1; count <= words.length && alive.current; count++) {
        patch(replyId, { text: words.slice(0, count).join(' '), full: reply.text, shown: count, pending: false, streaming: true });
        if (!calm) await sleep(26);
      }
      // The last words finish fading in before the answer settles.
      if (!calm) await sleep(320);
      patch(replyId, { text: reply.text, pending: false, streaming: false, card: reply.card, targets: reply.targets, opened: reply.go, error: reply.error, kind: reply.kind, action: reply.action });
      if (reply.go && alive.current) go(reply.go, reply.text);
    } catch {
      // Never left on the dots: say it went wrong, so the question can be asked again.
      patch(replyId, { text: 'Something went wrong on my side. Try asking that again.', pending: false, streaming: false, slow: false, error: true, kind: 'error' });
    } finally {
      clearTimeout(slowTimer);
      if (alive.current) setBusy(false);
    }
  };

  // A link can open the guide with a question already asked:
  // /inspirations?buddy=<question>, as the landing page's Buddy section does.
  // The question is taken off the address once read, so a reload doesn't ask it again.
  const askedFromLink = useRef(false);
  useEffect(() => {
    if (askedFromLink.current) return;
    const url = new URL(window.location.href);
    const asked = url.searchParams.get(BUDDY_PARAM)?.trim();
    if (!asked) return;
    askedFromLink.current = true;
    url.searchParams.delete(BUDDY_PARAM);
    window.history.replaceState(window.history.state, '', url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address on mount
    openGuide();
    void send(asked);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  const choose = (target: NavTarget) => {
    if (target.ask === '__confirm__' && latest) return void confirmAction(latest);
    if (target.ask === '__decline__' && latest) return declineAction(latest);
    return target.ask ? void send(target.ask) : go(target);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(question);
  };

  const resetConversation = () => {
    chatId.current = null;
    lastApp.current = null;
    lastResults.current = null;
    nextId.current = 1;
    setLines([]);
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
    lastApp.current = null;
    setLines(chat.lines);
    setView('chat');
    // "it" and "its" in the next question mean the app that chat was last about.
    if (chat.appId) {
      void inspirationsApi
        .listApps()
        .then((apps) => {
          const app = apps.find((candidate) => candidate.id === chat.appId);
          if (app && chatId.current === chat.id) lastApp.current = app;
        })
        .catch(() => undefined);
    }
  };

  const deleteChat = (id: string) => {
    const next = removeChat(history, id);
    setHistory(next);
    writeHistory(next);
    if (chatId.current === id) resetConversation();
    show('Chat deleted');
  };

  // Every past chat at once, so it asks first.
  const clearHistory = () => {
    void askConfirm({
      title: 'Clear chat history?',
      description: 'Every past chat with the guide will be removed. This can’t be undone.',
      confirmLabel: 'Clear history',
    }).then((ok) => {
      if (!ok) return;
      setHistory([]);
      writeHistory([]);
      resetConversation();
      show('Chat history cleared');
    });
  };

  const copy = async (line: Line) => {
    try {
      // Plain spaces, not the no-break ones that keep "I can" on a line.
      await navigator.clipboard.writeText(line.text.replace(/\u00a0/g, ' '));
      setCopiedId(line.id);
      setTimeout(() => setCopiedId((current) => (current === line.id ? null : current)), 1200);
      show('Copied');
    } catch {
      show('Couldn’t copy that', { tone: 'error' });
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

  /** Answers the same question again, in the reply's place (back to "Thinking…", then the new reply). */
  const regenerate = async (line: Line) => {
    const asked = questionFor(line);
    if (!asked || busy) return;
    setBusy(true);
    patch(line.id, { text: '', pending: true, streaming: false, slow: false, error: false, full: undefined, shown: undefined, card: undefined, targets: undefined, opened: undefined, kind: undefined, action: undefined });
    await answer(asked, line.id);
  };

  /** ↑ in an empty composer brings back the last thing the visitor typed, to fix or resend. */
  const onComposerKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter starts a new line (and Enter while an IME is composing is left alone).
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


  // The suggestion row above the composer follows the conversation: the places
  // to go at first, then whatever the latest answer offers next. While a reply
  // is still being written, the last settled answer's suggestions stay put.
  const settled = busy ? lines.slice(0, -2) : lines;
  const latest = [...settled].reverse().find((line) => line.role === 'assistant' && !line.pending);
  const pendingAction = latest?.action;
  const suggestions = pendingAction
    ? [
        { label: 'Yes, copy the link', hint: 'Confirm', href: '', ask: '__confirm__' },
        { label: 'Not now', hint: 'Dismiss', href: '', ask: '__decline__' },
      ]
    : latest?.targets && latest.targets.length > 0
      ? latest.targets
      : QUICK_PAGES;
  const suggestKey = latest?.id ?? 0;

  // Arrows show only when there is more of the row off to that side.
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
  }, [suggestKey, open]);

  const scrollSuggest = (direction: -1 | 1) => suggestRef.current?.scrollBy({ left: direction * 220, behavior: reducedMotion() ? 'auto' : 'smooth' });

  // A mouse wheel only scrolls vertically; let it move the one-line row too.
  const onSuggestWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
  };

  // While the guide is a modal, Tab stays inside it instead of wandering into the dimmed page.
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !dimmed) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]')].filter((item) => item.offsetParent !== null);
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
      <>
        {nudge && (
          <div key={nudge.key} className={`ins-guide-nudge ${alongsideAdmin ? 'is-beside-admin' : ''}`} role="status">
            <button type="button" className="ins-guide-nudge-text" onClick={openGuide}>
              {nudge.text}
            </button>
            <button
              type="button"
              className="ins-guide-nudge-close"
              onClick={() => {
                setNudge(null);
                writeNudgeState({ ...readNudgeState(), dismissed: true });
              }}
              aria-label="Dismiss"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        )}
        <button
          ref={pillRef}
          type="button"
          className={`ins-dock-pill ins-dock-user ${alongsideAdmin ? 'is-beside-admin' : ''} ${nudge ? 'is-calling' : ''}`}
          onClick={openGuide}
          aria-label="Open Motvin Buddy"
          title="Ask Motvin Buddy"
        >
          <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={33} height={33} />
        </button>
      </>
    );
  }

  const welcome = lines.length === 0;
  const inHistory = view === 'history';

  return (
    <>
      {dimmed && <div className="ins-guide-backdrop" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        ref={setPanel}
        className={`ins-guide ${dimmed ? '' : 'is-floating'} ${sheetClass}`}
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
                  <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={28} height={28} />
                </span>
                <strong>Motvin Buddy</strong>
              </span>
            )
          )}
          <div className="ins-guide-top-actions">
            {(inHistory || !welcome) && (
              <button type="button" className="ins-guide-newchat" onClick={clear} disabled={busy} title="Start a new conversation">
                <img src="/ASSET/Icons/Motvin/new-chat.svg" alt="" width={15} height={15} />
                New Chat
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
                    <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={30} height={30} />
                  </span>
                </div>
                <h3>No chats yet</h3>
                <p>Ask the guide for an app or a page and your conversation will be saved here, in this browser only.</p>
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
                            <button type="button" className="ins-guide-history-del" onClick={() => deleteChat(chat.id)} aria-label={`Delete “${chat.title}”`} title="Delete this chat">
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
              <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={38} height={38} />
            </span>
            <p className="ins-guide-hi">
              {greetingFor(hour, displayName)}{' '}
              <span className="ins-guide-wave" aria-hidden>
                👋
              </span>
            </p>
            <h2 className="ins-guide-title">Where would you like to go?</h2>
            <p className="ins-guide-sub">Open any app or page, or ask a quick question like how many screens an app has.</p>
            {examples.length > 0 && (
              <div className="ins-guide-examples">
                <span className="ins-guide-examples-label">Try asking</span>
                {examples.map((text) => (
                  <button key={text} type="button" className="ins-guide-example" onClick={() => void send(text)} disabled={busy}>
                    <span>{text}</span>
                    <span className="ins-chip-ai" aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div ref={bodyRef} className="ins-guide-thread" role="log" aria-live="polite" aria-busy={busy} onScroll={onThreadScroll} onWheel={leaveBottom} onTouchMove={leaveBottom}>
            {lines.map((line) => (
              <div key={line.id} className="ins-chat">
                <div className={`ins-chat-msg ins-chat-msg--${line.role} ${line.pending ? 'is-typing' : ''} ${line.error ? 'is-error' : ''} ${line.id === freshId ? 'is-fresh' : ''}`}>
                  {line.role === 'user' ? (
                    <span>{line.text}</span>
                  ) : line.pending ? (
                    <ThinkingStatus slow={line.slow} />
                  ) : line.streaming && line.full ? (
                    // Each word fades in out of a blur as it arrives, as an AI answer
                    // streams. The whole answer is laid out from the start (the words to
                    // come unseen), so the bubble opens at its size rather than growing.
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
                  {line.opened && (
                    <button type="button" className="ins-guide-file" onClick={() => go(line.opened as NavTarget)} title="Open again">
                      {line.opened.iconSrc ? <img src={line.opened.iconSrc} alt="" width={20} height={20} /> : null}
                      <span>{line.opened.label}</span>
                      <ExternalIcon size={15} />
                    </button>
                  )}
                  {line.card?.rows && line.card.columns && <CompareCard card={line.card} open={(app) => app.href && go({ label: app.name, hint: 'App', href: app.href })} />}
                  {line.card &&
                    !line.card.rows &&
                    (() => {
                      const card = line.card;
                      const body = (
                        <>
                          {card.iconSrc && <img src={card.iconSrc} alt="" width={36} height={36} />}
                          <div>
                            <strong>{card.title}</strong>
                            <span>{card.facts.join(' · ')}</span>
                          </div>
                          {card.href && <ExternalIcon size={15} />}
                        </>
                      );
                      return card.href ? (
                        <button type="button" className="ins-guide-card is-link" onClick={() => go({ label: card.title, hint: 'App', href: card.href as string })} title={`Open ${card.title}`}>
                          {body}
                        </button>
                      ) : (
                        <div className="ins-guide-card">{body}</div>
                      );
                    })()}
                </div>
                {/* Every finished reply can be copied, or answered again. */}
                {line.role === 'assistant' && !line.pending && !line.streaming && (
                  <div className="ins-guide-tools is-assistant" role="toolbar" aria-label="Answer actions">
                    <button type="button" onClick={() => void copy(line)} aria-label="Copy this answer" title="Copy">
                      {copiedId === line.id ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                    </button>
                    <button type="button" onClick={() => void regenerate(line)} disabled={busy || !questionFor(line)} aria-label="Regenerate this answer" title="Regenerate">
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
            <button type="button" className="ins-guide-suggest-arrow is-left" onClick={() => scrollSuggest(-1)} aria-label="Earlier suggestions">
              <ChevronLeftIcon size={16} />
            </button>
          )}
          <div
            ref={suggestRef}
            className={`ins-guide-suggest ${canLeft ? 'fade-left' : ''} ${canRight ? 'fade-right' : ''}`}
            role="toolbar"
            aria-label="Suggestions"
            onWheel={onSuggestWheel}
            onScroll={updateArrows}
          >
            {suggestions.map((target, index) => (
              <button
                key={`${suggestKey}-${target.href || target.label}`}
                type="button"
                className="ins-chip-btn"
                style={{ '--i': index } as CSSProperties}
                onClick={() => choose(target)}
                title={target.hint}
                disabled={busy}
              >
                <span className="ins-chip-icon" aria-hidden>
                  {chipIcon(target)}
                </span>
                {target.label}
              </button>
            ))}
          </div>
          {canRight && (
            <button type="button" className="ins-guide-suggest-arrow is-right" onClick={() => scrollSuggest(1)} aria-label="More suggestions">
              <ChevronRightIcon size={16} />
            </button>
          )}
        </div>

        <form className={`ins-guide-composer ${busy ? 'is-working' : ''}`} onSubmit={submit}>
          <textarea ref={inputRef} rows={1} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={onComposerKey} placeholder="Ask for an app or a page…" aria-label="Ask where to go" />
          <div className="ins-guide-composer-bar">
            <button type="button" className="ins-guide-esc" onClick={() => setOpen(false)} title="Close Motvin Buddy">
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
    </>
  );
}
