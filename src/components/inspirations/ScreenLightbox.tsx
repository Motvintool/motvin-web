'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { isDesktopPlatform, type App, type Screen } from '@/lib/inspirations/types';
import { focusOnOpen } from '@/lib/inspirations/focusOnOpen';
import { CloseIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { useScreenContextMenu } from './useScreenContextMenu';
import { screenTitle } from '@/lib/inspirations/screenNaming';

/**
 * Full-screen enlarged view of a single screenshot, opened from the "expand"
 * button on the screen detail page's own hero image (and from clicking a
 * shot inside ScreenPreviewModal).
 *
 * Same overlay conventions as FlowPreview.tsx (portal, backdrop, Escape,
 * focus trap, body scroll lock) minus the step/filmstrip machinery — there's
 * one image here, not a sequence, so there's nothing to page between.
 *
 * Zoom is a plain click toggle to a fixed 125%, not a variable +/- control —
 * there's only one screenshot to look at, so "how much bigger" doesn't need
 * to be a decision. Growing the frame itself (rather than a CSS `transform:
 * scale()` on its content) keeps its corner radius a literal, constant 92px
 * at either size instead of visually stretching with it; panning around a
 * zoomed shot that no longer fits the viewport is then just the overlay's
 * own native scroll, not a custom drag.
 */

/** The mounted flag never changes after hydration, so nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

export function ScreenLightbox({
  screen,
  app,
  link,
  startAt,
  onClose,
}: {
  screen: Screen;
  app: App | null | undefined;
  /** The screen's own link, for the menu's Copy link. */
  link: () => string;
  /** For a website page: the spot clicked on it in the preview, kept at the same height in the window. */
  startAt?: { part: number; y: number };
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Right-click in the enlarged view: the same menu as everywhere else (Copy PNG, Download PNG with the
  // watermark, Copy link), in place of the browser's own "Save image as…", which would hand over the bare image.
  const shotMenu = useScreenContextMenu(screen, app, link);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [zoomed, setZoomed] = useState(false);

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
    focusOnOpen(closeRef.current);
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  // Open a tall page where it was clicked: that spot of the page under the same point of the window.
  const placed = useRef(false);
  const place = () => {
    const box = overlayRef.current;
    const img = box?.querySelector('.ins-lightbox-shot img');
    if (!startAt || placed.current || !box || !(img instanceof HTMLImageElement) || !img.complete || !img.clientHeight) return;
    placed.current = true;
    const top = img.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, top + startAt.part * img.clientHeight - startAt.y);
  };
  useEffect(() => {
    if (mounted) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    // Right-click anywhere in it (the screenshot or the dark space around): the menu below, never the browser's.
    <div ref={overlayRef} className="ins-portal ins-lightbox" role="presentation" onContextMenu={shotMenu.onContextMenu} onLoadCapture={place}>
      <div className="ins-lightbox-backdrop" onClick={onClose} />
      <div className="ins-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`${screenTitle(screen)} — enlarged`}>
        <button ref={closeRef} type="button" className="ins-lightbox-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        <div
          // A website page is far taller than the window: shown at width, to scroll top to bottom.
          className={`ins-lightbox-shot ${isDesktopPlatform(screen.platform) ? 'ins-lightbox-shot--web' : ''} ${screen.site?.kind === 'page' ? 'ins-lightbox-shot--site' : ''} ${zoomed ? 'is-zoomed' : ''}`}
          onClick={() => setZoomed((z) => !z)}
          title={zoomed ? 'Click to zoom out' : 'Click to zoom in'}
        >
          <Screenshot screen={screen} priority />
        </div>
      </div>
      {shotMenu.menu}
    </div>,
    document.body,
  );
}
