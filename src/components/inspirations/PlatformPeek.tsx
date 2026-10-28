'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
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
  return (
    <span className="ins-platform-peek-wrap">
      <Link href={href} className="ins-fact-platform" scroll={false}>
        {children}
      </Link>
      {screens.length > 0 && (
        <span className={`ins-platform-peek ${web ? 'is-web' : ''}`} aria-hidden>
          <span className="ins-platform-peek-shots">
            {screens.slice(0, web ? 3 : 4).map((screen) => (
              <span key={screen.id} className="ins-platform-peek-shot">
                {/* Loaded with the page (not lazily, which waits until shown), so the card never opens blank. */}
                <Screenshot screen={screen} priority />
              </span>
            ))}
          </span>
          <span className="ins-platform-peek-caption">
            <AppLogo app={app} size={28} className="ins-platform-peek-logo" />
            <span>
              {app.name} <span className="ins-platform-peek-on">on</span> {label}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
