'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
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

export type CtaAction = { label: string; href: string };

/** A page link, an outside link (opens in a new tab), or a mail link. */
function ActionLink({ action, className, children }: { action: CtaAction; className: string; children?: ReactNode }) {
  const content = (
    <>
      {action.label}
      {children}
    </>
  );
  if (action.href.startsWith('/')) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }
  const outside = /^https?:\/\//.test(action.href);
  return (
    <a href={action.href} className={className} {...(outside ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {content}
    </a>
  );
}

/**
 * A calm, light call to action with the library's app logos bobbing above
 * it. The last thing on the landing page before the footer, and reused (with
 * its own words and buttons) to sign off other pages, such as About.
 */
export function ClosingCta({
  title = 'Find designs that work',
  text = 'Start from real apps instead of a blank canvas. It is free to explore.',
  primary = { label: 'Start exploring', href: INSPIRATIONS_ROUTES.explore },
  secondary = { label: 'Join Community', href: COMMUNITY_URL },
}: {
  title?: string;
  text?: string;
  primary?: CtaAction;
  secondary?: CtaAction;
}) {
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
        {title}
      </h2>
      <p className="lpi-closing-text">{text}</p>
      <div className="lpi-closing-actions">
        <ActionLink action={primary} className="lpi-closing-primary" />
        <ActionLink action={secondary} className="lpi-closing-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </ActionLink>
      </div>
    </section>
  );
}
