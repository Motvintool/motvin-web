'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckIcon } from './Icons';

/**
 * Small confirmation toasts ("Saved", "Copied") — bottom-centre, one line,
 * auto-dismiss. Kept deliberately quiet: the gallery is the focus.
 */

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void } };

type ToastContextValue = {
  show: (message: string, action?: Toast['action']) => void;
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

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, action?: Toast['action']) => {
      const id = ++counter.current;
      setToasts((list) => [...list.slice(-2), { id, message, action }]);
      window.setTimeout(() => dismiss(id), action ? 4200 : 2200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ins-toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="ins-toast">
            <CheckIcon size={14} />
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="ins-toast-action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
