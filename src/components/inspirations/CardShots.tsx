'use client';

import type { CSSProperties, RefObject } from 'react';
import type { Screen } from '@/lib/inspirations/types';
import { Screenshot } from './Screenshot';

/**
 * A card's screens side by side, for swiping (useSiblingCycle's swipe, on a
 * phone or a touch screen): the track shows the active one and slides to the
 * next, following a finger while it's dragged (`--drag`, set by the hook).
 */
export function CardShots({ screens, activeIndex, trackRef }: { screens: Screen[]; activeIndex: number; trackRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={trackRef} className="ins-card-track" style={{ '--i': activeIndex } as CSSProperties}>
      {screens.map((screen, index) => (
        <div key={screen.id} className="ins-card-slide" aria-hidden={index !== activeIndex}>
          <Screenshot screen={screen} />
        </div>
      ))}
    </div>
  );
}
