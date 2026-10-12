'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

const COMMUNITY_URL = 'https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4';

/** The library's app logos, for the row above the headline. Empty until loaded. */
function useAppLogos(): string[] {
  const [logos, setLogos] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    inspirationsApi
      .listApps()
      .then((apps) => {
        if (cancelled) return;
        setLogos(
          apps
            .map((app) => inspirationsApi.mediaUrl(app.logo))
            .filter((src): src is string => Boolean(src))
            .slice(0, 7),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return logos;
}

/**
 * The last thing on the page before the footer: a calm, light call to
 * action with the library's app logos bobbing above it.
 */
export function ClosingCta() {
  const logos = useAppLogos();

  return (
    <section className="lpi-closing" aria-labelledby="lpi-closing-title">
      {logos.length ? (
        <div className="lpi-closing-logos" aria-hidden="true">
          {logos.map((src, i) => (
            <img src={src} alt="" width={52} height={52} key={src} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      ) : null}
      <h2 className="lpi-closing-title" id="lpi-closing-title">
        Find designs that work
      </h2>
      <p className="lpi-closing-text">Start from real apps instead of a blank canvas. It is free to explore.</p>
      <div className="lpi-closing-actions">
        <Link href={INSPIRATIONS_ROUTES.explore} className="lpi-closing-primary">
          Start exploring
        </Link>
        <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="lpi-closing-secondary">
          Join Community
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </a>
      </div>
    </section>
  );
}
