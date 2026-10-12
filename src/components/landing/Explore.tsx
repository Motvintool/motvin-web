'use client';

import Link from 'next/link';
import { useAuth } from '@/components/shared/AuthProvider';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

/**
 * "Explore everything" band before the footer: the other Motvin tools as
 * tiles, styled like the Inspirations sections above it, and a dark tile to
 * sign up (or, when signed in, to go to the library).
 */

const TOOLS = [
  { title: 'Explore Colors', text: 'Palettes and colour styles for your next design.', href: '/MOTVIN/styles', img: '/ASSET/Images/decor1.webp', tone: 'purple' },
  { title: 'Icons Library', text: 'Icons ready to drop into your designs.', href: '/icons', img: '/ASSET/Images/decor2.webp', tone: 'green' },
  { title: 'Logos Library', text: 'Brand logos from the apps and companies you know.', href: '/logos', img: '/ASSET/Images/decor3.webp', tone: 'orange' },
];

const ARROW = (
  <svg className="lpi-explore-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </svg>
);

export function Explore() {
  const { user } = useAuth();

  return (
    <section className="lpi-explore" aria-labelledby="explore-section-title">
      <div className="lpi-heading">
        <h2 className="lpi-title" id="explore-section-title">
          Explore everything you can do with Motvin
        </h2>
      </div>

      <div className="lpi-explore-grid">
        {TOOLS.map((tool) => (
          <a className={`lpi-explore-card is-${tool.tone}`} href={tool.href} target="_blank" rel="noopener" key={tool.title}>
            <span className="lpi-explore-icon">
              <img src={tool.img} alt="" />
            </span>
            <span className="lpi-explore-copy">
              <b>{tool.title}</b>
              <span>{tool.text}</span>
            </span>
            {ARROW}
          </a>
        ))}

        {user ? (
          <Link className="lpi-explore-card is-dark" href={INSPIRATIONS_ROUTES.explore}>
            <span className="lpi-explore-copy">
              <b>Go to Library</b>
              <span>Pick up where you left off.</span>
            </span>
            {ARROW}
          </Link>
        ) : (
          <Link className="lpi-explore-card is-dark" href="/signup">
            <span className="lpi-explore-copy">
              <b>Get started</b>
              <span>Create your free account.</span>
            </span>
            {ARROW}
          </Link>
        )}
      </div>
    </section>
  );
}
