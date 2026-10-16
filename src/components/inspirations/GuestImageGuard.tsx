'use client';

import { useEffect } from 'react';
import { notifyGuestBlocked, useDownloadGate, type GatedSubject } from './useDownloadGate';

/** The library's own images: screenshots and app logos, as the API serves them. */
const PROTECTED_IMAGE = /\/api\/inspirations\/(screens|logos)\//;

function protectedSubject(target: EventTarget | null): GatedSubject | null {
  if (!(target instanceof HTMLImageElement)) return null;
  const match = PROTECTED_IMAGE.exec(target.currentSrc || target.src);
  if (!match) return null;
  return match[1] === 'logos' ? 'logos' : 'screens';
}

/**
 * Closes the browser's own ways of taking a library image for guests, which
 * useDownloadGate can't see: the right-click menu's "Save image as…" / "Copy
 * image", dragging the image out, and (with the html.ins-guest styles)
 * iOS's long-press save. A guest's right-click on a screenshot or logo shows
 * the sign-in notice instead; one our own menus already answer (a screen
 * card's Copy / Download PNG, themselves gated) is left to them. Signed-in
 * accounts are untouched. Renders nothing.
 */
export function GuestImageGuard() {
  const { isGuest } = useDownloadGate();

  useEffect(() => {
    if (!isGuest) return;
    const root = document.documentElement;
    root.classList.add('ins-guest');

    // Bubble phase, after React's handlers: a custom menu that opened has
    // already called preventDefault, so only the browser's own is stopped.
    const onContextMenu = (e: MouseEvent) => {
      const subject = protectedSubject(e.target);
      if (!subject || e.defaultPrevented) return;
      e.preventDefault();
      notifyGuestBlocked('download', subject);
    };
    const onDragStart = (e: DragEvent) => {
      if (protectedSubject(e.target)) e.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('dragstart', onDragStart);
    return () => {
      root.classList.remove('ins-guest');
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('dragstart', onDragStart);
    };
  }, [isGuest]);

  return null;
}
