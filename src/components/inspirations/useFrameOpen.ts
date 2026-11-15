'use client';

import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

/**
 * A card's frame (the grey round its screen) opens the app as the screen does, so a click just beside the
 * phone isn't lost. Clicks on the screen's own link and on the frame's buttons (select, play, arrows) are
 * theirs; ⌘ / Ctrl-click opens a new tab, as on the link.
 */
export function useFrameOpen(href: string) {
  const router = useRouter();
  return (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || (e.target as HTMLElement).closest('a, button')) return;
    if (e.metaKey || e.ctrlKey) window.open(href, '_blank', 'noopener');
    else router.push(href);
  };
}
