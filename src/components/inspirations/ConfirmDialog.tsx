'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';
import { useSheet } from './useSheet';

/** What to ask: a short question, an optional line under it, and the confirm button's word. */
export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
};

const CONFIRM_EVENT = 'motvin:confirm';
type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * Asks before something is removed, in the Motvin look rather than the
 * browser's own confirm box: resolves true on the confirm button (or Enter),
 * false on Cancel, the ×, the backdrop or Escape. Needs ConfirmHost on the
 * page (InspirationsShell mounts it); without one it answers false.
 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const request: ConfirmRequest = { ...options, resolve };
    const handled = !window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: request, cancelable: true }));
    if (!handled) resolve(false);
  });
}

/**
 * The confirm box itself: a frosted backdrop and a white card with the
 * question and what it does on the left, the modals' floating × on its
 * corner, and Cancel (an
 * outlined pill) beside a soft red confirm at the bottom right. One at a
 * time; renders nothing until askConfirm is called.
 */
export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onAsk = (event: Event) => {
      event.preventDefault();
      const next = (event as CustomEvent<ConfirmRequest>).detail;
      setRequest((current) => {
        current?.resolve(false);
        return next;
      });
    };
    window.addEventListener(CONFIRM_EVENT, onAsk);
    return () => window.removeEventListener(CONFIRM_EVENT, onAsk);
  }, []);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        request.resolve(false);
        setRequest(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request]);

  // On a phone, a sheet: its top drags up to fill the screen, down to settle or close.
  const { ref: sheetRef, className: sheetClass, dragProps: sheetDrag, handle: sheetHandle } = useSheet(() => answer(false));
  if (!request) return null;

  return createPortal(
    <div className="ins-portal ins-search-overlay ins-confirm-overlay ins-sheet-overlay" onClick={() => answer(false)}>
      <div
        ref={sheetRef}
        className={`ins-search-modal ins-confirm ${sheetClass}`}
        {...sheetDrag}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ins-confirm-title"
        aria-describedby={request.description ? 'ins-confirm-desc' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {sheetHandle}
        {/* The modals' own floating close, on the card's corner. */}
        <button type="button" className="ins-request-close" aria-label="Close" onClick={() => answer(false)}>
          <CloseIcon size={18} />
        </button>
        <h2 id="ins-confirm-title" className="ins-confirm-title">
          {request.title}
        </h2>
        {request.description && (
          <p id="ins-confirm-desc" className="ins-confirm-desc">
            {request.description}
          </p>
        )}
        <div className="ins-confirm-buttons">
          <button type="button" className="ins-confirm-cancel" onClick={() => answer(false)}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className="ins-confirm-ok" onClick={() => answer(true)}>
            {request.confirmLabel ?? 'Remove'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
