'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Pattern, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { DownloadIcon, ExternalIcon } from './Icons';
import { SaveButton } from './SaveButton';
import { Screenshot } from './Screenshot';
import { useToast } from './Toast';

/** 9.2 → "0:09", for the moment in a recording a screen was seen. */
function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The mounted flag never changes after hydration, so nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

/**
 * Figma's "screen-preview-modal" (node 1163:51825): the app's other screens
 * as a filmstrip on the left, full metadata on the right. Opened from a
 * screen card in the Explore grid instead of navigating to the full detail
 * page. Same overlay conventions as ScreenLightbox/FlowPreview (portal,
 * backdrop, Escape, focus trap, body scroll lock); the backdrop itself
 * reuses .ins-search-overlay, the same one GlobalSearch renders behind its
 * own modal, rather than a one-off copy of the same rules.
 */
export function ScreenPreviewModal({ screen, app, onClose }: { screen: Screen; app: App | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const { show } = useToast();

  const [screens, setScreens] = useState<Screen[]>([screen]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  // Figma's two states for this area (node 1163:53073): "single-screen" (one
  // screenshot, centered) is the default; "Show all screens" switches to
  // "multi-screen" (the full filmstrip) without leaving the modal, and the
  // same button (now reading "Individual screens") switches back.
  const [multiScreen, setMultiScreen] = useState(false);
  // Tracked by id, not index: `screens` starts as just [screen] and is
  // replaced once siblings load, so the id (which never changes) is what
  // single-screen mode should stay pinned to — the index into the current
  // `screens` array is then a plain derived value, not state that needs an
  // effect to keep in sync with it.
  const [activeId, setActiveId] = useState(screen.id);
  const activeIndex = Math.max(0, screens.findIndex((s) => s.id === activeId));

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => {
    let cancelled = false;
    if (app) {
      // inspirationsApi.listScreens's own "curated" sort (what fetchSiblings
      // calls) isn't the same ordering as the app's own manifest — it's the
      // one .ins-tabpanel.ins-shot-panel's "Screens" tab uses, fetched via
      // getApp, which is why that tab starts at the splash screen and this
      // modal didn't. Matching that call gets the same true flow order.
      void inspirationsApi.getApp(app.slug).then((data) => {
        if (!cancelled && data?.screens.length) setScreens(data.screens);
      });
    }
    void inspirationsApi.getScreen(screen.id).then((data) => {
      if (!cancelled && data) setPatterns(data.patterns);
    });
    return () => {
      cancelled = true;
    };
  }, [app, screen.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  // Bring the screen that was actually clicked into view once multi-screen
  // mode's real filmstrip has mounted.
  useEffect(() => {
    if (!multiScreen) return;
    const node = filmRef.current;
    const target = node?.querySelector<HTMLElement>(`[data-screen-id="${screen.id}"]`);
    target?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [screens, screen.id, multiScreen]);

  const updateScrollState = () => {
    const node = filmRef.current;
    if (!node) return;
    setAtStart(node.scrollLeft <= 1);
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 1);
  };

  useEffect(updateScrollState, [screens, multiScreen]);

  const scrollByStep = (dir: 1 | -1) => filmRef.current?.scrollBy({ left: dir * 284, behavior: 'smooth' });
  const stepSingle = (dir: 1 | -1) => {
    const next = screens[Math.min(Math.max(activeIndex + dir, 0), screens.length - 1)];
    if (next) setActiveId(next.id);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${INSPIRATIONS_ROUTES.screen(screen)}`);
      show('Link copied');
    } catch {
      show('Copy not available');
    }
    setMoreOpen(false);
  };

  if (!mounted) return null;

  const recording =
    screen.capture && screen.capture.atSeconds !== null ? (
      <>
        {formatClock(screen.capture.atSeconds)}
        {screen.capture.holdSeconds !== null && ` · held ${screen.capture.holdSeconds}s`}
        {(screen.capture.visits ?? 1) > 1 && ` · seen ${screen.capture.visits}×`}
      </>
    ) : null;

  return createPortal(
    <div className="ins-search-overlay" role="presentation" onClick={onClose}>
      <div
        className="ins-screen-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${screen.name}${app ? ` — ${app.name}` : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ins-screen-preview-main">
          <div className="ins-screen-preview-head">
            <div className="ins-screen-preview-head-app">
              {app && (
                <Link href={INSPIRATIONS_ROUTES.app(app)} aria-label={app.name}>
                  <AppLogo app={app} size={40} className="ins-screen-preview-head-logo" />
                </Link>
              )}
              <div className="ins-screen-preview-head-title">
                {app && <span>{app.name}</span>}
                {app && <span className="ins-screen-preview-head-sep">/</span>}
                <span>{SCREEN_TYPE_LABEL[screen.screenType]}</span>
              </div>
            </div>
            <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={onClose}>
              <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
            </button>
          </div>

          <div className="ins-screen-preview-filmstrip-wrap">
            {multiScreen ? (
              <div className="ins-screen-preview-filmstrip" ref={filmRef} onScroll={updateScrollState}>
                {screens.map((s) => (
                  <div key={s.id} className="ins-screen-preview-shot" data-screen-id={s.id}>
                    <Screenshot screen={s} priority={s.id === screen.id} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single">
                <div className="ins-screen-preview-shot" data-screen-id={screens[activeIndex]?.id ?? screen.id}>
                  <Screenshot screen={screens[activeIndex] ?? screen} priority />
                </div>
              </div>
            )}
            {screens.length > 1 && (
              <>
                <button
                  type="button"
                  className="ins-card-control ins-card-control--prev ins-screen-preview-nav ins-screen-preview-nav--prev"
                  aria-label="Previous screen"
                  onClick={() => (multiScreen ? scrollByStep(-1) : stepSingle(-1))}
                  disabled={multiScreen ? atStart : activeIndex === 0}
                >
                  <img src="/ASSET/Icons/Motvin/previous-arrow.svg" alt="" width={24} height={18} />
                </button>
                <button
                  type="button"
                  className="ins-card-control ins-screen-preview-nav ins-screen-preview-nav--next"
                  aria-label="Next screen"
                  onClick={() => (multiScreen ? scrollByStep(1) : stepSingle(1))}
                  disabled={multiScreen ? atEnd : activeIndex === screens.length - 1}
                >
                  <img src="/ASSET/Icons/Motvin/next-arrow.svg" alt="" width={24} height={18} />
                </button>
              </>
            )}
          </div>

          <div className="ins-screen-preview-foot">
            <div className="ins-screen-preview-foot-tags">
              <span className="ins-screen-preview-foot-tag">{INDUSTRY_LABEL[screen.industry]}</span>
              <span className="ins-screen-preview-foot-tag">{PLATFORM_LABEL[screen.platform]}</span>
            </div>
            <div className="ins-screen-preview-foot-primary">
              <SaveButton type="screen" id={screen.id} variant="button" className="ins-screen-preview-foot-btn ins-screen-preview-foot-btn--save" />
              {app?.website && (
                <a className="ins-screen-preview-foot-btn" href={app.website} target="_blank" rel="noopener noreferrer">
                  <img src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={18} height={16} />
                  View in App Store
                </a>
              )}
            </div>
            <div className="ins-screen-preview-foot-secondary">
              {screens.length > 1 && (
                <button
                  type="button"
                  className="ins-screen-preview-foot-btn"
                  aria-pressed={multiScreen}
                  onClick={() => setMultiScreen((v) => !v)}
                >
                  {multiScreen ? (
                    <img src="/ASSET/Icons/Motvin/indiviudal-screen.svg" alt="" width={20} height={20} />
                  ) : (
                    <img src="/ASSET/Icons/Motvin/show-all-screens.svg" alt="" width={20} height={20} />
                  )}
                  {multiScreen ? 'Individual screens' : 'Show all screens'}
                </button>
              )}
              <div className="ins-popwrap">
                <button
                  type="button"
                  className="ins-screen-preview-foot-more"
                  aria-label="More actions"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  onClick={() => setMoreOpen((o) => !o)}
                >
                  <img src="/ASSET/Icons/Motvin/detail-menu.svg" alt="" width={16} height={16} />
                </button>
                {moreOpen && (
                  <div className="ins-popover ins-popover--right" role="menu" onMouseLeave={() => setMoreOpen(false)}>
                    <button type="button" className="ins-popover-item" role="menuitem" onClick={() => void copyLink()}>
                      <ExternalIcon size={14} /> <span>Copy link</span>
                    </button>
                    {screen.downloadable && (
                      <a className="ins-popover-item" role="menuitem" href={inspirationsApi.downloadUrl(screen)} download>
                        <DownloadIcon size={14} /> <span>Download</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="ins-screen-preview-details">
          <div className="ins-screen-preview-details-head">
            <h2>Details</h2>
          </div>
          <div className="ins-screen-preview-details-body">
            {app && (
              <div className="ins-screen-preview-details-row">
                <dt className="ins-screen-preview-details-term">App</dt>
                <dd className="ins-screen-preview-details-value ins-screen-preview-details-value--linked">
                  <Link href={INSPIRATIONS_ROUTES.app(app)}>{app.name}</Link>
                </dd>
              </div>
            )}
            <div className="ins-screen-preview-details-row">
              <dt className="ins-screen-preview-details-term">Platform</dt>
              <dd className="ins-screen-preview-details-value ins-screen-preview-details-value--linked">
                <Link href={`${INSPIRATIONS_ROUTES.screens}?platform=${screen.platform}`}>{PLATFORM_LABEL[screen.platform]}</Link>
              </dd>
            </div>
            <div className="ins-screen-preview-details-row">
              <dt className="ins-screen-preview-details-term">Screen type</dt>
              <dd className="ins-screen-preview-details-value ins-screen-preview-details-value--linked">
                <Link href={`${INSPIRATIONS_ROUTES.screens}?type=${screen.screenType}`}>{SCREEN_TYPE_LABEL[screen.screenType]}</Link>
              </dd>
            </div>
            <div className="ins-screen-preview-details-row">
              <dt className="ins-screen-preview-details-term">Industry</dt>
              <dd className="ins-screen-preview-details-value ins-screen-preview-details-value--linked">
                <Link href={`${INSPIRATIONS_ROUTES.screens}?industry=${screen.industry}`}>{INDUSTRY_LABEL[screen.industry]}</Link>
              </dd>
            </div>
            {recording && (
              <div className="ins-screen-preview-details-row">
                <dt className="ins-screen-preview-details-term">In recording</dt>
                <dd className="ins-screen-preview-details-value">{recording}</dd>
              </div>
            )}
            {screen.style.length > 0 && (
              <div className="ins-screen-preview-details-row">
                <dt className="ins-screen-preview-details-term">Style</dt>
                <dd className="ins-screen-preview-details-value">{screen.style.map((s) => STYLE_LABEL[s]).join(', ')}</dd>
              </div>
            )}
            <div className="ins-screen-preview-details-row">
              <dt className="ins-screen-preview-details-term">Size</dt>
              <dd className="ins-screen-preview-details-value">
                {screen.width} × {screen.height}
              </dd>
            </div>
            {patterns.length > 0 && (
              <div className="ins-screen-preview-details-row">
                <dt className="ins-screen-preview-details-term">Patterns</dt>
                <dd className="ins-screen-preview-details-value ins-screen-preview-details-tags">
                  {patterns.map((p) => (
                    <Link key={p.id} href={INSPIRATIONS_ROUTES.pattern(p)} className="ins-screen-preview-details-tag">
                      {p.name}
                    </Link>
                  ))}
                </dd>
              </div>
            )}

            {screen.source.attribution && (
              <div className="ins-screen-preview-details-row">
                <dt className="ins-screen-preview-details-term">Credit</dt>
                <dd className="ins-screen-preview-details-value">{screen.source.attribution}</dd>
              </div>
            )}
            <div className="ins-screen-preview-details-row">
              <dt className="ins-screen-preview-details-term">Reuse</dt>
              <dd className="ins-screen-preview-details-value">{screen.downloadable ? 'Permitted' : 'View only'}</dd>
            </div>
            {screen.capturedAt && (
              <div className="ins-screen-preview-details-row">
                <dt className="ins-screen-preview-details-term">Captured</dt>
                <dd className="ins-screen-preview-details-value">{screen.capturedAt.slice(0, 10)}</dd>
              </div>
            )}
            {screen.tags.length > 0 && (
              <div className="ins-screen-preview-details-row">
                <dt className="ins-screen-preview-details-term">Tags</dt>
                <dd className="ins-screen-preview-details-value ins-screen-preview-details-tags">
                  {screen.tags.map((t) => (
                    <Link key={t} href={INSPIRATIONS_ROUTES.searchFor(t)} className="ins-screen-preview-details-tag">
                      #{t}
                    </Link>
                  ))}
                </dd>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
