'use client';

import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { Screen } from '@/lib/inspirations/types';

/**
 * A stored screenshot.
 *
 * The image is served by the backend from `data/inspirations/screens`. Its
 * real pixel dimensions come from the manifest, so the box is reserved at the
 * right aspect ratio before the file loads and the masonry grid never shifts.
 *
 * If the file fails to load the frame stays empty and says so — there is no
 * stand-in artwork, because a placeholder that looks like a screenshot would
 * misrepresent what is in the library.
 */
export function Screenshot({
  screen,
  className = '',
  priority = false,
}: {
  screen: Screen;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // The card already reserves its geometry. Track decode only for callers that
  // need the loaded state; keeping the image visible avoids a blank handoff
  // when a page skeleton gives way to its real preview cards.
  const [loaded, setLoaded] = useState(false);
  const src = inspirationsApi.mediaUrl(screen.url);
  const ratio = screen.width && screen.height ? `${screen.width} / ${screen.height}` : '4 / 3';

  if (failed || !src) {
    return (
      <div className={`ins-shot-missing ${className}`} style={{ aspectRatio: ratio }} role="img" aria-label={`${screen.name} — image unavailable`}>
        <span className="ins-shot-missing-text">Image unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${screen.name} screen`}
      className={`ins-shot-img ${loaded ? 'is-loaded' : ''} ${className}`}
      style={{ aspectRatio: ratio }}
      width={screen.width || undefined}
      height={screen.height || undefined}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      onLoad={() => setLoaded(true)}
      // A cached image can finish before React attaches onLoad, which would
      // leave it stuck at zero opacity. Catch that case on mount.
      ref={(node) => {
        if (node?.complete) setLoaded(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}
