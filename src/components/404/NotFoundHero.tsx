'use client';

import Link from 'next/link';

/** Headline, subtitle, and "Return home" CTA for the 404 hero. */
export function NotFoundHero() {
  return (
    <div className="hero-404">
      <div className="hero-text-404">
        <h1 className="title-404">
          This is not the page you were looking for{' '}
          <span className="dots-404">. . . .</span>
        </h1>
        <p className="subtitle-404">And that&apos;s on us.</p>
      </div>
      <div className="hero-action-404">
        <Link href="/" className="btn-return-home" id="btnReturnHome">
          <img src="/ASSET/svg/live-enter.svg" alt="Enter" className="icon-return" />
          <span className="text-return">Return home</span>
        </Link>
      </div>
    </div>
  );
}
