'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { isAdminEmail } from '@/lib/inspirations/admin';
import { QUICK_PAGES, resolveNavigation, type NavCard, type NavTarget } from '@/lib/inspirations/navAssistant';
import type { App } from '@/lib/inspirations/types';
import { ArrowRightIcon, BookmarkIcon, CheckIcon, CloseIcon, CopyIcon, ExternalIcon, FlowIcon, GridIcon, ImageIcon, LayersIcon, PencilIcon, RetryIcon, SearchIcon, SparklesIcon, TrashIcon } from './Icons';

type Line = { id: number; role: 'user' | 'assistant'; text: string; targets?: NavTarget[]; card?: NavCard; opened?: NavTarget; pending?: boolean };

const CHIP_ICON: Record<string, { icon: ReactNode; color: string }> = {
  Apps: { icon: <GridIcon size={16} />, color: '#2563eb' },
  Screens: { icon: <ImageIcon size={16} />, color: '#16a34a' },
  Flows: { icon: <FlowIcon size={16} />, color: '#7c3aed' },
  'UI elements': { icon: <LayersIcon size={16} />, color: '#ea580c' },
  Patterns: { icon: <SparklesIcon size={16} />, color: '#db2777' },
  Collections: { icon: <BookmarkIcon size={16} />, color: '#0891b2' },
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function UserDock() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const signedIn = ready && Boolean(user && !user.isAnonymous);
  const alongsideAdmin = signedIn && isAdminEmail(user?.email);
  const firstName = signedIn ? user?.displayName?.trim().split(/\s+/)[0] : '';
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const lastApp = useRef<App | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [lines, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const patch = (id: number, change: Partial<Line>) => setLines((all) => all.map((line) => (line.id === id ? { ...line, ...change } : line)));

  const go = (target: NavTarget) => {
    router.push(target.href);
    if (window.matchMedia('(max-width: 900px)').matches) setOpen(false);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setQuestion('');
    setBusy(true);
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setLines((all) => [...all, { id: userId, role: 'user', text }, { id: replyId, role: 'assistant', text: '', pending: true }]);
    try {
      const reply = await resolveNavigation(text, { app: lastApp.current });
      if (reply.app) lastApp.current = reply.app;
      const calm = reducedMotion();
      if (!calm) await sleep(320 + Math.random() * 280);
      const words = reply.text.split(' ');
      for (let count = 1; count <= words.length && alive.current; count++) {
        patch(replyId, { text: words.slice(0, count).join(' '), pending: false });
        if (!calm) await sleep(26);
      }
      patch(replyId, { text: reply.text, pending: false, card: reply.card, targets: reply.targets, opened: reply.go });
      if (reply.go && alive.current) go(reply.go);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const choose = (target: NavTarget) => (target.ask ? void send(target.ask) : go(target));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(question);
  };

  const clear = () => {
    lastApp.current = null;
    setLines([]);
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

  if (!open) {
    return (
      <button
        type="button"
        className={`ins-dock-pill ins-dock-user ${alongsideAdmin ? 'is-beside-admin' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open the guide"
        title="Ask Motvin to take you somewhere"
      >
        <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={33} height={33} />
      </button>
    );
  }

  const welcome = lines.length === 0;

  return (
    <>
      <div className="ins-guide-backdrop" onClick={() => setOpen(false)} aria-hidden />
      <aside className="ins-guide" role="dialog" aria-label="Motvin guide">
        <div className="ins-guide-top">
          {!welcome && (
            <span className="ins-guide-mark" aria-hidden>
              <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={22} height={22} />
            </span>
          )}
          <div className="ins-guide-top-actions">
            {!welcome && (
              <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={clear} aria-label="Clear the conversation" title="Clear the conversation">
                <TrashIcon size={16} />
              </button>
            )}
            <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={() => setOpen(false)} aria-label="Close" title="Close (Esc)">
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {welcome ? (
          <div className="ins-guide-welcome">
            <span className="ins-guide-avatar" aria-hidden>
              <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={38} height={38} />
            </span>
            <p className="ins-guide-hi">{firstName ? `Hi ${firstName},` : 'Hi there,'}</p>
            <h2 className="ins-guide-title">{signedIn ? 'Welcome back! How can I help?' : 'Welcome! How can I help?'}</h2>
            <p className="ins-guide-sub">I can take you to any app or page, and answer quick questions like how many screens an app has. Pick one below or just ask.</p>
            <div className="ins-guide-chips">
              {QUICK_PAGES.map((target) => {
                const style = CHIP_ICON[target.label];
                return (
                  <button key={target.href} type="button" className="ins-guide-chip" onClick={() => go(target)}>
                    {style && (
                      <span className="ins-guide-chip-icon" style={{ color: style.color }} aria-hidden>
                        {style.icon}
                      </span>
                    )}
                    {target.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div ref={bodyRef} className="ins-guide-thread" role="log" aria-live="polite">
            {lines.map((line) => (
              <div key={line.id} className="ins-chat">
                <div className={`ins-chat-msg ins-chat-msg--${line.role} ${line.pending ? 'is-typing' : ''}`}>
                  {line.role === 'user' ? (
                    <span>{line.text}</span>
                  ) : line.pending ? (
                    <span className="ins-typing" aria-label="Typing">
                      <i />
                      <i />
                      <i />
                    </span>
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
                  {line.card && (
                    <div className="ins-guide-card">
                      {line.card.iconSrc && <img src={line.card.iconSrc} alt="" width={36} height={36} />}
                      <div>
                        <strong>{line.card.title}</strong>
                        <span>{line.card.facts.join(' · ')}</span>
                      </div>
                    </div>
                  )}
                  {line.targets && line.targets.length > 0 && (
                    <div className="ins-chat-actions">
                      {line.targets.map((target) => (
                        <button key={target.href || target.label} type="button" className="ins-chip-btn" onClick={() => choose(target)} title={target.hint} disabled={busy}>
                          {target.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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

        <form className="ins-guide-composer" onSubmit={submit}>
          <div className="ins-guide-composer-row">
            <SearchIcon size={18} />
            <input ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask me anything about Motvin…" aria-label="Ask where to go" maxLength={200} />
            <button type="submit" className="ins-guide-send" disabled={!question.trim() || busy} aria-label="Send">
              <ArrowRightIcon size={18} />
            </button>
          </div>
          <div className="ins-guide-composer-foot">
            <span>Motvin guide · navigation only</span>
            <span>Esc to close</span>
          </div>
        </form>
      </aside>
    </>
  );
}
