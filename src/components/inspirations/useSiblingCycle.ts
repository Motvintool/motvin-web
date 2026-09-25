'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { EMPTY_FILTERS } from '@/lib/inspirations/filters';
import type { Screen } from '@/lib/inspirations/types';

/** Dots get unreadable past a handful — Mobbin's own cards cap similarly. */
const MAX_PREVIEW_SCREENS = 4;
/** Short delay before fetching siblings, so a cursor passing over the grid
 * on its way elsewhere doesn't fire a request for every card it crosses. */
const HOVER_INTENT_MS = 60;

/**
 * Other screens from the same app, fetched once per app and reused by every
 * card for it — a grid showing seven Airbnb screens should not issue seven
 * identical requests. Promise-memoized so concurrent hovers share the
 * in-flight fetch too, not just the resolved result.
 */
const siblingsCache = new Map<string, Promise<Screen[]>>();

function fetchSiblings(appId: string): Promise<Screen[]> {
  let cached = siblingsCache.get(appId);
  if (!cached) {
    cached = inspirationsApi
      .listScreens(EMPTY_FILTERS, 0, 'curated', { app: appId })
      .then((page) => page.items)
      .catch(() => []);
    siblingsCache.set(appId, cached);
  }
  return cached;
}

/**
 * Hover-intent cycling through a handful of an app's other screens — shared
 * by ScreenCard and AppCard so a card behaves the same way in either grid:
 * pausing over it reveals prev/next controls and dots that scrub through
 * sibling screens without leaving the grid. The most recently chosen screen
 * remains visible after mouse leave. `screen` may be null (an app with no
 * screens to preview), in which case this is inert — no fetch, no controls,
 * `activeScreen` stays null.
 */
export function useSiblingCycle(screen: Screen | null) {
  const [previewScreens, setPreviewScreens] = useState<Screen[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const hoverTimer = useRef<number | null>(null);

  const activeScreen = previewScreens?.[activeIndex] ?? screen;
  const dotCount = previewScreens?.length ?? 0;

  const startHover = () => {
    if (!screen || previewScreens || hoverTimer.current !== null) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      void fetchSiblings(screen.appId).then((siblings) => {
        const others = siblings.filter((s) => s.id !== screen.id);
        setPreviewScreens([screen, ...others].slice(0, MAX_PREVIEW_SCREENS));
      });
    }, HOVER_INTENT_MS);
  };

  const endHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const step = (delta: number) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dotCount < 2) return;
    setActiveIndex((i) => (i + delta + dotCount) % dotCount);
  };

  return { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step };
}
