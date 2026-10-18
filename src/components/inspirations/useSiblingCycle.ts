'use client';

import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { useMediaQuery } from './useSheet';
import { inspirationsApi } from '@/lib/inspirations/api';
import { EMPTY_FILTERS } from '@/lib/inspirations/filters';
import type { Screen } from '@/lib/inspirations/types';

/** Dots get unreadable past a handful, so the preview stops at four. */
const MAX_PREVIEW_SCREENS = 4;
/** Short delay before fetching siblings, so a cursor passing over the grid
 * on its way elsewhere doesn't fire a request for every card it crosses. */
const HOVER_INTENT_MS = 60;
/** Where a card swipes instead of showing arrows on hover: a phone-width window (as the stylesheet's phone layout), or any touch screen. */
export const SWIPE_QUERY = '(max-width: 759px), (hover: none)';
/** How much of a card must be on screen before its other screens are fetched, ready to swipe. */
const PREFETCH_VISIBLE = 0.25;
/** How far a swipe must go (a share of the card's width), or how fast, to turn to the next screen. */
const SWIPE_SHARE = 0.18;
const FLICK_PX = 30;
const FLICK_MS = 250;
/** How much a drag past the first or last screen still moves it (it resists, as there's nothing there). */
const EDGE_RESIST = 0.3;

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
 * remains visible after mouse leave. On a phone or a touch screen there's no
 * hover: the screens are swiped instead (`swipe`, `swipeProps` on the
 * screenshot's frame, `trackRef` on CardShots). `screen` may be null (an app with no
 * screens to preview), in which case this is inert — no fetch, no controls,
 * `activeScreen` stays null.
 */
export function useSiblingCycle(screen: Screen | null, options: SiblingCycleOptions = {}) {
  const preset = options.preset && options.preset.length > 1 ? options.preset.slice(0, MAX_PREVIEW_SCREENS) : null;
  const [fetched, setFetched] = useState<Screen[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const hoverTimer = useRef<number | null>(null);

  const previewScreens = preset ?? fetched;
  // The card, to know when it's on screen (its screens are fetched then, ready to swipe).
  const cardRef = useRef<HTMLElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  const swipe = useMediaQuery(SWIPE_QUERY);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; width: number; on: boolean } | null>(null);
  const dragged = useRef(false);
  const dotCount = previewScreens?.length ?? 0;
  // The preset can shrink between renders (a regrid), so never index past it.
  const activeScreen = (dotCount > 0 ? previewScreens![activeIndex % dotCount] : null) ?? screen;

  const preferredKey = (options.preferredIds ?? []).join(',');
  const loadSiblings = (from: Screen) =>
    void fetchSiblings(from.appId).then((siblings) => {
      const all = [from, ...siblings.filter((s) => s.id !== from.id)];
      const preferred = (preferredKey ? preferredKey.split(',') : [])
        .map((id) => all.find((s) => s.id === id))
        .filter((s): s is Screen => Boolean(s));
      setFetched((preferred.length ? preferred : all).slice(0, MAX_PREVIEW_SCREENS));
    });

  const startHover = () => {
    if (!screen || previewScreens || hoverTimer.current !== null) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      loadSiblings(screen);
    }, HOVER_INTENT_MS);
  };

  // A phone (or any touch screen) has no hover to reveal the arrows: the
  // card's screens are swiped instead, as Airbnb's photos are. So they're
  // fetched as the card comes into view, ready before a finger gets there.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !swipe) return;
    const seen = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: PREFETCH_VISIBLE });
    seen.observe(el);
    return () => seen.disconnect();
  }, [swipe]);
  const screenId = screen?.id;
  const hasPreview = Boolean(previewScreens);
  useEffect(() => {
    if (!onScreen || !screen || hasPreview) return;
    loadSiblings(screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSiblings is rebuilt each render; screenId stands for screen
  }, [onScreen, screenId, hasPreview, preferredKey]);

  // The swipe. The screens sit side by side in a track that follows the
  // finger (or a mouse, in a narrow window) by hand, inline, with no
  // re-render; let go past a fifth of the card (or flicked) and it turns to
  // the next or previous screen, otherwise it settles back. It doesn't loop:
  // past the first or last it resists. Up-and-down is left to the page's
  // scroll, and the click that ends a swipe doesn't open the screen.
  const setDrag = (px: number, live: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.setProperty('--drag', `${px}px`);
    track.classList.toggle('is-dragging', live);
  };
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!swipe || dotCount < 2 || e.button !== 0) return;
    dragged.current = false;
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, width: e.currentTarget.getBoundingClientRect().width, on: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Mostly up or down: a scroll, not a swipe.
      if (Math.abs(dy) >= Math.abs(dx)) {
        drag.current = null;
        return;
      }
      d.on = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that's already gone; the swipe just ends with it.
      }
    }
    const pastEdge = (activeIndex === 0 && dx > 0) || (activeIndex === dotCount - 1 && dx < 0);
    d.dx = pastEdge ? dx * EDGE_RESIST : dx;
    setDrag(d.dx, true);
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    dragged.current = true;
    setDrag(0, false);
    const quick = e.timeStamp - d.t < FLICK_MS && Math.abs(d.dx) > FLICK_PX;
    if (Math.abs(d.dx) < d.width * SWIPE_SHARE && !quick) return;
    setActiveIndex((i) => Math.min(dotCount - 1, Math.max(0, i + (d.dx < 0 ? 1 : -1))));
  };
  const swipeProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClickCapture: (e: MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    // A mouse drag would otherwise pick up the image or link to drop elsewhere.
    onDragStart: (e: DragEvent) => {
      if (swipe) e.preventDefault();
    },
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

  return { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step, cardRef, swipe, trackRef, swipeProps };
}
