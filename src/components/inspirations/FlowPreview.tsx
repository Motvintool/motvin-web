'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { storeAction } from '@/lib/inspirations/storeAction';
import { flowCategoryLabel, PLATFORM_LABEL, screenTypeLabel } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { ExternalIcon } from './Icons';
import { SaveButton } from './SaveButton';
import { Screenshot } from './Screenshot';
import { ScreenLightbox } from './ScreenLightbox';
import { useToast } from './Toast';
import { useAsync } from './useAsync';

/** Search-param name that opens the overlay — see SCREEN_PARAM in ScreenPreviewModal.tsx. */
export const FLOW_PARAM = 'flow';

/** How long each step shows while the flow plays. */
const STEP_MS = 2600;

/** "Login" for a step's label; a screen with no real type falls back to its own name. */
function stepLabel(screen: Screen): string {
  return screen.screenType && screen.screenType !== 'other' ? screenTypeLabel(screen.screenType) : screen.name;
}

/** The mounted flag never changes after hydration, so nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

/**
 * Reads `?flow=<id>` off the current URL and renders the preview over
 * whatever page is showing — same convention as ScreenPreviewOverlay/
 * SCREEN_PARAM: a flow row just links to `?flow=<id>` (see FlowsBrowser.tsx,
 * FlowList.tsx), so the preview is linkable, Back closes it, and the gallery
 * underneath survives untouched.
 */
export function FlowPreview() {
  const params = useSearchParams();
  const flowId = params.get(FLOW_PARAM);
  if (!flowId) return null;
  return <FlowPreviewModal flowId={flowId} />;
}

/**
 * ScreenPreviewModal's own layout (head/filmstrip/foot, single ⇄ multi
 * screen toggle, click-to-zoom), reused here for a whole flow instead of one
 * screen and its app siblings — deliberately sharing its classes rather than
 * a parallel set, since the two are meant to look and behave like the same
 * kind of dialog. No Details panel: a flow's own metadata is thin enough
 * (category, platform, step count) that the two-tag footer row says all of
 * it already.
 */
