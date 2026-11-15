'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { IMAGE_SIZE, optimizedImage } from '@/lib/inspirations/optimizedImage';
import { useLandingLibrary } from './inspirations/useLandingLibrary';

// How many real screens fan out on the right of the banner.
const FAN_SIZE = 3;

/**
 * The About page's flagship card: Motvin Inspirations, with its pitch and
 * button on the left and a fan of real iOS screens from the library rising
 * out of its lower-right corner. The whole card links to Inspirations.
 * The screens are decorative; until the library loads the fan stays empty.
 */
export function AboutFeatured() {
  const { apps } = useLandingLibrary();
  const screens = useMemo(
    () =>
      apps
        .filter((app) => app.cover && !app.wide)
        .slice(0, FAN_SIZE)
        .map((app) => ({ id: app.id, ...optimizedImage(app.cover as string, IMAGE_SIZE.card) })),
    [apps],
  );

  return (
    <Link href="/inspirations" className="abt-featured">
      <span className="abt-featured-copy">
        <span className="abt-featured-icon" aria-hidden="true">
          <img src="/ASSET/Icons/motvin-logo.svg" alt="" width={30} height={30} />
        </span>
        <b>Motvin Inspirations</b>
        <span className="abt-featured-text">
          Browse screens, flows and patterns from real apps, search them by what they say, and save what inspires you.
        </span>
        <span className="abt-featured-cta">
          Start exploring
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </span>
      </span>

      <span className="abt-featured-fan" aria-hidden="true">
        {screens.map((screen, i) => (
          <span key={screen.id} className={`abt-featured-shot is-${i + 1}`}>
            <img src={screen.src} srcSet={screen.srcSet} alt="" draggable={false} loading="lazy" decoding="async" />
          </span>
        ))}
      </span>
    </Link>
  );
}
