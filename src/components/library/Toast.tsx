'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Transient confirmations — port of toast() in motvin-ui/JS/motvin-icons.js.
 *
 * Copy-flavoured messages go through the stacked toast (up to 3 stacked
 * cards, matching motvin-ui/COMPONENT/Stack Toast.js) via
 * `window.StackToast.show()`. Every other message stays with the plain
 * `#toast` element — one message at a time, replaced on the next call.
 */

const TOAST_DURATION_MS = 2000;

/**
 * Message aliases used by the reference (motvin-icons.js:602-609) — long
 * variants collapse to the short "X copied" that fits the stack card.
 */
const STACK_TOAST_ALIASES: Record<string, string> = {
  'Copied SVG': 'SVG copied',
  'Copied PNG image': 'PNG copied',
  'Share link copied': 'Link copied',
};

/**
 * Messages routed through the stack toast. Reference (motvin-icons.js:601)
 * catches `/copied/i` in `toast()`, and downloads call `StackToast.show`
 * directly (lines 1766/1788/2619/2660), so both flavours pile up as stacks.
 */
const STACK_TOAST_PATTERN = /copied|downloaded/i;

declare global {
  interface Window {
    StackToast?: { show: (message?: string) => void; mount?: () => HTMLElement };
  }
}

type ToastContextValue = {
  message: string | null;
  show: (text: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    // Route copy confirmations through the stack toast so repeated copies
    // pile up (matching the reference at motvin-icons.js:601-611). The
    // controller is loaded by <StackToastRuntime>; if it hasn't attached
    // yet we fall through to the plain toast so the user still sees the
    // confirmation.
    if (STACK_TOAST_PATTERN.test(text) && typeof window !== 'undefined') {
      const stack = window.StackToast;
      if (stack?.show) {
        stack.show(STACK_TOAST_ALIASES[text] || text);
        return;
      }
    }
    setMessage(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const value = useMemo(() => ({ message, show }), [message, show]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function Toast() {
  const { message } = useToast();
  return (
    <div className={`mi-toast${message ? ' is-visible' : ''}`} id="toast" role="status">
      {message}
    </div>
  );
}
