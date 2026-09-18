'use client';

import Link from 'next/link';
import { memo } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { CollectionMenu } from './CollectionMenu';
import { LayersIcon, SparklesIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { SaveButton } from './SaveButton';

/** A screen counts as "New" for this many days after its capturedAt date. */
const NEW_WINDOW_DAYS = 14;

/**
 * Whether to show the "New" badge. Backed by the screen's own capturedAt —
 * most screens have none (it's optional metadata, filled in by whichever
 * pipeline captured them), in which case this is simply false rather than a
 * guess. There is no "Updated" badge for the same reason: nothing in the
 * store distinguishes a re-capture from a first one.
 */
function isRecentlyCaptured(capturedAt: string | null): boolean {
  if (!capturedAt) return false;
  const captured = new Date(capturedAt).getTime();
  if (Number.isNaN(captured)) return false;
  return Date.now() - captured < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

const NAME_TAGLINE_SEPARATOR = ' — ';

/**
 * Some stored app names carry their tagline inline (e.g. "Bumble — Find new
 * people & chat singles") from whichever pipeline ingested them, rather than
 * in the app's own tagline field. Split on the same em-dash the masthead
 * displays it with, so the card can still show a title and a description
 * separately instead of one long truncated line.
 */
function splitAppName(name: string): { title: string; tagline: string | null } {
  const i = name.indexOf(NAME_TAGLINE_SEPARATOR);
  if (i === -1) return { title: name, tagline: null };
  return { title: name.slice(0, i), tagline: name.slice(i + NAME_TAGLINE_SEPARATOR.length) };
}

/**
 * One gallery cell, matching Figma's "List Item" component: the screenshot
 * inset on a tinted mat, a real "New" badge when the capture date backs it,
 * and a logo + app-name + tagline row below. Hover reveals
 * Save / Collection / Similar / Analyze along the bottom edge of the
 * screenshot so the content itself stays visible.
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
  const { title: appTitle, tagline: derivedTagline } = app ? splitAppName(app.name) : { title: '', tagline: null };
  const appDescription = app?.tagline || derivedTagline;
  return (
    <article className="ins-card" data-id={screen.id} role="listitem">
      <div className="ins-card-shot">
        {isRecentlyCaptured(screen.capturedAt) && <span className="ins-card-badge">New</span>}
        <div className="ins-card-inset">
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
      </div>
      <div className="ins-card-meta">
        {showApp && app ? (
          <>
            <AppLogo app={app} size={40} className="ins-card-logo" />
            <div className="ins-card-meta-text">
              <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-card-app">{appTitle}</Link>
              {appDescription && <p className="ins-card-tagline">{appDescription}</p>}
            </div>
          </>
        ) : (
          <Link href={href} className="ins-card-name">{screen.name}</Link>
        )}
      </div>
    </article>
  );
}

export const ScreenCard = memo(ScreenCardImpl);
