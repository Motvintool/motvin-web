'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStoredValue, writeStoredValue } from '@/hooks/useStoredValue';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { storeAction } from '@/lib/inspirations/storeAction';
import { flowCategoryLabel, PLATFORM_LABEL, screenTypeLabel } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type App, type Platform, type Screen } from '@/lib/inspirations/types';
import type { StoreAction } from '@/lib/inspirations/storeAction';
import { AppLogo } from './AppLogo';
import { AppMenu } from './AppMenu';
import { StoreLinkButton } from './StoreMenuItem';
import { SaveButton } from './SaveButton';
import { Screenshot } from './Screenshot';
import { ScreenLightbox } from './ScreenLightbox';
import { SCREEN_PARAM } from './ScreenPreviewModal';
import { useAsync } from './useAsync';
import { useDownloadAllScreens } from './useDownloadAllScreens';
import { useScreenContextMenu } from './useScreenContextMenu';

/** Search-param name that opens the overlay — see SCREEN_PARAM in ScreenPreviewModal.tsx. */
export const FLOW_PARAM = 'flow';
/** Optional `&step=<screen id>`: open the flow on that step rather than the first. */
const STEP_PARAM = 'step';

/** Present mode's control bar hides after the pointer has been still this long. */
const PRESENT_HUD_MS = 2500;

/** How long each step shows while the flow plays, at 1×. */
const STEP_MS = 2600;

