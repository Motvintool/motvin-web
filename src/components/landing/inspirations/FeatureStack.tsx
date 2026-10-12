'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { LibraryCounts } from '@/lib/inspirations/types';
import type { LandingApp } from './useLandingLibrary';

const CARDS: {
  key: keyof LibraryCounts;
  label: string;
  title: string;
  text: string;
  unit: string;
  href: string;
  cta: string;
  tone: string;
}[] = [
  {
    key: 'screens',
    label: 'Screens',
    title: 'Browse real screens',
    text: 'Every screen is a real capture from a shipped app. Filter by screen type, state, style or industry to find the exact moment you are designing.',
    unit: 'screens',
    href: INSPIRATIONS_ROUTES.screens,
    cta: 'Browse screens',
    tone: 'blue',
  },
  {
    key: 'flows',
    label: 'Flows',
    title: 'Follow whole flows',
    text: 'See onboarding, checkout and sign-up the way users actually move through them, step by step, instead of one screen at a time.',
    unit: 'flows',
    href: INSPIRATIONS_ROUTES.flows,
    cta: 'Explore flows',
    tone: 'purple',
  },
  {
    key: 'patterns',
    label: 'Patterns',
    title: 'Learn the patterns',
    text: 'Recurring solutions, grouped with every screen that uses them, so you can compare how different apps solve the same problem.',
    unit: 'patterns',
    href: INSPIRATIONS_ROUTES.patterns,
    cta: 'See patterns',
    tone: 'orange',
  },
  {
    key: 'ui-elements',
    label: 'UI elements',
    title: 'Zoom into UI elements',
    text: 'Nav bars, search bars, bottom sheets and more, pulled out of real screens so you can study the details that make them work.',
    unit: 'UI elements',
    href: INSPIRATIONS_ROUTES.uiElements,
    cta: 'Open UI elements',
    tone: 'green',
  },
];

const COUNT_MS = 1400;

/** The library's real count, counted up from zero the first time it scrolls into view. */
function CountUp({ value }: { value: number | undefined }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  // The number mid-count; null shows the real value.
  const [counting, setCounting] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value == null || played.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played.current) return;
        played.current = true;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / COUNT_MS);
          setCounting(t < 1 ? Math.round(value * (1 - Math.pow(1 - t, 3))) : null);
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  const display = counting ?? value;
  return <span ref={ref}>{display != null ? display.toLocaleString('en-US') : '—'}</span>;
}

/** Jitter-style cards that stack on top of one another as you scroll, one per kind of content. */
export function FeatureStack({ apps, counts }: { apps: LandingApp[]; counts: LibraryCounts | null }) {
  const covers = apps.filter((app) => app.cover && !app.wide);

  return (
    <section className="lpi-stack-section">
      <div className="lpi-heading">
        <p className="lpi-eyebrow">Inspiration, organised</p>
        <h2 className="lpi-title">From blank canvas to proven pattern in seconds</h2>
        <p className="lpi-lead">Four ways into the same library, so you always start from something that already works.</p>
      </div>

      <div className="lpi-stack">
        {CARDS.map((card, i) => {
          // Three different apps per card, fanned out like phones on a desk.
          const fan = covers.length ? [0, 1, 2].map((k) => covers[(i * 3 + k) % covers.length]) : [];
          return (
            <article className={`lpi-stack-card is-${card.tone}`} key={card.key} style={{ top: `${104 + i * 28}px` }}>
              <div className="lpi-stack-copy">
                <span className="lpi-stack-label">
                  <span className="lpi-stack-index">{String(i + 1).padStart(2, '0')}</span>
                  {card.label}
                </span>
                <h3 className="lpi-stack-title">{card.title}</h3>
                <p className="lpi-stack-text">{card.text}</p>

                <div className="lpi-stack-stat">
                  <p className="lpi-stack-number">
                    <CountUp value={counts?.[card.key]} />
                    <span>{card.unit}</span>
                  </p>
                  <p className="lpi-stack-live">
                    <i aria-hidden="true" /> Live from the library
                  </p>
                </div>

                <Link href={card.href} className="lpi-stack-link">
                  {card.cta}
                  <span className="lpi-stack-link-arrow" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </div>

              <div className="lpi-stack-visual" aria-hidden="true">
                {fan.map((app, k) =>
                  app.cover ? (
                    <div className={`lpi-stack-phone is-${['left', 'front', 'right'][k]}`} key={`${app.id}-${k}`}>
                      <img src={app.cover} alt="" loading="lazy" draggable={false} />
                    </div>
                  ) : null,
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
