'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useStoredValue, writeStoredValue } from '@/hooks/useStoredValue';
import { inspirationsApi } from '@/lib/inspirations/api';
import { focusOnOpen } from '@/lib/inspirations/focusOnOpen';
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
import { SHEET_QUERY, useMediaQuery, useSheet } from './useSheet';
import { useLibrary } from './useLibrary';
import { useSwipeStep } from './useSwipeStep';

/** Search-param name that opens the overlay — see SCREEN_PARAM in ScreenPreviewModal.tsx. */
export const FLOW_PARAM = 'flow';
/** Optional `&step=<screen id>`: open the flow on that step rather than the first. */
export const STEP_PARAM = 'step';

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
  // A phone's footer is the player and More: Save and Nearby screens move into More.
  const phone = useMediaQuery(SHEET_QUERY);
  const { collectionsContaining } = useLibrary();
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
  // Right-click on a step's screenshot: the grid card's menu (Copy PNG,
  // Download PNG, Copy link) for that screenshot, as in the screen preview,
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
  // On a touch screen there's no hover to peek with: a long-press on the bar
  // brings the preview up at that step, a drag along the bar moves it step to
  // step, and letting go goes to the step under the finger. A quick tap is
  // still a tap on its step; a finger that moves off before the press holds
  // is a scroll, and nothing happens.
  const scrub = useRef<{ timer: number; x: number; y: number; on: boolean; i: number } | null>(null);
  // Set as a scrub ends: the tap that ends it isn't a tap on the step it started on.
  const scrubbed = useRef(false);
  const SCRUB_HOLD_MS = 300;
  const stepUnder = (barEl: HTMLElement, clientX: number) => {
    const steps = [...barEl.querySelectorAll<HTMLElement>('.ins-flow-step')];
    let at = 0;
    steps.forEach((step, i) => {
      if (clientX >= step.getBoundingClientRect().left) at = i;
    });
    return { i: at, el: steps[at] };
  };
  const scrubProps = (bar: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') return;
      const barEl = e.currentTarget;
      const pointerId = e.pointerId;
      const press = { timer: 0, x: e.clientX, y: e.clientY, on: false, i: -1 };
      press.timer = window.setTimeout(() => {
        press.on = true;
        navigator.vibrate?.(8);
        try {
          barEl.setPointerCapture(pointerId);
        } catch {
          // The finger's already gone.
        }
        const { i, el } = stepUnder(barEl, press.x);
        press.i = i;
        if (el) showStepPeek(bar, i, el);
      }, SCRUB_HOLD_MS);
      scrub.current = press;
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const press = scrub.current;
      if (!press) return;
      if (!press.on) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
          window.clearTimeout(press.timer);
          scrub.current = null;
        }
        return;
      }
      press.x = e.clientX;
      const { i, el } = stepUnder(e.currentTarget, e.clientX);
      if (i !== press.i && el) {
        press.i = i;
        showStepPeek(bar, i, el);
      }
    },
    onPointerUp: () => {
      const press = scrub.current;
      scrub.current = null;
      if (!press) return;
      window.clearTimeout(press.timer);
      if (!press.on) return;
      scrubbed.current = true;
      window.setTimeout(() => (scrubbed.current = false), 0);
      if (press.i >= 0) setActiveIndex(press.i);
      hideStepPeek();
    },
    onClickCapture: (e: ReactPointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
      if (!scrubbed.current) return;
      scrubbed.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onPointerCancel: () => {
      const press = scrub.current;
      scrub.current = null;
      if (!press) return;
      window.clearTimeout(press.timer);
      if (press.on) hideStepPeek();
    },
  });
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
    if (mounted) focusOnOpen(closeRef.current);
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
    focusOnOpen(closeRef.current);
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
  // On a phone the step on show is swiped to the next, as the cards' screens are.
  const { moverRef: shotRef, swipeProps: shotSwipe } = useSwipeStep({ canPrev: activeIndex > 0, canNext: activeIndex < screens.length - 1, onStep: stepSingle });

  // On a phone, a sheet: its top drags up to fill the screen, down to settle or close.
  const { ref: sheetRef, className: sheetClass, dragProps: sheetDrag, handle: sheetHandle } = useSheet(close);
  if (!mounted) return null;

  if (loading || !flow) {
    // Not found (or the request failed): don't leave a dead spinner up.
    if (!loading && !flow) {
      close();
      return null;
    }
    return createPortal(
      <div className="ins-search-overlay ins-sheet-overlay" role="presentation" onClick={close}>
        <div
          ref={sheetRef}
          className={`ins-screen-preview-modal ins-screen-preview-modal--loading ins-sheet--tall ${sheetClass}`}
          {...sheetDrag}
          role="dialog"
          aria-modal="true"
          aria-label="Loading flow"
          onClick={(e) => e.stopPropagation()}
        >
          {sheetHandle}
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
        onPointerLeave={(e) => e.pointerType === 'mouse' && hideStepPeek()}
        {...scrubProps(bar)}
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
  // A phone with the player: its footer is the player and More, which takes
  // Save and Nearby screens at its top. (In Nearby screens' view the footer
  // has room, and keeps its own Save and "Individual screen" to come back.)
  const phoneFoot = phone && showPlayer;
  // A phone in Nearby screens' view: Save, the store link and More in one
  // row, More holding "Individual screen" (back to the player).
  const phoneMulti = phone && multiScreen && screens.length > 1;
  const flowSaved = collectionsContaining('flow', flow.id).length > 0;
  const menuLeading = [
    {
      label: flowSaved ? 'Remove from saved' : 'Save',
      // (saved.svg and unsaved.svg are drawn white, for the black Save button
      // and the footer's filtered one: on the white menu, the black outline
      // bookmark, and a bin to say "remove".)
      icon: `/ASSET/Icons/Motvin/${flowSaved ? 'delete.svg' : 'save.svg'}`,
      onSelect: () => saveBtnRef.current?.click(),
    },
    {
      label: 'Nearby screens',
      icon: '/ASSET/Icons/Motvin/show-all-screens.svg',
      onSelect: () => setMultiScreen(true),
    },
  ];

  const store = storeAction(flow.platform, app?.website);

  const flowMenu = app ? (
    <FlowMenu
      app={app}
      flowName={flow.name}
      screens={screens}
      store={store}
      platform={flow.platform}
      link={`${window.location.origin}${pathname}?${FLOW_PARAM}=${flow.id}`}
      leading={
        phoneFoot
          ? menuLeading
          : phoneMulti
            ? [{ label: 'Individual screen', icon: '/ASSET/Icons/Motvin/indiviudal-screen.svg', onSelect: () => setMultiScreen(false) }]
            : undefined
      }
    />
  ) : null;

  return createPortal(
    <>
      <div className="ins-search-overlay ins-sheet-overlay" role="presentation" onClick={close}>
        <div
          ref={sheetRef}
          className={`ins-screen-preview-modal ins-sheet--tall ${sheetClass}`}
          {...sheetDrag}
          role="dialog"
          aria-modal="true"
          aria-label={`${flow.name}${app ? ` — ${app.name}` : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {sheetHandle}
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
                // Right-click anywhere on this strip (not only on the screenshot):
                // the same menu, for the step being viewed.
                <div
                  className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single"
                  onContextMenu={active ? onShotContextMenu(active) : undefined}
                  {...shotSwipe}
                >
                  <div
                    ref={shotRef}
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
              {/* On a phone with the player, Save is in More (the button stays,
                  hidden, for More's Save and the S key to press). */}
              <div className={`ins-screen-preview-foot-primary ${phoneFoot ? 'is-in-menu' : ''}`}>
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
                {/* A phone's all-screens view: one row, as the screen preview's — More here, holding "Individual screen". */}
                {phoneMulti && flowMenu}
              </div>
              {!phoneMulti && (
              <div className="ins-screen-preview-foot-secondary">
                {screens.length > 1 && !phoneFoot && (
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
                {flowMenu}
              </div>
              )}
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
  leading,
}: {
  app: App;
  flowName: string;
  screens: Screen[];
  store: StoreAction | null;
  platform: Platform;
  link: string;
  leading?: { label: string; icon: string; onSelect: () => void }[];
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
      leading={leading}
    />
  );
}
