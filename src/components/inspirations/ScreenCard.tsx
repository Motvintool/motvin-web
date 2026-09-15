'use client';

import Link from 'next/link';
import { memo } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { CollectionMenu } from './CollectionMenu';
import { LayersIcon, SparklesIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { SaveButton } from './SaveButton';

/**
 * One gallery cell. Screenshot first; a single compact metadata row below.
 * Hover reveals Save / Collection / Similar / Analyze along the bottom edge
 * of the screenshot so the content itself stays visible.
 */
function ScreenCardImpl({
  screen,
  app,
  showApp = true,
  index,
}: {
  screen: Screen;
  app?: App;
  showApp?: boolean;
  index?: number;
}) {
  const href = INSPIRATIONS_ROUTES.screen(screen);
  return (
    <article className="ins-card" data-id={screen.id}>
      <div className="ins-card-shot">
        <Link href={href} className="ins-card-link" aria-label={`${screen.name}${app ? ` — ${app.name}` : ''}`} prefetch={index !== undefined && index < 10 ? undefined : false}>
          <Screenshot screen={screen} />
        </Link>
        <div className="ins-card-actions">
          <SaveButton type="screen" id={screen.id} />
          <CollectionMenu type="screen" id={screen.id} />
          <span className="ins-spacer" />
          <Link href={`${href}?tab=similar`} className="ins-iconbtn" aria-label="Find similar" title="Similar">
            <LayersIcon size={15} />
          </Link>
          <Link href={`${href}?tab=analyze`} className="ins-iconbtn" aria-label="Analyze UI" title="Analyze">
            <SparklesIcon size={15} />
          </Link>
        </div>
      </div>
      <div className="ins-card-meta">
        {showApp && app && (
          <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-card-app">
            <AppLogo app={app} size={16} />
            <span>{app.name}</span>
          </Link>
        )}
        <Link href={href} className="ins-card-name">{screen.name}</Link>
        <p className="ins-card-sub">
          {INDUSTRY_LABEL[screen.industry]} · {PLATFORM_LABEL[screen.platform]}
        </p>
      </div>
    </article>
  );
}

export const ScreenCard = memo(ScreenCardImpl);
