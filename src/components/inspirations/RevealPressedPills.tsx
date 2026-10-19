'use client';

import { useEffect } from 'react';

/** A pill that opens a menu (its .ins-popwrap holds the button and the menu). */
const MENU_PILL = '.ins-popwrap > button';

/**
 * On a phone the toolbars are sideways-scrolling strips, so a pill can sit
 * half past the screen's edge. Its menu lines up with the pill, so it would
 * open half off the screen too (the browser's own flip doesn't step in: the
 * menu still fits beside the off-screen pill). Pressing such a pill first
 * scrolls its strip to show the whole pill, and its menu opens on screen.
 * Mounted once, in the shell.
 */
export function RevealPressedPills() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const pill = (e.target as Element).closest?.(MENU_PILL);
      if (!pill) return;
      const r = pill.getBoundingClientRect();
      if (r.left >= 0 && r.right <= window.innerWidth) return;
      // Before the pill's own click opens the menu, so it opens beside the pill where it's ended up.
      pill.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
  return null;
}
