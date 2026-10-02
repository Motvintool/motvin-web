'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { App, Screen } from '@/lib/inspirations/types';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { AppLogo } from './AppLogo';
import { Screenshot } from './Screenshot';
import { SCREEN_PARAM } from './ScreenPreviewModal';

function isPlainClick(event: React.MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Desktop-web screen card using the same visual system as WebCard. */
export function WebScreenCard({
  screen,
  app,
  selectable = false,
  selected = false,
  onToggleSelect,
  showApp = true,
  showMeta = true,
}: {
  screen: Screen;
  app?: App;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  showApp?: boolean;
  showMeta?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set(SCREEN_PARAM, screen.id);
  const href = `${pathname}?${params.toString()}`;
  const openPreview = () => router.push(href, { scroll: false });

  return (
    <article className="ins-web-card" data-id={screen.id} role="listitem">
      <div className="ins-web-card-shot">
        {selectable && (
          <button
            type="button"
            className={`ins-card-select-ring ${selected ? 'is-selected' : ''}`}
            aria-label={selected ? `Deselect ${screen.name}` : `Select ${screen.name}`}
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
          <Link
            href={href}
            className="ins-web-card-link"
            aria-label={`${screen.name}${app ? ` - ${app.name}` : ''}`}
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              openPreview();
            }}
          >
            <Screenshot screen={screen} />
          </Link>
        </div>
      </div>
      {showMeta && (
        <div className="ins-web-card-meta">
          {showApp && app ? (
            <>
              <AppLogo app={app} size={50} className="ins-web-card-logo" />
              <div className="ins-web-card-meta-text">
                <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-web-card-app">{app.name}</Link>
                {app.tagline && <p className="ins-web-card-tagline">{app.tagline}</p>}
              </div>
            </>
          ) : (
            <Link href={href} className="ins-web-card-name">{screen.name}</Link>
          )}
        </div>
      )}
    </article>
  );
}