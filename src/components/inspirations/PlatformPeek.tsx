'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { countsOn } from '@/lib/inspirations/appCounts';
import { isDesktopPlatform, type App, type Platform, type Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { Screenshot } from './Screenshot';

/**
 * The masthead's link to the same app on another platform ("Web Apps" on Claude's iOS page), with a
 * preview card on hover or keyboard focus: a few of that platform's screens over "Claude on Web Apps".
 * Only a preview — the link itself is what opens it. Pointer devices only; on touch the link just opens.
 */
export function PlatformPeek({
  app,
  platform,
  label,
  href,
  screens,
  children,
}: {
  app: App;
  platform: Platform;
  label: string;
  href: string;
  /** Up to four of that platform's screens: its card pictures, else its first ones. */
  screens: Screen[];
  children: ReactNode;
}) {
  const web = isDesktopPlatform(platform);
  // Its screens load once the page has settled (or straight away when the link is pointed at or reached
  // with Tab), so they never hold up the page's own screens yet are ready by the time it opens.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWarm(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  // That platform's own counts ("150 screens · 26 flows"), never the two platforms added together.
  const counts = countsOn(app, [platform]);
  const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
  return (
    <span className="ins-platform-peek-wrap" onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)}>
      <Link href={href} className="ins-fact-platform" scroll={false}>
        {children}
      </Link>
      {screens.length > 0 && (
        <span className={`ins-platform-peek ${web ? 'is-web' : ''}`} aria-hidden>
          <span className="ins-platform-peek-shots">
            {screens.slice(0, web ? 3 : 4).map((screen, i) => (
              <span key={screen.id} className="ins-platform-peek-shot" style={{ '--i': i } as CSSProperties}>
                {/* Eager once warm (lazy loading would wait until the hidden card is shown). */}
                {warm && <Screenshot screen={screen} priority />}
              </span>
            ))}
          </span>
          <span className="ins-platform-peek-caption">
            <AppLogo app={app} size={28} className="ins-platform-peek-logo" />
            <span>
              {app.name} <span className="ins-platform-peek-on">on</span> {label}
            </span>
            {counts.screens > 0 && (
              <span className="ins-platform-peek-counts">
                {plural(counts.screens, 'screen')}
                {counts.flows > 0 && ` · ${plural(counts.flows, 'flow')}`}
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
