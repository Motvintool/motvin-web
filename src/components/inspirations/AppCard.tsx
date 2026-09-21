'use client';

import Link from 'next/link';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { ArrowLeftIcon, ArrowRightIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { useSiblingCycle } from './useSiblingCycle';

/**
 * App tile — the exact same card as a screen (.ins-card): one of the app's
 * own screenshots inset on the tinted mat, logo + name + tagline below.
 * Hovering cycles the preview through the app's other screens exactly like a
 * screen card does (see useSiblingCycle) — but unlike a screen card, the
 * link always goes to the app page, never to whichever screen is currently
 * previewed, since that's the one thing this card is for.
 *
 * Hovering also reveals a selection ring, top-left (Figma node 1030:40239).
 * Checking it is how you build up the set of apps the float-collection bar
 * (see FloatCollectionBar) saves into a new collection — this replaced the
 * per-card Save/Add-to-collection buttons that used to live here.
 */
export function AppCard({
  app,
  preview,
  selected = false,
  onToggleSelect,
}: {
  app: App;
  preview?: Screen | null;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const href = INSPIRATIONS_ROUTES.app(app);
  const { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step } = useSiblingCycle(
    preview ?? null,
  );

  return (
    <article className="ins-card" data-id={app.id} role="listitem" onMouseEnter={startHover} onMouseLeave={endHover}>
      <div className="ins-card-shot">
        <button
          type="button"
          className={`ins-card-select-ring ${selected ? 'is-selected' : ''}`}
          aria-label={selected ? `Remove ${app.name} from selection` : `Select ${app.name}`}
          aria-pressed={selected}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect?.();
          }}
        >
          {selected && <span className="ins-card-select-check" aria-hidden />}
        </button>
        <div className="ins-card-inset">
          <Link href={href} className="ins-card-link" aria-label={app.name}>
            {activeScreen ? <Screenshot screen={activeScreen} /> : <AppLogo app={app} size={96} />}
          </Link>
        </div>
        {dotCount > 1 && (
          <div className="ins-card-hover-controls">
            <button type="button" className="ins-card-control ins-card-control--prev" aria-label="Previous screen" onClick={step(-1)}>
              <ArrowLeftIcon size={24} />
            </button>
            <span className="ins-card-dots">
              {previewScreens!.map((s, i) => (
                <span key={s.id} className={i === activeIndex ? 'is-active' : ''} />
              ))}
            </span>
            <button type="button" className="ins-card-control" aria-label="Next screen" onClick={step(1)}>
              <ArrowRightIcon size={24} />
            </button>
          </div>
        )}
      </div>
      <div className="ins-card-meta">
        <AppLogo app={app} size={40} className="ins-card-logo" />
        <div className="ins-card-meta-text">
          <Link href={href} className="ins-card-app">{app.name}</Link>
          {app.tagline && <p className="ins-card-tagline">{app.tagline}</p>}
        </div>
      </div>
    </article>
  );
}
