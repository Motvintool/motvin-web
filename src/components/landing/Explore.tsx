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
  // Not live yet: shown with a "Soon" tag and no link.
  { title: 'Explore Colors', text: 'Palettes and colour styles for your next design.', href: null, img: '/ASSET/Images/decor1.webp', tone: 'purple' },
  { title: 'Icons Library', text: 'Icons ready to drop into your designs.', href: '/icons', img: '/ASSET/Images/decor2.webp', tone: 'green' },
  { title: 'Logos Library', text: 'Brand logos from the apps and companies you know.', href: '/logos', img: '/ASSET/Images/decor3.webp', tone: 'orange' },
];

const ARROW = <img className="lpi-explore-arrow" src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={20} height={20} aria-hidden="true" />;

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
        {TOOLS.map((tool) => {
          const body = (
            <>
              <span className="lpi-explore-icon">
                <img src={tool.img} alt="" />
              </span>
              <span className="lpi-explore-copy">
                <b>{tool.title}</b>
                <span>{tool.text}</span>
              </span>
            </>
          );
          return tool.href ? (
            <a className={`lpi-explore-card is-${tool.tone}`} href={tool.href} target="_blank" rel="noopener" key={tool.title}>
              {body}
              {ARROW}
            </a>
          ) : (
            <div className={`lpi-explore-card is-${tool.tone} is-soon`} aria-disabled="true" key={tool.title}>
              {body}
              <span className="lpi-explore-soon">Soon</span>
            </div>
          );
        })}

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
