'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type WheelEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { isAdminEmail } from '@/lib/inspirations/admin';
import { inspirationsApi } from '@/lib/inspirations/api';
import { greetingFor } from '@/lib/inspirations/guide-chatbot/guideGreeting';
import { nextNudge, nudgeMessages, readNudgeState, writeNudgeState } from '@/lib/inspirations/guide-chatbot/guideNudge';
import { groupChats, newChatId, previewOf, readHistory, relativeTime, removeChat, upsertChat, writeHistory, type SavedChat, type SavedLine } from '@/lib/inspirations/guide-chatbot/guideHistory';
import { exportLog, readLog, recordFeedback, recordMiss, type Verdict } from '@/lib/inspirations/guide-chatbot/guideTelemetry';
import { QUICK_PAGES, resolveNavigation, type GuideAction, type NavCard, type NavTarget, type ReplyKind } from '@/lib/inspirations/guide-chatbot/navAssistant';
import { libraryStore } from '@/lib/inspirations/store';
import type { App } from '@/lib/inspirations/types';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  ExternalIcon,
  PencilIcon,
  RetryIcon,
  SearchIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  TrashIcon,
} from './Icons';

type Line = { id: number; role: 'user' | 'assistant'; text: string; targets?: NavTarget[]; card?: NavCard; opened?: NavTarget; pending?: boolean; slow?: boolean; error?: boolean; kind?: ReplyKind; action?: GuideAction; verdict?: Verdict };

