'use client';

import Link from 'next/link';
import type { App, Screen } from '@/lib/inspirations/types';
import { useState, type CSSProperties } from 'react';
import { appFreshness } from '@/lib/inspirations/appFreshness';
import { useLibrarySettings } from './useMeta';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { AppLogo } from './AppLogo';
import { Screenshot } from './Screenshot';
import { useSiblingCycle } from './useSiblingCycle';
import { useDeckSwipe } from './useDeckSwipe';
import { useFrameOpen } from './useFrameOpen';
import { CloseIcon } from './Icons';
import { CardCorner } from './CardCorner';
import { useLogoTint } from './useLogoTint';

/** How wide a card's screens are shown (about four-fifths of its card), so they load at that size. */
const WEB_SHOT_SIZES = '(min-width: 1600px) 26vw, (min-width: 641px) 40vw, 80vw';

/** Desktop-web app card matching Figma's Web Screen Preview component. */
export function WebCard({
  app,
  preview,
  previewScreens: presetScreens,
  selected = false,
  selectable = false,
  onToggleSelect,
  onRemove,
}: {
  app: App;
  preview?: Screen | null;
  previewScreens?: Screen[] | null;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: () => void;
  /** In a collection: the × that takes the app out of it, as on an app card. */
  onRemove?: () => void;
}) {
  // On the platform the card shows (its preview's): an app on iOS and the web opens as the web one here.
  const cardPlatform = (preview ?? presetScreens?.[0])?.platform;
  const href = INSPIRATIONS_ROUTES.app(app, cardPlatform);
  const { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step, cardRef, swipe, trackRef, swipeProps } = useSiblingCycle(
    preview ?? presetScreens?.[0] ?? null,
    { preset: presetScreens, preferredIds: app.cardScreens },
  );
  // Which way the deck last moved (the arrows), as on an app card: forward deals the next page to the front.
  const [deck, setDeck] = useState<{ index: number; dir: 'next' | 'prev' | null; from: number }>({ index: activeIndex, dir: null, from: activeIndex });
  if (deck.index !== activeIndex) setDeck({ index: activeIndex, dir: dotCount > 1 && activeIndex === (deck.index + 1) % dotCount ? 'next' : 'prev', from: deck.index });
  // Where there's no hover but room for the stack, a drag deals the deck instead of sliding screens side by side.
  const { deck: deckSwipe, peeking, deckProps } = useDeckSwipe(swipe, swipeProps);
  const openFromFrame = useFrameOpen(href);

  // "Latest" or "Updated", as on the app cards, from this web part's own uploads.
  const freshness = appFreshness(app, useLibrarySettings().freshness, undefined, ['webapp', 'web']);
  const tint = useLogoTint(app);

  return (
    <article
      ref={cardRef}
      className={`ins-web-card ${deckSwipe ? 'is-deck-swipe' : ''} ${peeking ? 'is-peeking' : ''}`}
      data-id={app.id}
      role="listitem"
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      // The app's own colour, faint, behind its page, as on an app card (useLogoTint).
      style={tint ? ({ '--ins-card-tint': tint } as CSSProperties) : undefined}
    >
      <div className="ins-web-card-shot" onClick={openFromFrame}>
        <CardCorner app={app} platform={cardPlatform} freshness={freshness} playable={Boolean(activeScreen)} />
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
        {onRemove && (
          <button
            type="button"
            className="ins-card-remove-btn"
            aria-label={`Remove ${app.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            <CloseIcon size={14} />
          </button>
        )}
        {/* The deck, on hover: the site's next pages peeking out above this one, stacked behind it. */}
        {previewScreens && dotCount > 1 && (
          <div className="ins-card-stack ins-web-card-stack" aria-hidden>
            {[2, 1].filter((n) => n < dotCount).map((n) => (
              <div key={`${activeIndex}-${n}`} className={`ins-card-stack-layer is-${n} ${deck.dir ? `deal-${deck.dir}` : ''}`}>
                <Screenshot sizes={WEB_SHOT_SIZES} screen={previewScreens[(activeIndex + n) % dotCount]} />
              </div>
            ))}
            {deck.dir === 'next' && (
              <div key={`out-${activeIndex}`} className="ins-card-stack-out">
                <Screenshot sizes={WEB_SHOT_SIZES} screen={previewScreens[deck.from % dotCount]} />
              </div>
            )}
          </div>
        )}
        <div
          key={`inset-${activeIndex}`}
          ref={deckSwipe ? trackRef : undefined}
          className={`ins-web-card-inset ${deck.dir ? `deal-${deck.dir}` : ''}`}
          {...deckProps}
        >
          <Link href={href} className="ins-web-card-link" aria-label={app.name}>
            {activeScreen ? (
              <Screenshot sizes={WEB_SHOT_SIZES} screen={activeScreen} />
            ) : (
              <AppLogo app={app} size={96} />
            )}
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