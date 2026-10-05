'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { isAdminEmail } from '@/lib/inspirations/admin';
import { QUICK_PAGES, resolveNavigation, type NavCard, type NavTarget } from '@/lib/inspirations/navAssistant';
import type { App } from '@/lib/inspirations/types';
import { ArrowRightIcon, MinusIcon, TrashIcon } from './Icons';

type Line = { id: number; role: 'user' | 'assistant'; text: string; targets?: NavTarget[]; card?: NavCard; pending?: boolean };

const GREETING: Line = { id: 0, role: 'assistant', text: 'Hi, I can take you anywhere in Motvin. Tell me an app or a page — “open Swiggy”, “show flows” — or pick one below.', targets: QUICK_PAGES };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function UserDock() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const alongsideAdmin = ready && Boolean(user && !user.isAnonymous && isAdminEmail(user.email));
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([GREETING]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
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
    if (open) inputRef.current?.focus();
  }, [open]);

  const patch = (id: number, change: Partial<Line>) => setLines((all) => all.map((line) => (line.id === id ? { ...line, ...change } : line)));

  const go = (target: NavTarget) => {
    router.push(target.href);
    if (window.matchMedia('(max-width: 640px)').matches) setOpen(false);
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
      patch(replyId, { text: reply.text, pending: false, card: reply.card, targets: reply.targets });
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
    setLines([GREETING]);
  };

  const className = `ins-dock-user ${alongsideAdmin ? 'is-beside-admin' : ''}`;

  if (!open) {
    return (
      <button type="button" className={`ins-dock-pill ${className}`} onClick={() => setOpen(true)} aria-label="Open the guide" title="Ask Motvin to take you somewhere">
        <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={33} height={33} />
      </button>
    );
  }

  return (
    <aside className={`ins-dock ${className}`} role="complementary" aria-label="Motvin guide">
      <header className="ins-dock-head">
        <span className="ins-dock-avatar" aria-hidden>
          <img src="/ASSET/Icons/Motvin/bot-Illustration.svg" alt="" width={24} height={24} />
        </span>
        <div className="ins-dock-title">
          <strong>Motvin guide</strong>
          <span className="ins-dock-ai">Takes you around the app</span>
        </div>
        {lines.length > 1 && (
          <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={clear} aria-label="Clear the conversation" title="Clear the conversation">
            <TrashIcon size={15} />
          </button>
        )}
        <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={() => setOpen(false)} aria-label="Minimise" title="Minimise">
          <MinusIcon size={15} />
        </button>
      </header>

      <div ref={bodyRef} className="ins-dock-body" role="log" aria-live="polite">
        {lines.map((line) => (
          <div key={line.id} className="ins-chat">
            <div className={`ins-chat-msg ins-chat-msg--${line.role}`}>
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
          </div>
        ))}
      </div>

      <form className="ins-dock-composer" onSubmit={submit}>
        <input className="ins-dock-input" ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Where do you want to go?" aria-label="Ask where to go" maxLength={200} />
        <button type="submit" className="ins-dock-send" disabled={!question.trim() || busy} aria-label="Go">
          <ArrowRightIcon size={20} />
        </button>
      </form>
    </aside>
  );
}
