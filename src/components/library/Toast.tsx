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
 * One message at a time, as the original had; a new message replaces the
 * current one and restarts the timer rather than queueing behind it.
 *
 * Exposed through context so the toast element can render at body level
 * (matching the legacy DOM) while any component under LibraryView can call
 * `useToast().show(...)`.
 */

const TOAST_DURATION_MS = 2000;

type ToastContextValue = {
  message: string | null;
  show: (text: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
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