/** Where the guide files what a visitor asks to keep. */
const GUIDE_COLLECTION = 'Saved from the guide';

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function UserChatbot() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const signedIn = ready && Boolean(user && !user.isAnonymous);
  const alongsideAdmin = signedIn && isAdminEmail(user?.email);
  const displayName = signedIn ? user?.displayName : null;
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // The page behind is dimmed while the guide is a modal, and un-dimmed once it
  // has taken the visitor somewhere, so they can see where they landed.
  const [dimmed, setDimmed] = useState(true);
  const [nudge, setNudge] = useState<{ text: string; key: number } | null>(null);
  const topAppName = useRef<string | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  // Past conversations, kept in this browser, and which screen the panel shows.
  const [history, setHistory] = useState<SavedChat[]>([]);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [now, setNow] = useState(0);
  // The welcome screen: a time-of-day greeting and example questions drawn from the real library.
  const [hour, setHour] = useState(12);
  const [examples, setExamples] = useState<string[]>([]);
  // The saved chat being continued.
  const chatId = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const nextId = useRef(1);
  const lastApp = useRef<App | null>(null);
  // What the last answer listed, so "the second one" has something to point at.
  const lastResults = useRef<NavTarget[] | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [lines, open, view]);

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
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // The most-browsed app's name, so one of the nudges can mention something real.
  useEffect(() => {
    void inspirationsApi
      .listApps()
      .then((apps) => {
        topAppName.current = [...apps].sort((a, b) => b.screenCount - a.screenCount)[0]?.name ?? null;
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
      const text = nextNudge(state, nudgeMessages(topAppName.current));
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
        const top = [...apps].sort((a, b) => b.screenCount - a.screenCount).slice(0, 2);
        if (top.length === 0) return;
        const [first, second] = top;
        setExamples([`Open ${first.name}`, `Which app has the most flows?`, ...(second ? [`Compare ${first.name} and ${second.name}`] : [`How many screens does ${first.name} have?`])]);
      })
      .catch(() => undefined);
    setOpen(true);
  };

  const go = (target: NavTarget) => {
    if (target.href === '__back__') router.back();
    else router.push(target.href);
    setDimmed(false);
    if (window.matchMedia('(max-width: 900px)').matches) setOpen(false);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setQuestion('');
    setBusy(true);
    if (!chatId.current) {
      chatId.current = newChatId();
    }
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setLines((all) => [...all, { id: userId, role: 'user', text }, { id: replyId, role: 'assistant', text: '', pending: true }]);
    // A reply that is quick needs only the dots; one that drags says what it is doing.
    const slowTimer = setTimeout(() => patch(replyId, { slow: true }), SLOW_AFTER_MS);
    try {
      const reply = await resolveNavigation(text, { app: lastApp.current, results: lastResults.current, page: { pathname, search: typeof window !== 'undefined' ? window.location.search : '' } });
      if (reply.app) {
        lastApp.current = reply.app;
        // A list belongs to the answer that made it; one about a single app ends it.
        lastResults.current = reply.results ?? null;
      } else if (reply.results) lastResults.current = reply.results;
      if (reply.kind === 'fallback' || reply.kind === 'clarify' || reply.kind === 'error') recordMiss(text, reply.kind, reply.text);
      const calm = reducedMotion();
      if (!calm) await sleep(320 + Math.random() * 280);
      const words = reply.text.split(' ');
      for (let count = 1; count <= words.length && alive.current; count++) {
        patch(replyId, { text: words.slice(0, count).join(' '), pending: false });
        if (!calm) await sleep(26);
      }
      patch(replyId, { text: reply.text, pending: false, card: reply.card, targets: reply.targets, opened: reply.go, error: reply.error, kind: reply.kind, action: reply.action });
      if (reply.go && alive.current) go(reply.go);
    } finally {
      clearTimeout(slowTimer);
      if (alive.current) setBusy(false);
    }
  };

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
  };

  const clearHistory = () => {
    setHistory([]);
    writeHistory([]);
    resetConversation();
  };

  const copy = async (line: Line) => {
    try {
      await navigator.clipboard.writeText(line.text);
      setCopiedId(line.id);
      setTimeout(() => setCopiedId((current) => (current === line.id ? null : current)), 1200);
    } catch {
      // Clipboard blocked — nothing to confirm.
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

  const rate = (line: Line, verdict: Verdict) => {
    recordFeedback(questionFor(line), line.text, verdict);
    patch(line.id, { verdict });
  };

  /** ↑ in an empty composer brings back the last thing the visitor typed, to fix or resend. */
  const onComposerKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' || question.trim()) return;
    const last = [...lines].reverse().find((line) => line.role === 'user');
    if (!last) return;
    event.preventDefault();
    setQuestion(last.text);
  };

  const say = (text: string, extra: Partial<Line> = {}) => setLines((all) => [...all, { id: nextId.current++, role: 'assistant', text, kind: 'answer', ...extra }]);

  /** The visitor said yes to a save or a copy. Each is small and reversible. */
  const confirmAction = async (line: Line) => {
    const action = line.action;
    if (!action) return;
    patch(line.id, { action: undefined });
    if (action.kind === 'copy') {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${action.href}`);
        say(`Copied the link to ${action.label}.`);
      } catch {
        say(`I couldn’t reach the clipboard. Here’s the link to copy: ${window.location.origin}${action.href}`);
      }
      return;
    }
    const collection = libraryStore.getOrCreateCollectionByName(GUIDE_COLLECTION);
    const added = libraryStore.addToCollection(collection.id, action.item);
    say(added ? `Saved ${action.label} to “${collection.name}”.` : `${action.label} is already in “${collection.name}”.`, { targets: [{ label: 'Open collections', hint: 'Page', href: QUICK_PAGES[5].href }] });
  };

  const declineAction = (line: Line) => {
    patch(line.id, { action: undefined });
    say('No problem.');
  };

  const exportFeedback = () => {
    const report = exportLog(readLog());
    const blob = new Blob([report], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `motvin-guide-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // The suggestion row above the composer follows the conversation: the places
  // to go at first, then whatever the latest answer offers next. While a reply
  // is still being written, the last settled answer's suggestions stay put.
  const settled = busy ? lines.slice(0, -2) : lines;
  const latest = [...settled].reverse().find((line) => line.role === 'assistant' && !line.pending);
  const pendingAction = latest?.action;
  const suggestions = pendingAction
    ? [
        { label: pendingAction.kind === 'copy' ? 'Yes, copy the link' : 'Yes, save it', hint: 'Confirm', href: '', ask: '__confirm__' },
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
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')].filter((item) => item.offsetParent !== null);
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
          aria-label="Open the guide"
          title="Ask Motvin to take you somewhere"
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
      <aside className={`ins-guide ${dimmed ? '' : 'is-floating'}`} role="dialog" aria-modal={dimmed || undefined} aria-label="Motvin guide" onKeyDown={keepFocusInside}>
        <div className="ins-guide-top">
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
                <strong>Motvin Guide</strong>
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
                          <button type="button" className="ins-guide-link" onClick={exportFeedback} title="Download what the guide could not answer, and your thumbs up and down, as a file">
                            <DownloadIcon size={13} /> Export feedback
                          </button>
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
                              <TrashIcon size={15} />
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
          <div ref={bodyRef} className="ins-guide-thread" role="log" aria-live="polite">
            {lines.map((line) => (
              <div key={line.id} className="ins-chat">
                <div className={`ins-chat-msg ins-chat-msg--${line.role} ${line.pending ? 'is-typing' : ''} ${line.error ? 'is-error' : ''}`}>
                  {line.role === 'user' ? (
                    <span>{line.text}</span>
                  ) : line.pending ? (
                    <>
                      <span className="ins-typing" aria-label="Typing">
                        <i />
                        <i />
                        <i />
                      </span>
                      {line.slow && <span className="ins-guide-slow">Looking that up…</span>}
                    </>
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
                  {line.card?.rows && line.card.columns && (
                    <div className="ins-guide-compare" role="table" aria-label={line.card.title}>
                      <div className="ins-guide-compare-row is-head" role="row">
                        <span role="columnheader" />
                        {line.card.columns.map((column) => (
                          <span key={column} role="columnheader">
                            {column}
                          </span>
                        ))}
                      </div>
                      {line.card.rows.map((row) => (
                        <div key={row.label} className="ins-guide-compare-row" role="row">
                          <span role="rowheader">{row.label}</span>
                          {row.values.map((value, index) => (
                            <span key={`${row.label}-${index}`} role="cell">
                              {value}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
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
                {line.role === 'assistant' && !line.pending && line.kind !== 'smalltalk' && (
                  <div className={`ins-guide-tools is-assistant ${line.verdict ? 'is-rated' : ''}`} role="toolbar" aria-label="Was this helpful?">
                    <button type="button" onClick={() => rate(line, 'up')} aria-label="Helpful" aria-pressed={line.verdict === 'up'} title="Helpful">
                      <ThumbUpIcon size={15} filled={line.verdict === 'up'} />
                    </button>
                    <button type="button" onClick={() => rate(line, 'down')} aria-label="Not helpful" aria-pressed={line.verdict === 'down'} title="Not helpful">
                      <ThumbDownIcon size={15} filled={line.verdict === 'down'} />
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

        <form className="ins-guide-composer" onSubmit={submit}>
          <input ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={onComposerKey} placeholder="Ask for an app or a page…" aria-label="Ask where to go" maxLength={200} />
          <div className="ins-guide-composer-bar">
            <button type="button" className="ins-guide-esc" onClick={() => setOpen(false)} title="Close the guide">
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
