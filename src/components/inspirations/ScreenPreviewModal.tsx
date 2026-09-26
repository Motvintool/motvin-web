'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from '@/lib/inspirations/taxonomy';
import type { Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { DownloadIcon, ExternalIcon } from './Icons';
import { SaveButton } from './SaveButton';
import { Screenshot } from './Screenshot';
import { ScreenLightbox } from './ScreenLightbox';
import { useToast } from './Toast';
import { useAsync } from './useAsync';

/** Search-param name that opens the overlay — see FLOW_PARAM in FlowPreview.tsx. */
export const SCREEN_PARAM = 'screen';

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
 * Reads `?screen=<id>` off the current URL and renders the preview over
 * whatever page is showing, same convention as FlowPreview/FLOW_PARAM: the
 * card that opens it just links to `?screen=<id>` (see ScreenCard.tsx), so
 * the preview is linkable, Back closes it, and the gallery underneath
 * survives untouched.
 */
export function ScreenPreviewOverlay() {
  const params = useSearchParams();
  const screenId = params.get(SCREEN_PARAM);
  if (!screenId) return null;
  return <ScreenPreviewModal screenId={screenId} />;
}

/**
 * Figma's "screen-preview-modal" (node 1163:51825): the app's other screens
 * as a filmstrip on the left, full metadata on the right. Same overlay
 * conventions as ScreenLightbox/FlowPreview (portal, backdrop, Escape, focus
 * trap, body scroll lock); the backdrop itself reuses .ins-search-overlay,
 * the same one GlobalSearch renders behind its own modal, rather than a
 * one-off copy of the same rules.
 */
function ScreenPreviewModal({ screenId }: { screenId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const closeRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const { show } = useToast();

  const { data, loading } = useAsync(() => inspirationsApi.getScreen(screenId), `screen-preview:${screenId}`);
  const screen = data?.screen ?? null;
  const app = data?.app ?? null;
  const patterns = data?.patterns ?? [];

  const [siblingScreens, setSiblingScreens] = useState<Screen[]>([]);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  // Figma's two states for this area (node 1163:53073): "single-screen" (one
  // screenshot, centered) is the default; "Nearby screens" switches to
  // "multi-screen" (the full filmstrip) without leaving the modal, and the
  // same button (now reading "Individual screen") switches back.
  const [multiScreen, setMultiScreen] = useState(false);
  const [activeId, setActiveId] = useState(screenId);
  const [zoomScreen, setZoomScreen] = useState<Screen | null>(null);

  // A different `?screen=` (a fresh open, or a shared link) starts over
  // rather than carrying across the last screen's filmstrip mode, scroll
  // position or zoom state.
  const [seenId, setSeenId] = useState(screenId);
  if (seenId !== screenId) {
    setSeenId(screenId);
    setSiblingScreens([]);
    setActiveId(screenId);
    setMultiScreen(false);
    setMoreOpen(false);
    setZoomScreen(null);
  }

  // `siblingScreens` starts empty until the app's full flow-ordered list
  // loads; until then this is just the one screen that was opened. Memoized
  // so effects keyed on it (filmstrip scroll-into-view, the keydown
  // shortcuts) don't re-fire on every render — an unmemoized `[screen]`
  // literal is a new array each time, which previously fought a user's
  // manual filmstrip scroll by re-triggering scrollIntoView on any unrelated
  // re-render (e.g. typing in the save-to-collection input).
  const screens = useMemo(
    () => (screen && siblingScreens.length === 0 ? [screen] : siblingScreens),
    [screen, siblingScreens],
  );
  const activeIndex = Math.max(0, screens.findIndex((s) => s.id === activeId));

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete(SCREEN_PARAM);
    const qs = sp.toString();
    // back() keeps history tidy when the overlay was opened from this page;
    // replace() covers arriving here from a shared link.
    if (window.history.length > 1) router.back();
    else router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    let cancelled = false;
    if (app) {
      // inspirationsApi.listScreens's own "curated" sort (what fetchSiblings
      // calls) isn't the same ordering as the app's own manifest — it's the
      // one .ins-tabpanel.ins-shot-panel's "Screens" tab uses, fetched via
      // getApp, which is why that tab starts at the splash screen and this
      // modal didn't. Matching that call gets the same true flow order.
      void inspirationsApi.getApp(app.slug).then((data) => {
        if (!cancelled && data?.screens.length) setSiblingScreens(data.screens);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [app]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The lightbox has its own Escape handler when it's the thing on top;
        // let that own the key instead of also closing the preview under it.
        if (zoomScreen) return;
        e.preventDefault();
        close();
        return;
      }
      if (zoomScreen) return;
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;
      if (e.key === 'ArrowLeft' && screens.length > 1) {
        e.preventDefault();
        if (multiScreen) filmRef.current?.scrollBy({ left: -284, behavior: 'smooth' });
        else setActiveId((id) => {
          const i = Math.max(0, screens.findIndex((s) => s.id === id));
          return screens[Math.max(i - 1, 0)]?.id ?? id;
        });
        return;
      }
      if (e.key === 'ArrowRight' && screens.length > 1) {
        e.preventDefault();
        if (multiScreen) filmRef.current?.scrollBy({ left: 284, behavior: 'smooth' });
        else setActiveId((id) => {
          const i = Math.max(0, screens.findIndex((s) => s.id === id));
          return screens[Math.min(i + 1, screens.length - 1)]?.id ?? id;
        });
        return;
      }
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        saveBtnRef.current?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, screens, multiScreen, zoomScreen]);

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
    if (!multiScreen || !screen) return;
    const node = filmRef.current;
    const target = node?.querySelector<HTMLElement>(`[data-screen-id="${screen.id}"]`);
    target?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [screens, screen, multiScreen]);

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

  if (!mounted) return null;

  if (loading || !screen) {
    // Not found (or the request failed): don't leave a dead spinner up.
    if (!loading && !screen) {
      close();
      return null;
    }
    return createPortal(
      <div className="ins-search-overlay" role="presentation" onClick={close}>
        <div
          className="ins-screen-preview-modal ins-screen-preview-modal--loading"
          role="dialog"
          aria-modal="true"
          aria-label="Loading screen"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="ins-spinner" />
        </div>
      </div>,
      document.body,
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${pathname}?${SCREEN_PARAM}=${screen.id}`);
      show('Link copied');
    } catch {
      show('Copy not available');
    }
    setMoreOpen(false);
  };

  const recording =
    screen.capture && screen.capture.atSeconds !== null ? (
      <>
        {formatClock(screen.capture.atSeconds)}
        {screen.capture.holdSeconds !== null && ` · held ${screen.capture.holdSeconds}s`}
        {(screen.capture.visits ?? 1) > 1 && ` · seen ${screen.capture.visits}×`}
      </>
    ) : null;

  return createPortal(
    <>
      <div className="ins-search-overlay" role="presentation" onClick={close}>
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
              <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
                <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
              </button>
            </div>

            <div className="ins-screen-preview-filmstrip-wrap">
              {multiScreen ? (
                <div className="ins-screen-preview-filmstrip" ref={filmRef} onScroll={updateScrollState}>
                  {screens.map((s) => (
                    <div
                      key={s.id}
                      className="ins-screen-preview-shot"
                      data-screen-id={s.id}
                      onClick={() => setZoomScreen(s)}
                    >
                      <Screenshot screen={s} priority={s.id === screen.id} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single">
                  <div
                    className="ins-screen-preview-shot"
                    data-screen-id={screens[activeIndex]?.id ?? screen.id}
                    onClick={() => setZoomScreen(screens[activeIndex] ?? screen)}
                  >
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
                <SaveButton
                  ref={saveBtnRef}
                  type="screen"
                  id={screen.id}
                  variant="button"
                  app={app ?? undefined}
                  className="ins-screen-preview-foot-btn ins-screen-preview-foot-btn--save"
                />
                <a
                  className="ins-screen-preview-foot-btn"
                  href={app?.website || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={18} height={16} />
                  View in App Store
                </a>
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
                    {multiScreen ? 'Individual screen' : 'Nearby screens'}
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
      </div>
      {zoomScreen && <ScreenLightbox screen={zoomScreen} onClose={() => setZoomScreen(null)} />}
    </>,
    document.body,
  );
}
