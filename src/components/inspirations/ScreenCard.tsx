'use client';

import Link from 'next/link';
import { memo } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

import type { App, Screen } from '@/lib/inspirations/types';
import { screenStateLabel } from '@/lib/inspirations/taxonomy';
import { AppLogo } from './AppLogo';
import { Screenshot } from './Screenshot';
import { useSiblingCycle } from './useSiblingCycle';

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
 * inset on a tinted mat, and a logo + app-name + tagline row below.
 *
 * Hovering reveals prev/next controls that cycle through other screens from
 * the same app without leaving the grid — the image, its link and the dots
 * all track whichever screen is currently shown, then reset to the card's
 * own screen on mouse leave. The sibling list itself is fetched lazily on
 * hover intent, not up front, so a large grid doesn't fetch data for cards
 * nobody looks at closely.
 */
function ScreenCardImpl({
  screen,
  app,
  showApp = true,
  showMeta = true,
  selectable = false,
  selected = false,
  onToggleSelect,
  index,
  textHighlights,
  onRemove,
}: {
  screen: Screen;
  app?: App;
  showApp?: boolean;
  showMeta?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  index?: number;
  textHighlights?: Array<{ left: number; top: number; width: number; height: number }>;
  onRemove?: () => void;
}) {
  const { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step } = useSiblingCycle(screen);
  // useSiblingCycle's `screen` param is nullable (AppCard may have no preview
  // to cycle) so its return type is too, but ScreenCard's own `screen` prop
  // never is — the fallback here is for the type, not a real null case.
  const shownScreen = activeScreen ?? screen;
  const href = INSPIRATIONS_ROUTES.screen(shownScreen);

  const { title: appTitle, tagline: derivedTagline } = app ? splitAppName(app.name) : { title: '', tagline: null };
  const appDescription = app?.tagline || derivedTagline;

  return (
    <article className={`ins-card ${selected ? 'is-selected' : ''}`} data-id={screen.id} role="listitem" onMouseEnter={startHover} onMouseLeave={endHover}>
      <div className="ins-card-shot">
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
        {onRemove && (
          <button
            type="button"
            className="ins-card-remove-btn"
            aria-label={`Remove ${screen.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            <img src="/ASSET/Icons/Motvin/colletion-delete.svg" alt="" width={16} height={16} />
          </button>
        )}
        <div className="ins-card-inset">
          <Link href={href} className="ins-card-link" aria-label={`${shownScreen.name}${app ? ` — ${app.name}` : ''}`} prefetch={index !== undefined && index < 10 ? undefined : false}>
            <Screenshot screen={shownScreen} />
            {shownScreen.id === screen.id && textHighlights?.map((highlight, index) => (
              <span
                key={`${highlight.left}-${highlight.top}-${index}`}
                className="ins-card-text-highlight"
                aria-hidden
                style={{ left: `${highlight.left}%`, top: `${highlight.top}%`, width: `${highlight.width}%`, height: `${highlight.height}%` }}
              />
            ))}
          </Link>
        </div>
        {/* The condition the screen was captured in — loading, empty, a sheet
            over it — read from the store, never inferred. A plain settled
            screen has no badge, so the badge means something when it shows. */}
        {shownScreen.states?.length > 0 && (
          <span className="ins-card-states" aria-label={`State: ${shownScreen.states.map(screenStateLabel).join(', ')}`}>
            {shownScreen.states.filter((v) => v !== 'keyboard' && v !== 'scrolled').slice(0, 2).map((v) => (
              <span key={v} className={`ins-state-badge is-${v}`}>{screenStateLabel(v)}</span>
            ))}
          </span>
        )}
        {dotCount > 1 && (
          <div className="ins-card-hover-controls">
            <button type="button" className="ins-card-control ins-card-control--prev" aria-label="Previous screen" onClick={step(-1)} disabled={activeIndex === 0}>
              <img src="/ASSET/Icons/Motvin/previous-arrow.svg" alt="" width={24} height={18} />
            </button>
            <span className="ins-card-dots">
              {previewScreens!.map((s, i) => (
                <span key={s.id} className={i === activeIndex ? 'is-active' : ''} />
              ))}
            </span>
            <button type="button" className="ins-card-control" aria-label="Next screen" onClick={step(1)}>
              <img src="/ASSET/Icons/Motvin/next-arrow.svg" alt="" width={24} height={18} />
            </button>
          </div>
        )}
      </div>
      {showMeta && (
        <div className="ins-card-meta">
          {showApp && app ? (
            <>
              <AppLogo app={app} size={48} className="ins-card-logo" />
              <div className="ins-card-meta-text">
                <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-card-app">{appTitle}</Link>
                {appDescription && <p className="ins-card-tagline">{appDescription}</p>}
              </div>
            </>
          ) : (
            <Link href={href} className="ins-card-name">{shownScreen.name}</Link>
          )}
        </div>
      )}
    </article>
  );
}

export const ScreenCard = memo(ScreenCardImpl);
