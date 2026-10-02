'use client';

import Link from 'next/link';
import type { App, Screen } from '@/lib/inspirations/types';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { AppLogo } from './AppLogo';
import { Screenshot } from './Screenshot';
import { useSiblingCycle } from './useSiblingCycle';

/** Desktop-web app card matching Figma's Web Screen Preview component. */
export function WebCard({
  app,
  preview,
  previewScreens: presetScreens,
  selected = false,
  selectable = false,
  onToggleSelect,
}: {
  app: App;
  preview?: Screen | null;
  previewScreens?: Screen[] | null;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: () => void;
}) {
  const href = INSPIRATIONS_ROUTES.app(app);
  const { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step } = useSiblingCycle(
    preview ?? presetScreens?.[0] ?? null,
    { preset: presetScreens, preferredIds: app.cardScreens },
  );

  return (
    <article className="ins-web-card" data-id={app.id} role="listitem" onMouseEnter={startHover} onMouseLeave={endHover}>
      <div className="ins-web-card-shot">
        {selectable && (
          <button
            type="button"
            className={`ins-card-select-ring ${selected ? 'is-selected' : ''}`}
            aria-label={selected ? `Remove ${app.name} from selection` : `Select ${app.name}`}
            aria-pressed={selected}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSelect?.();
            }}
          >
            {selected && <span className="ins-card-select-check" aria-hidden />}
          </button>
        )}
        <div className="ins-web-card-inset">
          <Link href={href} className="ins-web-card-link" aria-label={app.name}>
            {activeScreen ? <Screenshot screen={activeScreen} /> : <AppLogo app={app} size={96} />}
          </Link>
        </div>
        {dotCount > 1 && (
          <div className="ins-card-hover-controls ins-web-card-controls">
            <button type="button" className="ins-card-control ins-card-control--prev" aria-label="Previous screen" onClick={step(-1)} disabled={activeIndex === 0}>
              <img src="/ASSET/Icons/Motvin/previous-arrow.svg" alt="" width={24} height={18} />
            </button>
            <span className="ins-card-dots" aria-hidden>
              {previewScreens!.map((screen, index) => <span key={screen.id} className={index === activeIndex ? 'is-active' : ''} />)}
            </span>
            <button type="button" className="ins-card-control" aria-label="Next screen" onClick={step(1)}>
              <img src="/ASSET/Icons/Motvin/next-arrow.svg" alt="" width={24} height={18} />
            </button>
          </div>
        )}
      </div>
      <div className="ins-web-card-meta">
        <AppLogo app={app} size={50} className="ins-web-card-logo" />
        <div className="ins-web-card-meta-text">
          <Link href={href} className="ins-web-card-app">{app.name}</Link>
          {app.tagline && <p className="ins-web-card-tagline">{app.tagline}</p>}
        </div>
      </div>
    </article>
  );
}