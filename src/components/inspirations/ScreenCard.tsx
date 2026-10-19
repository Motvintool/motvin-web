'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { memo, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

import type { App, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { SCREEN_PARAM } from './ScreenPreviewModal';
import { Screenshot } from './Screenshot';
import { useScreenContextMenu } from './useScreenContextMenu';
import { CloseIcon } from './Icons';

/** A plain left-click with no modifier opens the preview modal in place;
 * anything else (middle-click, cmd/ctrl-click, shift-click) is the visitor
 * asking for the real link behaviour (new tab, etc.), so it's left alone. */
function isPlainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

const NAME_TAGLINE_SEPARATOR = ' — ';

/** How long each screen shows while a Prototype card plays on its own. */
const PROTO_STEP_MS = 1400;
const NO_SCREENS: Screen[] = [];

/** The Prototype card's hover hand (Material's touch-app hand), its fingertip on the button's centre. */
const HAND_PATH =
  'M18.84 15.87l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z';
const HAND_TRANSFORM = 'translate(24 24) rotate(-30) scale(1.9) translate(-11.5 -6.2)';

/**
 * The Prototype card's own playback: the index of the screen it shows, and
 * whether the card is on screen. Its timer bar (`.ins-card-proto-timer`)
 * paces it: each step moves on when the bar fills, and the bar holds while
 * the card is hovered, focused or scrolled away, and isn't there with
 * reduced motion — so the reel holds exactly where the bar does. `prev` is
 * the screen it just left (null before the first step), kept under the
 * next one as that fades in.
 */
function usePrototypeReel(cardRef: React.RefObject<HTMLElement | null>, count: number) {
  const [frames, setFrames] = useState<{ step: number; prev: number | null }>({ step: 0, prev: null });
  const setStep = (next: number) => setFrames((f) => ({ step: next, prev: f.step }));
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || count < 2) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [cardRef, count]);
  return {
    step: count ? frames.step % count : 0,
    prev: count && frames.prev !== null ? frames.prev % count : null,
    inView,
    setStep,
  };
}


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
  prototype,
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
  /** This card plays the app as a prototype: a badge, and a click opens the flow player at `href` (ScreenGrid). */
  prototype?: { href: string; label: string; screens?: Screen[] };
}) {
  const shownScreen = screen;
  const cardRef = useRef<HTMLElement>(null);
  const handCutId = `ins-hand-cut-${useId().replace(/:/g, '')}`;
  const reelScreens = prototype?.screens ?? NO_SCREENS;
  const reelCount = reelScreens.length;
  const { step: reelStep, prev: reelPrev, inView: reelInView, setStep: setReelStep } = usePrototypeReel(cardRef, reelCount);
  // Once it has moved on, the screen showing and the one it left under it — never the first card's own shot showing through.
  const reelScreen = reelPrev !== null ? reelScreens[reelStep] : null;
  const reelUnder = reelPrev !== null ? reelScreens[reelPrev] : null;
  // The next screenshot loads while this one shows, so stepping never flashes blank.
  const reelNext = reelCount > 1 ? reelScreens[(reelStep + 1) % reelCount] : null;
  useEffect(() => {
    const src = reelInView && reelNext ? inspirationsApi.mediaUrl(reelNext.url) : null;
    if (src) new Image().src = src;
  }, [reelInView, reelNext]);
  // The timer bar filled: on to the next screen once it has loaded (past it if it can't).
  const advanceReel = () => {
    const next = (reelStep + 1) % reelCount;
    const src = inspirationsApi.mediaUrl(reelScreens[next].url);
    if (!src) return setReelStep(next);
    const img = new Image();
    img.onload = () => setReelStep(next);
    img.onerror = () => setReelStep((next + 1) % reelCount);
    img.src = src;
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected) {
      onToggleSelect?.();
    }
  };

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** Adds `?screen=<id>` to the current URL (see SCREEN_PARAM in
   * ScreenPreviewModal.tsx), so the preview is linkable, Back closes it, and
   * the grid and its filters underneath survive. Used as both the card's
   * real `href` (a modifier-clicked or middle-clicked card opens it in a new
   * tab, still landing on the same overlay) and, for a plain click,
   * `openPreview` pushes it in place without a full navigation. */
  const href = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(SCREEN_PARAM, shownScreen.id);
    return `${pathname}?${sp.toString()}`;
  })();
  const openPreview = () => {
    router.push(prototype?.href ?? href, { scroll: false });
  };

  // Right-click on the shot: Copy PNG, Download PNG, Copy link (guests get the sign-in notice).
  const shotMenu = useScreenContextMenu(shownScreen, app, () => new URL(href, window.location.origin).toString());

  const { title: appTitle, tagline: derivedTagline } = app ? splitAppName(app.name) : { title: '', tagline: null };
  const appDescription = app?.tagline || derivedTagline;

  return (
    // A screen tagged Dark gets the dark hover footer (fades to near-black,
    // light text) so the overlay blends into the screenshot instead of a
    // white wash over it.
    <article
      ref={cardRef}
      className={`ins-card ${selected ? 'is-selected' : ''} ${shownScreen.style?.includes('dark') ? 'is-dark-shot' : ''} ${prototype ? 'is-prototype' : ''}`}
      data-id={screen.id}
      role="listitem"
    >
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
            <CloseIcon size={14} />
          </button>
        )}
        <div className="ins-card-inset" onContextMenu={shotMenu.onContextMenu}>
          <Link
            href={prototype?.href ?? href}
            className="ins-card-link"
            aria-label={prototype ? prototype.label : `${shownScreen.name}${app ? ` — ${app.name}` : ''}`}
            prefetch={index !== undefined && index < 10 ? undefined : false}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              openPreview();
            }}
          >
            <Screenshot screen={shownScreen} />
            {prototype && (
              <>
                {/* The reel: the app's screens playing over the first (which keeps the card's size), each fading in over the last. */}
                {reelUnder && <Screenshot key={reelUnder.id} screen={reelUnder} className="ins-card-proto-frame is-under" />}
                {reelScreen && <Screenshot key={reelScreen.id} screen={reelScreen} className="ins-card-proto-frame" />}
                <span className="ins-card-proto-badge" aria-hidden>
                  Prototype
                </span>
                {reelCount > 1 && (
                  // Dark on a light screen, light on a dark one (the screen's own Dark tag), so it shows on both.
                  <span
                    className={`ins-card-proto-timer ${reelInView ? '' : 'is-held'} ${(reelScreens[reelStep] ?? screen).style?.includes('dark') ? '' : 'is-on-light'}`}
                    aria-hidden
                  >
                    <i key={reelStep} style={{ animationDuration: `${PROTO_STEP_MS}ms` }} onAnimationEnd={advanceReel} />
                  </span>
                )}
                {/* Hover: the shot dims and a finger taps a button over "Try the prototype". */}
                <span className="ins-card-proto-hover" aria-hidden>
                  <svg className="ins-card-proto-cue" width="74" height="58" viewBox="-7 5 62 48">
                    {/* The rings are cut a gap wide around the finger, following it as it moves. */}
                    <mask id={handCutId} maskUnits="userSpaceOnUse" x="-12" y="0" width="72" height="64">
                      <rect x="-12" y="0" width="72" height="64" fill="#fff" />
                      <g className="ins-card-proto-hand-cut">
                        <path transform={HAND_TRANSFORM} d={HAND_PATH} fill="#000" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
                      </g>
                    </mask>
                    <g mask={`url(#${handCutId})`}>
                      <circle className="ins-card-proto-ripple" cx="24" cy="24" r="15" />
                      <circle className="ins-card-proto-dot" cx="24" cy="24" r="15" />
                    </g>
                    <g className="ins-card-proto-hand">
                      <path transform={HAND_TRANSFORM} d={HAND_PATH} />
                    </g>
                  </svg>
                  <span className="ins-card-proto-cue-text">Try the prototype</span>
                </span>
              </>
            )}
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
        {!prototype && (
        <div className="ins-card-hover-footer">
          {app && (
            <div className="ins-card-hover-app">
              <AppLogo app={app} size={48} className="ins-card-hover-logo" />
              <div className="ins-card-hover-app-text">
                <p className="ins-card-hover-title">{appTitle}</p>
                {appDescription && <p className="ins-card-hover-tagline">{appDescription}</p>}
              </div>
            </div>
          )}
          <div className="ins-card-hover-actions">
            <button type="button" className="ins-btn-save" onClick={handleSave}>{selected ? 'Saved' : 'Save'}</button>
            <button type="button" className="ins-btn-copy" onClick={(e) => void shotMenu.copyPng(e)}>Copy</button>
          </div>
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
            <Link
              href={href}
              className="ins-card-name"
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                e.preventDefault();
                openPreview();
              }}
            >
              {shownScreen.name}
            </Link>
          )}
        </div>
      )}

      {shotMenu.menu}
    </article>
  );
}

export const ScreenCard = memo(ScreenCardImpl);