function FlowPreviewModal({ flowId }: { flowId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const closeRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const { show } = useToast();

  const { data, loading } = useAsync(() => inspirationsApi.getFlow(flowId), `flow-preview:${flowId}`);
  const flow = data?.flow ?? null;
  const app = data?.app ?? null;
  const screens = useMemo(() => data?.screens ?? [], [data]);

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  // Same two states as ScreenPreviewModal's own toggle: "single-screen" (one
  // step, centered) is the default; "Nearby screens" switches to the full
  // filmstrip of every step, and the same button (now reading "Individual
  // screen") switches back.
  const [multiScreen, setMultiScreen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomScreen, setZoomScreen] = useState<Screen | null>(null);
  // The player: steps through the flow on its own, one step every STEP_MS.
  const [playing, setPlaying] = useState(false);

  // A different `?flow=` (a fresh open, or a shared link) starts over rather
  // than carrying across the last flow's filmstrip mode, step, or zoom state.
  const [seenId, setSeenId] = useState(flowId);
  if (seenId !== flowId) {
    setSeenId(flowId);
    setActiveIndex(0);
    setMultiScreen(false);
    setMoreOpen(false);
    setZoomScreen(null);
    setPlaying(false);
  }

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete(FLOW_PARAM);
    const qs = sp.toString();
    // back() keeps history tidy when the overlay was opened from this page;
    // replace() covers arriving here from a shared link.
    if (window.history.length > 1) router.back();
    else router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const lastIndex = screens.length - 1;
  // Play from the top again once the flow has reached its last step.
  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setActiveIndex((i) => (i >= lastIndex ? 0 : i));
    setPlaying(true);
  }, [playing, lastIndex]);

  // While playing: move on after STEP_MS, and stop once the last step has had
  // its turn. Stepping by hand restarts the wait for the new step. The filmstrip
  // view and the zoomed lightbox pause it.
  const playerPaused = !playing || multiScreen || Boolean(zoomScreen) || screens.length < 2;
  useEffect(() => {
    if (playerPaused) return;
    const timer = window.setTimeout(() => {
      if (activeIndex >= lastIndex) setPlaying(false);
      else setActiveIndex(activeIndex + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playerPaused, activeIndex, lastIndex]);

  // Fetch the next step's screenshot ahead of time so playing never flashes blank.
  useEffect(() => {
    const next = screens[activeIndex + 1];
    const src = next ? inspirationsApi.mediaUrl(next.url) : null;
    if (src) new Image().src = src;
  }, [screens, activeIndex]);

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
        else setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'ArrowRight' && screens.length > 1) {
        e.preventDefault();
        if (multiScreen) filmRef.current?.scrollBy({ left: 284, behavior: 'smooth' });
        else setActiveIndex((i) => Math.min(i + 1, screens.length - 1));
        return;
      }
      if (!multiScreen && screens.length > 1) {
        if (e.key === ' ') {
          // Also keeps Space from pressing whichever button has focus.
          e.preventDefault();
          togglePlay();
          return;
        }
        if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          setActiveIndex(e.key === 'Home' ? 0 : screens.length - 1);
          return;
        }
      }
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        saveBtnRef.current?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, screens.length, multiScreen, zoomScreen, togglePlay]);

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

  const updateScrollState = () => {
    const node = filmRef.current;
    if (!node) return;
    setAtStart(node.scrollLeft <= 1);
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 1);
  };

  useEffect(updateScrollState, [screens.length, multiScreen]);

  const scrollByStep = (dir: 1 | -1) => filmRef.current?.scrollBy({ left: dir * 284, behavior: 'smooth' });
  const stepSingle = (dir: 1 | -1) => setActiveIndex((i) => Math.min(Math.max(i + dir, 0), screens.length - 1));

  if (!mounted) return null;

  if (loading || !flow) {
    // Not found (or the request failed): don't leave a dead spinner up.
    if (!loading && !flow) {
      close();
      return null;
    }
    return createPortal(
      <div className="ins-search-overlay" role="presentation" onClick={close}>
        <div
          className="ins-screen-preview-modal ins-screen-preview-modal--loading"
          role="dialog"
          aria-modal="true"
          aria-label="Loading flow"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="ins-spinner" />
        </div>
      </div>,
      document.body,
    );
  }

  const active = screens[activeIndex] ?? screens[0];

  const store = storeAction(flow.platform, app?.website);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${pathname}?${FLOW_PARAM}=${flow.id}`);
      show('Link copied');
    } catch {
      show('Copy not available');
    }
    setMoreOpen(false);
  };

  return createPortal(
    <>
      <div className="ins-search-overlay" role="presentation" onClick={close}>
        <div
          className="ins-screen-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${flow.name}${app ? ` — ${app.name}` : ''}`}
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
                  <span>{flow.name}</span>
                </div>
              </div>
              <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
                <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
              </button>
            </div>

            <div className="ins-screen-preview-filmstrip-wrap">
              {screens.length === 0 ? (
                <p className="ins-muted">This flow has no published screens.</p>
              ) : multiScreen ? (
                <div className="ins-screen-preview-filmstrip" ref={filmRef} onScroll={updateScrollState}>
                  {screens.map((s, i) => (
                    <div
                      key={s.id}
                      className={`ins-screen-preview-shot ${isDesktopPlatform(s.platform) ? 'ins-screen-preview-shot--web' : ''}`}
                      data-screen-id={s.id}
                      onClick={() => setZoomScreen(s)}
                    >
                      <Screenshot screen={s} priority={i === activeIndex} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single">
                  <div
                    className={`ins-screen-preview-shot ${isDesktopPlatform(active?.platform) ? 'ins-screen-preview-shot--web' : ''}`}
                    data-screen-id={active?.id}
                    onClick={() => active && setZoomScreen(active)}
                  >
                    {active && <Screenshot screen={active} priority />}
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

            {!multiScreen && screens.length > 1 && (
              <div className="ins-flow-player">
                <button
                  type="button"
                  className="ins-flow-player-play"
                  aria-label={playing ? 'Pause flow' : 'Play flow'}
                  aria-pressed={playing}
                  onClick={togglePlay}
                >
                  {playing ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                      <rect x="2.5" y="2" width="3.2" height="10" rx="1" />
                      <rect x="8.3" y="2" width="3.2" height="10" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                      <path d="M4 2.6c0-.8.86-1.28 1.53-.86l6.1 3.9a1 1 0 010 1.7l-6.1 3.9A1 1 0 014 10.4V2.6z" />
                    </svg>
                  )}
                </button>
                <div
                  className={`ins-flow-player-steps ${playerPaused ? '' : 'is-playing'} ${screens.length > 16 ? 'is-dense' : ''}`}
                  role="group"
                  aria-label="Flow steps"
                  style={{ '--ins-flow-step-ms': `${STEP_MS}ms` } as CSSProperties}
                >
                  {screens.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`ins-flow-player-step ${i < activeIndex ? 'is-done' : ''} ${i === activeIndex ? 'is-current' : ''}`}
                      aria-label={`Step ${i + 1}: ${stepLabel(s)}`}
                      aria-current={i === activeIndex ? 'step' : undefined}
                      onClick={() => setActiveIndex(i)}
                    >
                      {/* Keyed on the step so its fill restarts each time it becomes current. */}
                      <span key={i === activeIndex ? `on-${activeIndex}-${playerPaused}` : 'off'} />
                    </button>
                  ))}
                </div>
                <p className="ins-flow-player-label" aria-live="polite">
                  <b>
                    {activeIndex + 1} of {screens.length}
                  </b>
                  {active && <> · {stepLabel(active)}</>}
                </p>
              </div>
            )}

            <div className="ins-screen-preview-foot">
              <div className="ins-screen-preview-foot-tags">
                <span className="ins-screen-preview-foot-tag">{flowCategoryLabel(flow.category)}</span>
                <span className="ins-screen-preview-foot-tag">{PLATFORM_LABEL[flow.platform] ?? flow.platform}</span>
              </div>
              <div className="ins-screen-preview-foot-primary">
                <SaveButton
                  ref={saveBtnRef}
                  type="flow"
                  id={flow.id}
                  variant="button"
                  app={app ?? undefined}
                  className="ins-screen-preview-foot-btn ins-screen-preview-foot-btn--save"
                />
                {store && (
                  <a className="ins-screen-preview-foot-btn" href={store.href} target="_blank" rel="noopener noreferrer">
                    <img src={store.icon} alt="" width={18} height={16} />
                    {store.label}
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
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {zoomScreen && <ScreenLightbox screen={zoomScreen} onClose={() => setZoomScreen(null)} />}
    </>,
    document.body,
  );
}
