'use client';

import { useRef, useState, type PointerEvent } from 'react';

/** How long the deck stays up after a swipe lets go, for the deal to play out in view. */
const PEEK_AFTER_MS = 900;

/**
 * A card dragged as a deck, where there's no hover to reveal the arrows (a narrow window, a phone, a touch screen). The
 * front screen follows the finger and tilts with it; let go far enough and the next one is dealt to the front,
 * as the arrows do. While a finger is on it, and a moment after, the screens behind rise into view (`peeking`).
 * Wraps the swipe handlers from useSiblingCycle so the card knows when a drag starts and ends.
 */
export function useDeckSwipe<P extends { onPointerDown: (e: PointerEvent<HTMLElement>) => void; onPointerUp: (e: PointerEvent<HTMLElement>) => void }>(
  swipe: boolean,
  swipeProps: P,
) {
  const deck = swipe;
  const [peeking, setPeeking] = useState(false);
  const timer = useRef<number | null>(null);
  if (!deck) return { deck, peeking: false, deckProps: swipeProps };
  const deckProps: P = {
    ...swipeProps,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setPeeking(true);
      swipeProps.onPointerDown(e);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      swipeProps.onPointerUp(e);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setPeeking(false);
      }, PEEK_AFTER_MS);
    },
  };
  return { deck, peeking, deckProps: { ...deckProps, onPointerCancel: deckProps.onPointerUp } };
}
