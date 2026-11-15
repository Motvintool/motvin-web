'use client';

import { useRef, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { useMediaQuery } from './useSheet';
import { SWIPE_QUERY } from './useSiblingCycle';

/** How far a swipe must go (a share of the width), or how fast, to step. */
const SWIPE_SHARE = 0.18;
const FLICK_PX = 30;
const FLICK_MS = 250;
/** How much a drag with nothing on that side still moves it (it resists). */
const EDGE_RESIST = 0.3;
/** How far off-centre the next screen starts as it slides in (a share of the width). */
const ENTER_SHARE = 0.35;
const EASE = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Swiping one screen to the next, as the cards swipe theirs, for a viewer
 * that shows one screen at a time (the screen and flow previews). On a phone
 * or a touch screen (SWIPE_QUERY): the screen follows the finger (`moverRef`)
 * by hand; let go past a fifth of its width (or flicked) and it steps, the
 * next one sliding in from that side, otherwise it settles back; with
 * nothing on that side it resists. Up and down is left to the page, and the
 * click that ends a swipe doesn't count. Spread `swipeProps` on the frame.
 */
export function useSwipeStep({ canPrev, canNext, onStep }: { canPrev: boolean; canNext: boolean; onStep: (dir: 1 | -1) => void }) {
  const swipe = useMediaQuery(SWIPE_QUERY);
  const moverRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; width: number; on: boolean } | null>(null);
  const dragged = useRef(false);

  const move = (px: number, ease: boolean) => {
    const el = moverRef.current;
    if (!el) return;
    el.style.transition = ease && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? EASE : 'none';
    el.style.transform = px ? `translateX(${px}px)` : '';
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!swipe || e.button !== 0 || (!canPrev && !canNext)) return;
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
      // Mostly up or down: the page's scroll, not a swipe.
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
    d.dx = (dx > 0 && !canPrev) || (dx < 0 && !canNext) ? dx * EDGE_RESIST : dx;
    move(d.dx, false);
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    dragged.current = true;
    const dir: 1 | -1 = d.dx < 0 ? 1 : -1;
    const far = Math.abs(d.dx) >= d.width * SWIPE_SHARE || (e.timeStamp - d.t < FLICK_MS && Math.abs(d.dx) > FLICK_PX);
    if (!far || !(dir === 1 ? canNext : canPrev)) return move(0, true);
    onStep(dir);
    // The next screen comes in from the side the finger pulled it from.
    move(dir * d.width * ENTER_SHARE, false);
    requestAnimationFrame(() => requestAnimationFrame(() => move(0, true)));
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
    onDragStart: (e: DragEvent) => {
      if (swipe) e.preventDefault();
    },
  };

  return { swipe, moverRef, swipeProps };
}
