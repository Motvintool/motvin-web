'use client';

import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { useAppCovers } from './useAppCovers';

const CARDS = [
  {
    title: 'Screens',
    text: 'Individual app screens you can filter by type, state and style.',
    href: INSPIRATIONS_ROUTES.screens,
  },
  {
    title: 'Flows',
    text: 'Whole journeys like onboarding and checkout, step by step.',
    href: INSPIRATIONS_ROUTES.flows,
  },
  {
    title: 'Patterns',
    text: 'Recurring design patterns, with the screens that use them.',
    href: INSPIRATIONS_ROUTES.patterns,
  },
  {
    title: 'UI Elements',
    text: 'Nav bars, search bars, bottom sheets and more, pulled out of real screens.',
    href: INSPIRATIONS_ROUTES.uiElements,
  },
];

/** The first thing under the hero: what Motvin Inspirations holds and where to start. */
export function InspirationsSection() {
  const shots = useAppCovers();

  return (
    <section className="lp-ins" id="inspirations-section">
      <div className="lp-ins-inner">
        <p className="lp-ins-eyebrow">Motvin Inspirations</p>
        <h2 className="lp-ins-title">Real apps, real screens, ready when you need an idea</h2>
        <p className="lp-ins-lead">
          Search a library of screens, flows, patterns and UI elements captured from real apps,
          then save the ones you like into collections.
        </p>

        <div className="lp-ins-grid">
          {CARDS.map((card, i) => (
            <Link href={card.href} className="lp-ins-card" key={card.title}>
              <div className="lp-ins-card-shot">
                {shots[i] ? <img src={shots[i].src} alt="" /> : null}
              </div>
              <h3>
                {card.title}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </h3>
              <p>{card.text}</p>
            </Link>
          ))}
        </div>

        <div className="lp-ins-actions">
          <Link href={INSPIRATIONS_ROUTES.explore} className="btn-primary-large">
            <span>Explore Inspirations</span>
          </Link>
          <Link href={INSPIRATIONS_ROUTES.apps} className="lp-ins-secondary">
            Browse apps
          </Link>
        </div>
      </div>
    </section>
  );
}
