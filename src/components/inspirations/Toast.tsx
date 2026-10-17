'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Small confirmation toasts ("Saved", "Copied") — bottom-centre, one line,
 * auto-dismiss. Kept deliberately quiet: the gallery is the focus. Several
 * at once stack as a deck: the newest in front, older ones tucked behind it,
 * smaller, as frosted glass; each springs in, and out when it goes. The same
 * action again stacks a new one too. A failure shows a red mark rather than
 * the tick, and work still going ("Preparing…") a spinner. Hovering the deck
 * holds it, so there's time to read it or press its button.
 */

/** How long a toast takes to fade out before it's removed. */
const LEAVE_MS = 240;
/**
 * A spinner stays until what it waits on says how it went — a big zip can
 * take a minute — with this as the limit, so one never hangs forever.
 */
const PROGRESS_MAX_MS = 120_000;

type ToastAction = { label: string; onClick: () => void };
/** done: the tick; error: a red mark; progress: a spinner, for work still going. */
type ToastTone = 'done' | 'error' | 'progress';
type ToastOptions = { action?: ToastAction; tone?: ToastTone };

type Toast = { id: number; message: string; action?: ToastAction; tone: ToastTone; leaving?: boolean };

type ToastContextValue = {
  /** The second argument is the button to show, or `{ action, tone }`. */
  show: (message: string, options?: ToastAction | ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, number>());
  // Ids still showing (not fading out), oldest first.
  const showing = useRef<number[]>([]);
  const held = useRef(false);
  const progress = useRef(new Set<number>());

  // Nothing left ticking once the page goes.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // Fades it out, then takes it away.
  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    showing.current = showing.current.filter((s) => s !== id);
    progress.current.delete(id);
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      window.clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      if (!held.current) timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  // Held while the pointer is on the deck; let go, each goes in turn.
  const hold = useCallback(() => {
    held.current = true;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);
  const release = useCallback(() => {
    held.current = false;
    // A spinner keeps waiting for its result rather than going on a timer.
    [...showing.current]
      .reverse()
      .forEach((id, i) => schedule(id, progress.current.has(id) ? PROGRESS_MAX_MS : 1400 + i * 250));
  }, [schedule]);

  const show = useCallback(
    (message: string, options?: ToastAction | ToastOptions) => {
      const { action, tone = 'done' } = options && 'onClick' in options ? { action: options } : (options ?? {});
      const toast: Toast = { id: ++counter.current, message, action, tone };
      // Whatever was still "Preparing…" is done now: this one takes its place.
      [...progress.current].forEach((id) => dismiss(id));
      if (tone === 'progress') progress.current.add(toast.id);
      setToasts((list) => [...list, toast]);
      showing.current = [...showing.current, toast.id];
      schedule(toast.id, action ? 4200 : tone === 'progress' ? PROGRESS_MAX_MS : tone === 'error' ? 3000 : 2200);
      // Three at most: the oldest still showing makes way.
      if (showing.current.length > 3) dismiss(showing.current[0]);
    },
    [dismiss, schedule],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="ins-float-collection ins-toast-host ins-toast-deck"
        role="status"
        aria-live="polite"
        style={{ zIndex: 10000 }}
        onPointerEnter={hold}
        onPointerLeave={release}
      >
        {toasts.map((t) => {
          // 0 is the one in front; leaving ones don't push the others back.
          const depth = toasts.filter((o) => o.id > t.id && !o.leaving).length;
          return (
          <div
            key={t.id}
            className={`ins-float-collection-success ins-toast-card is-${t.tone} ${t.leaving ? 'is-leaving' : ''}`}
            data-depth={Math.min(depth, 3)}
            aria-hidden={depth > 0 || undefined}
          >
            <span className="ins-float-collection-success-check" aria-hidden>
              <span />
            </span>
            <span className="ins-toast-text">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="ins-toast-action"
                style={{ marginLeft: '12px' }}
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
