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
 * in-flight fetch too, not just the resolved result. Exported so
 * ScreenPreviewModal can reuse the exact same cached fetch for its filmstrip
 * instead of issuing a second, redundant request for an app already loaded.
 */
const siblingsCache = new Map<string, Promise<Screen[]>>();

export function fetchSiblings(appId: string): Promise<Screen[]> {
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

export type SiblingCycleOptions = {
  /**
   * A fixed set of screens to cycle through instead of fetching siblings —
   * an app card whose admin picked its carousel already knows them. Counts
   * only when it holds two or more: a lone screen is just a cover, and the
   * card should still fetch the app's other screens to flip through.
   */
  preset?: Screen[] | null;
  /**
   * Screen ids to prefer, in order, when siblings are fetched — used when
   * the caller knows the admin's pick but not the screen records yet. Ids
   * that are not among the fetched siblings are skipped; if none match, the
   * ordinary "this screen, then its siblings" order applies.
   */
  preferredIds?: string[];
};

/**
 * Hover-intent cycling through a handful of an app's other screens — shared
 * by ScreenCard and AppCard so a card behaves the same way in either grid:
 * pausing over it reveals prev/next controls and dots that scrub through
 * sibling screens without leaving the grid. The most recently chosen screen
 * remains visible after mouse leave. `screen` may be null (an app with no
 * screens to preview), in which case this is inert — no fetch, no controls,
 * `activeScreen` stays null.
 */
export function useSiblingCycle(screen: Screen | null, options: SiblingCycleOptions = {}) {
  const preset = options.preset && options.preset.length > 1 ? options.preset.slice(0, MAX_PREVIEW_SCREENS) : null;
  const [fetched, setFetched] = useState<Screen[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const hoverTimer = useRef<number | null>(null);

  const previewScreens = preset ?? fetched;
  const dotCount = previewScreens?.length ?? 0;
  // The preset can shrink between renders (a regrid), so never index past it.
  const activeScreen = (dotCount > 0 ? previewScreens![activeIndex % dotCount] : null) ?? screen;

  const startHover = () => {
    if (!screen || previewScreens || hoverTimer.current !== null) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      void fetchSiblings(screen.appId).then((siblings) => {
        const all = [screen, ...siblings.filter((s) => s.id !== screen.id)];
        const preferred = (options.preferredIds ?? [])
          .map((id) => all.find((s) => s.id === id))
          .filter((s): s is Screen => Boolean(s));
        setFetched((preferred.length ? preferred : all).slice(0, MAX_PREVIEW_SCREENS));
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
