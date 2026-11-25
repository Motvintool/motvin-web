'use client';

import { getImageProps } from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { Screen } from '@/lib/inspirations/types';
import { screenTitle } from '@/lib/inspirations/screenNaming';

/** How close to the window a card's screenshot comes before it starts loading. */
const NEAR_MARGIN = '300px 0px';

/** Screenshots already shown once: brought back (the deck turning, a card re-shown) they appear at once, no wait or fade. */
const shown = new Set<string>();

/** How long a screenshot stays near the window before it loads: rows a fast scroll only passes don't load. */
const NEAR_DWELL_MS = 120;

/** One observer for every card's screenshot, rather than one each: each image is told once, when it has stayed near the window. */
const nearCallbacks = new WeakMap<Element, () => void>();
const nearTimers = new WeakMap<Element, number>();
let nearObserver: IntersectionObserver | null = null;
function whenNear(el: Element, onNear: () => void) {
  nearObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target;
      window.clearTimeout(nearTimers.get(target));
      if (!entry.isIntersecting) continue;
      nearTimers.set(target, window.setTimeout(() => {
        nearCallbacks.get(target)?.();
        nearCallbacks.delete(target);
        nearObserver?.unobserve(target);
      }, NEAR_DWELL_MS));
    }
  }, { rootMargin: NEAR_MARGIN });
  nearCallbacks.set(el, onNear);
  nearObserver.observe(el);
  return () => {
    window.clearTimeout(nearTimers.get(el));
    nearCallbacks.delete(el);
    nearObserver?.unobserve(el);
  };
}

/**
 * A stored screenshot.
 *
 * The image is served by the backend from `data/inspirations/screens`. Its
 * real pixel dimensions come from the manifest, so the box is reserved at the
 * right aspect ratio before the file loads and the masonry grid never shifts.
 *
 * With `sizes` (how wide it's shown, as for <img sizes>) it comes through Next's image optimizer, resized and
 * compressed to about that width — a card shows a 2880px screenshot a few hundred pixels wide, and the full
 * file there makes scrolling stutter. Without it, the original file (an opened screen, shown large).
 *
 * Those card screenshots also wait until they're close to the window (NEAR_MARGIN) before loading, as on
 * Mobbin: the card's grey frame shows meanwhile and the picture fades in, so a fast scroll past many rows
 * doesn't queue every image on the way — only the ones the visitor stops at.
 *
 * If the file fails to load the frame stays empty and says so — there is no
 * stand-in artwork, because a placeholder that looks like a screenshot would
 * misrepresent what is in the library.
 */
export function Screenshot({
  screen,
  className = '',
  priority = false,
  sizes,
}: {
  screen: Screen;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A load that fails is tried again before the card gives up: first the original file straight from the
  // library (skipping the resizer, which can drop a request while busy), then once more a moment later.
  // A brief network or server hiccup then heals by itself instead of leaving "Image unavailable" for good.
  const [attempt, setAttempt] = useState(0);
  // The card already reserves its geometry. Track decode only for callers that
  // need the loaded state; keeping the image visible avoids a blank handoff
  // when a page skeleton gives way to its real preview cards.
  const [loaded, setLoaded] = useState(false);
  // A website's whole page in a card: only its top (the server cuts it once). Resizing alone keeps a 16,000px page
  // ~9,000px tall at card width, and a few of those make the grid lag.
  const pageCover = Boolean(sizes) && screen.site?.kind === 'page';
  const full = inspirationsApi.mediaUrl(screen.url);
  const src = full && pageCover ? `${full}${full.includes('?') ? '&' : '?'}cover=1` : full;
  const shotHeight = pageCover && screen.width ? Math.min(screen.height || Infinity, Math.round(screen.width * 0.8)) : screen.height;
  const deferred = Boolean(sizes) && !priority && !(src && shown.has(src));
  const [near, setNear] = useState(!deferred);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = imgRef.current;
    if (near || !el) return;
    return whenNear(el, () => setNear(true));
  }, [near]);
  const resized = src && sizes && attempt === 0
    ? getImageProps({ src, alt: '', width: screen.width || 1200, height: shotHeight || 900, sizes, quality: 75 }).props
    : null;
  const ratio = screen.width && screen.height ? `${screen.width} / ${screen.height}` : '4 / 3';

  if (failed || !src) {
    return (
      <div className={`ins-shot-missing ${className}`} style={{ aspectRatio: ratio }} role="img" aria-label={`${screenTitle(screen)} — image unavailable`}>
        <span className="ins-shot-missing-text">Image unavailable</span>
      </div>
    );
  }

  const direct = src && attempt === 2 ? `${src}${src.includes('?') ? '&' : '?'}retry=1` : src;

  return (
    <img
      key={attempt}
      src={near ? (resized?.src ?? direct ?? undefined) : undefined}
      srcSet={near ? resized?.srcSet : undefined}
      sizes={near && resized ? sizes : undefined}
      alt={`${screenTitle(screen)} screen`}
      // A website page is far taller than any frame: cropped, it shows its top, as a visitor first sees it.
      className={`ins-shot-img ${deferred ? 'is-deferred' : ''} ${loaded ? 'is-loaded' : ''} ${screen.site?.kind === 'page' ? 'is-site-page' : ''} ${className}`}
      style={{ aspectRatio: ratio }}
      width={screen.width || undefined}
      height={screen.height || undefined}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      onLoad={() => {
        if (src) shown.add(src);
        setLoaded(true);
      }}
      // A cached image can finish before React attaches onLoad, which would
      // leave it stuck at zero opacity. Catch that case on mount.
      ref={(node) => {
        imgRef.current = node;
        if (node?.complete && node.currentSrc) setLoaded(true);
      }}
      onError={() => {
        if (attempt === 0) setAttempt(1);
        else if (attempt === 1) setTimeout(() => setAttempt(2), 1500);
        else setFailed(true);
      }}
    />
  );
}
