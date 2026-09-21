'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Screen } from '@/lib/inspirations/types';
import { CloseIcon } from './Icons';
import { Screenshot } from './Screenshot';

/**
 * Full-screen enlarged view of a single screenshot, opened from the "expand"
 * button on the screen detail page's own hero image.
 *
 * Same overlay conventions as FlowPreview.tsx (portal, backdrop, Escape,
 * focus trap, body scroll lock) minus the step/filmstrip machinery — there's
 * one image here, not a sequence, so there's nothing to page between.
 */

/** The mounted flag never changes after hydration, so nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

export function ScreenLightbox({ screen, onClose }: { screen: Screen; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Portals need a document, so the overlay renders on the client only.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="ins-portal ins-lightbox" role="presentation">
      <div className="ins-lightbox-backdrop" onClick={onClose} />
      <div className="ins-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`${screen.name} — enlarged`}>
        <button ref={closeRef} type="button" className="ins-lightbox-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        <div className="ins-lightbox-shot">
          <Screenshot screen={screen} priority />
        </div>
      </div>
    </div>,
    document.body,
  );
}