/** The speed button cycles through these; the choice is remembered per viewer. */
const SPEEDS = [1, 1.5, 2, 0.5] as const;
const SPEED_KEY = 'motvin:flow-player-speed';
const parseSpeed = (raw: string | null) => {
  const n = Number(raw);
  return (SPEEDS as readonly number[]).includes(n) ? n : 1;
};

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

  const { data, loading } = useAsync(() => inspirationsApi.getFlow(flowId), `flow-preview:${flowId}`);
  const flow = data?.flow ?? null;
  const app = data?.app ?? null;
  const screens = useMemo(() => data?.screens ?? [], [data]);

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  // Same two states as ScreenPreviewModal's own toggle: "single-screen" (one
  // step, centered) is the default; "Nearby screens" switches to the full
  // filmstrip of every step, and the same button (now reading "Individual
  // screen") switches back.
  const [multiScreen, setMultiScreen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // `&step=` (the screen preview's Flow button): start on that step, once
  // the flow's screens are in.
  const startStep = params.get(STEP_PARAM);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  if (startStep && screens.length > 0 && startedAt !== startStep) {
    setStartedAt(startStep);
    const i = screens.findIndex((s) => s.id === startStep);
    if (i > 0) setActiveIndex(i);
  }
  const [zoomScreen, setZoomScreen] = useState<Screen | null>(null);
  // Right-click on a step's screenshot: the grid card's menu (Copy png,
  // Download png, Copy link) for that screenshot, as in the screen preview,
  // in place of the browser's own "Save image as…". Set up before the early
  // returns below, so the hooks run in the same order.
  const [contextScreenId, setContextScreenId] = useState<string | null>(null);
  const menuScreen = screens.find((s) => s.id === contextScreenId) ?? screens[activeIndex] ?? null;
  const shotMenu = useScreenContextMenu(menuScreen, app, () =>
    `${window.location.origin}${pathname}?${SCREEN_PARAM}=${menuScreen?.id ?? ''}`,
  );
  const onShotContextMenu = (target: Screen) => (e: React.MouseEvent) => {
    setContextScreenId(target.id);
    shotMenu.onContextMenu(e);
  };
  // The step under the pointer on the player's bar, for its preview card (as
  // on the compare view's thumbnails). Kept with `on` false after the pointer
  // leaves, so the card fades out in place; `glide` from one step to the next.
  // `bar` is which bar it belongs to: the footer's, or present mode's.
  const [stepPeek, setStepPeek] = useState<{ bar: string; i: number; x: number; on: boolean; glide: boolean } | null>(null);
  const hideStepPeek = () => setStepPeek((p) => (p && p.on ? { ...p, on: false } : p));
  const showStepPeek = (bar: string, i: number, step: HTMLElement) => {
    const el = step.parentElement;
    if (!el) return;
    const r = step.getBoundingClientRect();
    const x = r.left + r.width / 2 - el.getBoundingClientRect().left;
    setStepPeek((p) => ({ bar, i, x, on: true, glide: Boolean(p?.on && p.bar === bar) }));
  };
  // The player: steps through the flow on its own, one step every STEP_MS ÷ speed.
  const [playing, setPlaying] = useState(false);
  const [speed, refreshSpeed] = useStoredValue(SPEED_KEY, 1, parseSpeed);
  const stepMs = Math.round(STEP_MS / speed);
  const cycleSpeed = () => {
    writeStoredValue(SPEED_KEY, String(SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]));
    refreshSpeed();
  };
  // Present mode: the flow full screen and auto-playing, for screen-sharing.
  // Its small control bar (the HUD) fades out while the pointer is still.
  const [presenting, setPresenting] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimer = useRef<number | undefined>(undefined);
  const presentRef = useRef<HTMLDivElement>(null);

  // A different `?flow=` (a fresh open, or a shared link) starts over rather
  // than carrying across the last flow's filmstrip mode, step, or zoom state.
  const [seenId, setSeenId] = useState(flowId);
  if (seenId !== flowId) {
    setSeenId(flowId);
    setActiveIndex(0);
    setStartedAt(null);
    setMultiScreen(false);
    setZoomScreen(null);
    setPlaying(false);
    setPresenting(false);
  }

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  // Close takes focus once the dialog is drawn, and again when the loaded
  // flow replaces the placeholder (a new Close button) — the open effect
  // runs before either on a fresh page load.
  const flowReady = Boolean(flow) && !loading;
  useEffect(() => {
    if (mounted) closeRef.current?.focus({ preventScroll: true });
  }, [mounted, flowReady]);

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete(FLOW_PARAM);
    sp.delete(STEP_PARAM);
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

  // Shows the HUD, then hides it again after a still moment.
  const pokeHud = useCallback(() => {
    setHudVisible(true);
    window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHudVisible(false), PRESENT_HUD_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(hudTimer.current), []);

  const startPresent = useCallback(() => {
    setMultiScreen(false);
    setZoomScreen(null);
    setActiveIndex((i) => (i >= lastIndex ? 0 : i));
    setPlaying(true);
    setPresenting(true);
    pokeHud();
  }, [lastIndex, pokeHud]);

  const exitPresent = useCallback(() => {
    setPresenting(false);
    setPlaying(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  // Full screen while presenting, where the browser allows it. Leaving full
  // screen the browser's own way (Escape, which then never reaches the page)
  // leaves present mode too.
  useEffect(() => {
    if (!presenting) return;
    presentRef.current?.requestFullscreen?.().catch(() => {});
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        setPresenting(false);
        setPlaying(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, [presenting]);

  // While playing: move on after STEP_MS, and stop once the last step has had
  // its turn. Stepping by hand restarts the wait for the new step. The filmstrip
  // view and the zoomed lightbox pause it.
  const playerPaused = !playing || multiScreen || Boolean(zoomScreen) || screens.length < 2;
  useEffect(() => {
    if (playerPaused) return;
    const timer = window.setTimeout(() => {
      if (activeIndex >= lastIndex) setPlaying(false);
      else setActiveIndex(activeIndex + 1);
    }, stepMs);
    return () => window.clearTimeout(timer);
  }, [playerPaused, activeIndex, lastIndex, stepMs]);

  // Fetch the next step's screenshot ahead of time so playing never flashes blank.
  useEffect(() => {
    const next = screens[activeIndex + 1];
    const src = next ? inspirationsApi.mediaUrl(next.url) : null;
    if (src) new Image().src = src;
  }, [screens, activeIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Present mode owns the keyboard: Escape leaves it (not the dialog),
      // Space plays / pauses, arrows step.
      if (presenting) {
        if (e.key === 'Escape') {
          e.preventDefault();
          exitPresent();
        } else if (e.key === ' ') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setActiveIndex((i) => Math.min(Math.max(i + (e.key === 'ArrowLeft' ? -1 : 1), 0), screens.length - 1));
        }
        pokeHud();
        return;
      }
      if (e.key === 'Escape') {
        // The lightbox has its own Escape handler when it's the thing on top;
        // let that own the key instead of also closing the preview under it.
        // So does the "…" menu while it's open.
        if (zoomScreen || document.querySelector('.ins-screen-preview-modal .ins-appmenu-layer')) return;
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
  }, [close, screens.length, multiScreen, zoomScreen, togglePlay, presenting, exitPresent, pokeHud]);

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
          {/* The loaded player's own layout in placeholder shapes (one wide
              pane: header, the step's screenshot, and the footer's tags,
              player bar, Save and Nearby screens on the same classes), so the
              flow lands in place instead of replacing a spinner. */}
          <div className="ins-screen-preview-main" aria-busy="true">
            <div className="ins-screen-preview-head">
              <div className="ins-screen-preview-head-app">
                <span className="ins-skel ins-preview-skel-logo" />
                <span className="ins-skel ins-skel--line ins-preview-skel-title" />
              </div>
              <div className="ins-flow-head-actions">
                <span className="ins-skel ins-preview-skel-present" />
                <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
                  <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
                </button>
              </div>
            </div>
            <div className="ins-screen-preview-filmstrip-wrap">
              <div className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single">
                <div className="ins-screen-preview-shot ins-preview-skel-shot">
                  <span className="ins-skel" />
                </div>
              </div>
            </div>
            <div className="ins-screen-preview-foot ins-flow-foot" aria-hidden>
              <div className="ins-screen-preview-foot-tags">
                <span className="ins-skel ins-preview-skel-pill" style={{ width: 130 }} />
                <span className="ins-skel ins-preview-skel-pill" style={{ width: 66 }} />
              </div>
              <div className="ins-flow-player ins-flow-player--skel">
                <span className="ins-skel ins-flow-player-skel-play" />
                <span className="ins-skel ins-skel--line ins-flow-player-skel-steps" />
                <span className="ins-skel ins-skel--line ins-flow-player-skel-count" />
                <span className="ins-skel ins-flow-player-skel-speed" />
              </div>
              <div className="ins-screen-preview-foot-primary">
                <span className="ins-skel ins-preview-skel-round" />
              </div>
              <div className="ins-screen-preview-foot-secondary">
                <span className="ins-skel ins-preview-skel-pill ins-preview-skel-nearby" />
                <span className="ins-skel ins-preview-skel-round" />
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const active = screens[activeIndex] ?? screens[0];
  // One segment per step (shared by the footer player and present mode).
  // Hovering a step shows a preview of its screen with its place, "5 / 31"
  // (the compare view's card): above the footer's bar, below present mode's
  // (which runs along the top of the screen).
  const peeked = stepPeek ? screens[stepPeek.i] : undefined;
  const stepBar = (extraClass = '') => {
    const bar = extraClass ? 'present' : 'foot';
    const peek = stepPeek?.bar === bar ? stepPeek : null;
    return (
      <div
        className={`ins-flow-steps ${playerPaused ? '' : 'is-playing'} ${screens.length > 16 ? 'is-dense' : ''} ${extraClass}`}
        role="group"
        aria-label="Flow steps"
        style={{ '--ins-flow-step-ms': `${stepMs}ms` } as CSSProperties}
        onPointerLeave={hideStepPeek}
      >
        {screens.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`ins-flow-step ${i < activeIndex ? 'is-done' : ''} ${i === activeIndex ? 'is-current' : ''}`}
            aria-label={`Step ${i + 1}: ${stepLabel(s)}`}
            aria-current={i === activeIndex ? 'step' : undefined}
            onPointerEnter={(e) => e.pointerType === 'mouse' && showStepPeek(bar, i, e.currentTarget)}
            onFocus={(e) => e.currentTarget.matches(':focus-visible') && showStepPeek(bar, i, e.currentTarget)}
            onBlur={hideStepPeek}
            onClick={() => setActiveIndex(i)}
          >
            {/* Keyed so the fill restarts whenever this step becomes current, pauses or changes speed. */}
            <span key={i === activeIndex ? `on-${activeIndex}-${playerPaused}-${stepMs}` : 'off'} />
          </button>
        ))}
        <div
          className={`ins-compare-peek ins-flow-step-peek ${isDesktopPlatform(flow.platform) ? 'is-web' : ''} ${peek?.on && peeked ? 'is-visible' : ''} ${peek?.glide ? 'is-gliding' : ''}`}
          style={peek ? ({ '--x': `${peek.x}px` } as CSSProperties) : undefined}
          aria-hidden
        >
          {peeked && peek && (
            <>
              <Screenshot key={peeked.id} screen={peeked} />
              <span className="ins-compare-peek-label">
                {peek.i + 1} / {screens.length}
              </span>
            </>
          )}
        </div>
      </div>
    );
  };
  // The player belongs to the one-step view; the filmstrip already shows every step.
  const showPlayer = !multiScreen && screens.length > 1;

  const store = storeAction(flow.platform, app?.website);


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
                  {showPlayer && active && (
                    <span className="ins-flow-head-step">
                      <span className="ins-screen-preview-head-sep">/</span>
                      <span>{stepLabel(active)}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="ins-flow-head-actions">
                {/* Where Figma / Slides keep theirs: top right, beside Close. */}
                {screens.length > 1 && (
                  <button type="button" className="ins-flow-present-open" aria-label="Present flow" onClick={startPresent}>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                      <path d="M4.5 2.6c0-.8.86-1.28 1.53-.86l6.1 3.9a1 1 0 010 1.7l-6.1 3.9a1 1 0 01-1.53-.86V2.6z" />
                    </svg>
                    <span>Present</span>
                  </button>
                )}
                <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
                  <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
                </button>
              </div>
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
                      onContextMenu={onShotContextMenu(s)}
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
                    onContextMenu={active ? onShotContextMenu(active) : undefined}
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

            <div className={`ins-screen-preview-foot ${showPlayer ? 'ins-flow-foot' : ''}`}>
              <div className="ins-screen-preview-foot-tags">
                <span className="ins-screen-preview-foot-tag">{flowCategoryLabel(flow.category)}</span>
                <span className="ins-screen-preview-foot-tag">{PLATFORM_LABEL[flow.platform] ?? flow.platform}</span>
              </div>
              {showPlayer && (
                <div className="ins-flow-player">
                  <button
                    type="button"
                    className="ins-flow-player-play"
                    aria-label={playing ? 'Pause flow' : 'Play flow'}
                    aria-pressed={playing}
                    onClick={togglePlay}
                  >
                    {/* The landing navbar's hover tip (.nav-social-tip), above the button. */}
                    <span className="ins-flow-tip" aria-hidden="true">
                      Prototype
                    </span>
                    {playing ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                        <rect x="2.5" y="2" width="3.2" height="10" rx="1" />
                        <rect x="8.3" y="2" width="3.2" height="10" rx="1" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                        <path d="M4.5 2.6c0-.8.86-1.28 1.53-.86l6.1 3.9a1 1 0 010 1.7l-6.1 3.9a1 1 0 01-1.53-.86V2.6z" />
                      </svg>
                    )}
                  </button>
                  {stepBar()}
                  <p className="ins-flow-player-count" aria-live="polite">
                    <b>{activeIndex + 1}</b> / {screens.length}
                  </p>
                  <button
                    type="button"
                    className="ins-flow-player-speed"
                    aria-label={`Playback speed ${speed}×, change`}
                    onClick={cycleSpeed}
                  >
                    <span className="ins-flow-tip" aria-hidden="true">
                      Playback speed
                    </span>
                    {speed}×
                  </button>
                </div>
              )}
              <div className="ins-screen-preview-foot-primary">
                <SaveButton
                  ref={saveBtnRef}
                  type="flow"
                  id={flow.id}
                  variant={showPlayer ? 'icon' : 'button'}
                  app={app ?? undefined}
                  className={
                    showPlayer
                      ? // Icon only, the "…" button's round look, right after the player.
                        'ins-screen-preview-foot-more ins-flow-save'
                      : 'ins-screen-preview-foot-btn ins-screen-preview-foot-btn--save'
                  }
                />
                {/* With the player in the footer there's no room, so View in App
                    Store lives in the "…" menu (FlowMenu); the all-screens view
                    (and a one-step flow) has the room and shows it here too. */}
                {!showPlayer && store && app && (
                  <StoreLinkButton name={app.name} platform={flow.platform} action={store} className="ins-screen-preview-foot-btn" />
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
                {app ? (
                  <FlowMenu app={app} flowName={flow.name} screens={screens} store={store} platform={flow.platform} link={`${window.location.origin}${pathname}?${FLOW_PARAM}=${flow.id}`} />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      {zoomScreen && <ScreenLightbox screen={zoomScreen} onClose={() => setZoomScreen(null)} />}
      {shotMenu.menu}
      {presenting && active && (
        <div
          ref={presentRef}
          className={`ins-flow-present ${hudVisible ? 'is-hud' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={`Presenting ${flow.name}${app ? ` — ${app.name}` : ''}`}
          onMouseMove={pokeHud}
        >
          <div className="ins-flow-present-top">{stepBar('ins-flow-steps--dark')}</div>
          {/* Click the left third to go back a step, anywhere else to go on. */}
          <div
            className="ins-flow-present-stage"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const back = e.clientX < box.left + box.width / 3;
              setActiveIndex((i) => Math.min(Math.max(i + (back ? -1 : 1), 0), lastIndex));
              pokeHud();
            }}
          >
            <Screenshot screen={active} priority className="ins-flow-present-shot" />
          </div>
          <div className="ins-flow-present-hud">
            <button
              type="button"
              className="ins-flow-present-btn ins-flow-present-btn--play"
              aria-label={playing ? 'Pause flow' : 'Play flow'}
              onClick={togglePlay}
            >
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                  <rect x="2.5" y="2" width="3.2" height="10" rx="1" />
                  <rect x="8.3" y="2" width="3.2" height="10" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                  <path d="M4.5 2.6c0-.8.86-1.28 1.53-.86l6.1 3.9a1 1 0 010 1.7l-6.1 3.9a1 1 0 01-1.53-.86V2.6z" />
                </svg>
              )}
            </button>
            <p className="ins-flow-present-label" aria-live="polite">
              <b>{activeIndex + 1}</b> / {screens.length} · {stepLabel(active)}
            </p>
            <button type="button" className="ins-flow-present-btn" aria-label={`Playback speed ${speed}×, change`} onClick={cycleSpeed}>
              {speed}×
            </button>
            <span className="ins-flow-present-hint">Space to pause · Esc to exit</span>
            <button type="button" className="ins-flow-present-btn ins-flow-present-btn--exit" onClick={exitPresent}>
              Exit
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

/**
 * The footer's "…": the masthead's own menu (AppMenu) for this flow —
 * Download all screens (just this flow's, as one zip), Copy flow link and,
 * below a divider, View in App Store — opening upward from the dialog's foot.
 */
function FlowMenu({
  app,
  flowName,
  screens,
  store,
  platform,
  link,
}: {
  app: App;
  flowName: string;
  screens: Screen[];
  store: StoreAction | null;
  platform: Platform;
  link: string;
}) {
  // "spotify-onboarding.zip"
  const flowPart = flowName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flow';
  const dl = useDownloadAllScreens(app, screens, `${app.slug}-${flowPart}`);
  return (
    <AppMenu
      busy={dl.busy}
      versions={[]}
      store={store ? { name: app.name, platform, action: store } : undefined}
      onDownloadAll={() => void dl.downloadAll()}
      onDownloadVersion={() => {}}
      linkLabel="Copy flow link"
      link={() => link}
      triggerClassName="ins-screen-preview-foot-more"
      opensUp
    />
  );
}
