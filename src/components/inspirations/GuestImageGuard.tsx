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
 * Closes the browser's own ways of taking a library image, which
 * useDownloadGate can't see. For everyone: dragging a screenshot or logo out
 * of the page (onto the desktop, it would land without the watermark our
 * Copy / Download PNG add), and the browser's right-click menu on a
 * screenshot that has no menu of its own (a safety net: our menus, with the
 * watermark, answer nearly all of them). For guests also: the right-click menu's "Save
 * image as…" / "Copy image" and (with the html.ins-guest styles) iOS's
 * long-press save — a guest's right-click on a screenshot or logo shows the
 * sign-in notice instead; one our own menus already answer (a screen card's
 * Copy / Download PNG, themselves gated) is left to them. Renders nothing.
 */
export function GuestImageGuard() {
  const { isGuest } = useDownloadGate();

  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      if (protectedSubject(e.target)) e.preventDefault();
    };
    document.addEventListener('dragstart', onDragStart);
    return () => document.removeEventListener('dragstart', onDragStart);
  }, []);

  // Signed in: a screenshot our menus don't answer gets no browser menu either (guests get the notice below).
  useEffect(() => {
    if (isGuest) return;
    const onContextMenu = (e: MouseEvent) => {
      if (protectedSubject(e.target) === 'screens' && !e.defaultPrevented) e.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [isGuest]);

  useEffect(() => {
    if (!isGuest) return;
    const root = document.documentElement;
    root.classList.add('ins-guest');

    // Bubble phase, after React's handlers: a custom menu that opened has
    // already called preventDefault, so only the browser's own is stopped.
    const onContextMenu = (e: MouseEvent) => {
      const subject = protectedSubject(e.target);
      // A logo gets LogoContextMenu, which gates its own Copy / Download.
      if (!subject || subject === 'logos' || e.defaultPrevented) return;
      e.preventDefault();
      notifyGuestBlocked('download', subject);
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      root.classList.remove('ins-guest');
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [isGuest]);

  return null;
}
