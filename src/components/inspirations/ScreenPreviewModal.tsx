'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { focusOnOpen } from '@/lib/inspirations/focusOnOpen';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { storeAction } from '@/lib/inspirations/storeAction';
import { StoreLinkButton } from './StoreMenuItem';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_STATE_LABEL, SCREEN_TYPE_LABEL, screenTypeLabel, styleLabel } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type Flow, type Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { CompareShortcut, ScreenColours } from './ScreenDetailsExtras';
import { SaveButton } from './SaveButton';
import { saveItemFor } from './previewSaveAs';
import { Screenshot } from './Screenshot';
import { ScreenLightbox } from './ScreenLightbox';
import { useToast } from './Toast';
import { useScreenContextMenu } from './useScreenContextMenu';
import { useAsync } from './useAsync';
import { SHEET_QUERY, useMediaQuery, useSheet } from './useSheet';
import { useSwipeStep } from './useSwipeStep';
import { flowOfScreen, screenTitleIn, screenTrail } from '@/lib/inspirations/screenNaming';

/** Search-param name that opens the overlay — see FLOW_PARAM in FlowPreview.tsx. */
export const SCREEN_PARAM = 'screen';

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
/**
 * Where a tag goes, in the section the screen is in. A tag that is a screen
 * type, a state, a category or the platform opens that filter (a search for
 * "modal" would add type and state filters together and find almost
 * nothing); a word from the tag list opens a search for it.
 */
function tagHref(tag: string, section: string): string {
  const screens = INSPIRATIONS_ROUTES.screens;
  if (Object.hasOwn(SCREEN_TYPE_LABEL, tag)) return `${screens}?type=${tag}&platform=${section}`;
  if (Object.hasOwn(SCREEN_STATE_LABEL, tag)) return `${screens}?state=${tag}&platform=${section}`;
  if (Object.hasOwn(INDUSTRY_LABEL, tag)) return `${screens}?industry=${tag}&platform=${section}`;
  if (tag === 'ios' || tag === 'webapp' || tag === 'web') return `${screens}?platform=${section}`;
  return `${INSPIRATIONS_ROUTES.searchFor(tag.replace(/-/g, ' '))}&platform=${section}`;
}

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
  const openedPatterns = data?.patterns ?? [];

  const [siblingScreens, setSiblingScreens] = useState<Screen[]>([]);
  // The app's flows, from the same getApp call, for the foot's Flow button.
  const [appFlows, setAppFlows] = useState<Flow[]>([]);
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
  const [contextScreenId, setContextScreenId] = useState<string | null>(null);
  // The keyboard shortcuts card (? or the header's Shortcuts button).
  const [showKeys, setShowKeys] = useState(false);
  // The screen whose extra types were opened with "+N": moving to another screen folds them again.
  const [typesOpenFor, setTypesOpenFor] = useState<string | null>(null);
  const keysRef = useRef<HTMLDivElement>(null);
  const keysBtnRef = useRef<HTMLButtonElement>(null);
  // A click anywhere outside the card closes it (the button toggles it itself).
  useEffect(() => {
    if (!showKeys) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (keysRef.current?.contains(t) || keysBtnRef.current?.contains(t)) return;
      setShowKeys(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [showKeys]);

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
  // The patterns of the screen on show, not only the one the preview opened
  // on: stepping to the next screen reads its own (cached once read).
  const viewId = screens[activeIndex]?.id ?? screenId;
  const { data: viewData } = useAsync(
    () => (viewId === screenId ? Promise.resolve(null) : inspirationsApi.getScreen(viewId)),
    `screen-preview-patterns:${viewId}`,
  );

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  // Close takes focus once the dialog is drawn, and again when the loaded
  // content replaces the placeholder (a new Close button). The open effect
  // below runs before either on a fresh page load, when nothing is drawn yet.
  const contentReady = Boolean(screen) && !loading;
  useEffect(() => {
    if (mounted) focusOnOpen(closeRef.current);
  }, [mounted, contentReady]);

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
        if (cancelled || !data) return;
        if (data.screens.length) setSiblingScreens(data.screens);
        setAppFlows(data.flows);
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
        // The shortcuts card first, then the preview.
        if (showKeys) setShowKeys(false);
        else close();
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
  }, [close, screens, multiScreen, zoomScreen, showKeys]);

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
  // On a phone the one screen on show is swiped to the next, as the cards' are.
  const { moverRef: shotRef, swipeProps: shotSwipe } = useSwipeStep({ canPrev: activeIndex > 0, canNext: activeIndex < screens.length - 1, onStep: stepSingle });

  // Right-click on a screenshot: the grid card's menu (Copy PNG, Download PNG,
  // Copy link) for whichever screenshot was clicked, in place of the
  // browser's own "Save image as…". Guests get the sign-in notice. Set up
  // before the early returns below, so the hooks run in the same order.
  const menuScreen = (contextScreenId && screens.find((s) => s.id === contextScreenId)) || screen;
  const shotMenu = useScreenContextMenu(menuScreen, app, () =>
    `${window.location.origin}${pathname}?${SCREEN_PARAM}=${menuScreen?.id ?? screenId}`,
  );
  const onShotContextMenu = (target: Screen) => (e: React.MouseEvent) => {
    setContextScreenId(target.id);
    shotMenu.onContextMenu(e);
  };

  // The screen being looked at, for the footer's Copy PNG and the C / L keys.
  const currentScreen = screens[activeIndex] ?? screen;
  const currentShot = useScreenContextMenu(currentScreen, app, () =>
    `${window.location.origin}${pathname}?${SCREEN_PARAM}=${currentScreen?.id ?? screenId}`,
  );
  const copyCurrentLink = useCallback(async () => {
    if (!currentScreen) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${pathname}?${SCREEN_PARAM}=${currentScreen.id}`);
      show('Link copied');
    } catch {
      show('Copy not available', { tone: 'error' });
    }
  }, [currentScreen, pathname, show]);
  // C copies the PNG, L the link, ? shows the shortcuts card (S, ←/→ and Esc
  // are handled above). Plain keys only, never while typing, and not under
  // the lightbox; Cmd/Ctrl+C stays the browser's copy.
  const copyCurrentPng = currentShot.copyPng;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoomScreen || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        void copyCurrentPng();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        void copyCurrentLink();
      } else if (e.key === '?') {
        e.preventDefault();
        setShowKeys((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoomScreen, copyCurrentPng, copyCurrentLink]);

  // On a phone, a sheet: its top drags up to fill the screen, down to settle or close.
  const { ref: sheetRef, className: sheetClass, dragProps: sheetDrag, handle: sheetHandle } = useSheet(close);
  const phone = useMediaQuery(SHEET_QUERY);
  if (!mounted) return null;

  if (loading || !screen) {
    // The placeholder's screenshot shape, guessed from the id until the screen
    // itself loads ("…-web-…" / "…-webapp-…" ids are website captures).
    const skeletonIsWeb = /-(web|webapp)-/.test(screenId);
    // Not found (or the request failed): don't leave a dead spinner up.
    if (!loading && !screen) {
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
          aria-label="Loading screen"
          onClick={(e) => e.stopPropagation()}
        >
          {sheetHandle}
          {/* The loaded modal's own layout in placeholder shapes (its panels,
              header, screenshot, footer and Details rows, on the same classes),
              so the content lands in place instead of replacing a spinner. */}
          <div className="ins-screen-preview-main" aria-busy="true">
            <div className="ins-screen-preview-head">
              <div className="ins-screen-preview-head-app">
                <span className="ins-skel ins-preview-skel-logo" />
                <span className="ins-skel ins-skel--line ins-preview-skel-title" />
              </div>
              <div className="ins-flow-head-actions">
                <span className="ins-skel ins-preview-skel-keys" />
                <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
                  <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
                </button>
              </div>
            </div>
            <div className="ins-screen-preview-filmstrip-wrap">
              <div className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single">
                <div className={`ins-screen-preview-shot ins-preview-skel-shot ${skeletonIsWeb ? 'ins-screen-preview-shot--web is-web' : ''}`}>
                  <span className="ins-skel" />
                </div>
              </div>
            </div>
            <div className="ins-screen-preview-foot" aria-hidden>
              <div className="ins-screen-preview-foot-tags">
                <span className="ins-skel ins-preview-skel-pill" style={{ width: 151 }} />
                <span className="ins-skel ins-preview-skel-pill" style={{ width: 66 }} />
              </div>
              <div className="ins-screen-preview-foot-primary">
                <span className="ins-skel ins-preview-skel-pill ins-preview-skel-pill--lg ins-preview-skel-save" />
                <span className="ins-skel ins-preview-skel-pill ins-preview-skel-pill--lg ins-preview-skel-store" />
              </div>
              <div className="ins-screen-preview-foot-secondary">
                <span className="ins-skel ins-preview-skel-round" />
                <span className="ins-skel ins-preview-skel-pill ins-preview-skel-nearby" />
                <span className="ins-skel ins-preview-skel-round" />
              </div>
            </div>
          </div>
          <div className="ins-screen-preview-details" aria-hidden>
            <div className="ins-screen-preview-details-head">
              <h2>Details</h2>
            </div>
            <div className="ins-screen-preview-details-body">
              <section className="ins-details-group">
                <h3 className="ins-details-group-title">Screen</h3>
                <dl className="ins-details-list">
                  {[['App', 92], ['Type', 64], ['Platform', 44], ['Industry', 104], ['Style', 72]].map(([term, width]) => (
                    <div key={term} className="ins-screen-preview-details-row">
                      <dt className="ins-screen-preview-details-term">{term}</dt>
                      <dd className="ins-screen-preview-details-value">
                        <span className="ins-skel ins-preview-skel-value" style={{ width: Number(width) }} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="ins-details-group">
                <h3 className="ins-details-group-title">Colours</h3>
                <div className="ins-details-swatches is-loading">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className="ins-details-swatch" />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // The screen being looked at (← / → step it), so the title, foot, menu and
  // details follow it rather than staying on the one first opened.
  const view = screens[activeIndex] ?? screen;
  const showAllTypes = typesOpenFor === view.id;
  // The section this screen is in — iOS, or Webs (web apps and websites) —
  // so a tag or type opened from it stays in that section.
  const viewSection = isDesktopPlatform(view.platform) ? 'web' : view.platform;
  const patterns = viewId === screenId ? openedPatterns : (viewData?.patterns ?? []);

  // The flow this screen is a step of (a top-level one first, over a detour),
  // opened in FlowPreview on this screen's step, in place of this preview.
  // `flow` / `step` are FlowPreview's params, written out: it imports this file.
  const viewFlow = flowOfScreen(appFlows, view.id);
  const flowHref = (() => {
    if (!viewFlow) return null;
    const sp = new URLSearchParams(params.toString());
    sp.delete(SCREEN_PARAM);
    sp.set('flow', viewFlow.id);
    sp.set('step', view.id);
    return `${pathname}?${sp.toString()}`;
  })();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${pathname}?${SCREEN_PARAM}=${view.id}`);
      show('Link copied');
    } catch {
      show('Copy not available', { tone: 'error' });
    }
    setMoreOpen(false);
  };

  const store = storeAction(view.platform, app?.website);

  // The footer's More menu. On a phone the footer is one row (Save, the
  // store, More), so the flow and Nearby screens move in here, at its top.
  const moreMenu = (
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
          {phone && (flowHref && viewFlow || screens.length > 1) && (
            <>
              {flowHref && viewFlow && (
                <Link className="ins-popover-item" role="menuitem" href={flowHref} scroll={false} onClick={() => setMoreOpen(false)}>
                  <MenuIcon src="/ASSET/Icons/Motvin/flow.svg" /> <span>Prototype</span>
                </Link>
              )}
              {screens.length > 1 && (
                <button
                  type="button"
                  className="ins-popover-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    setMultiScreen((v) => !v);
                  }}
                >
                  <MenuIcon src={multiScreen ? '/ASSET/Icons/Motvin/indiviudal-screen.svg' : '/ASSET/Icons/Motvin/show-all-screens.svg'} />{' '}
                  <span>{multiScreen ? 'Individual screen' : 'Nearby screens'}</span>
                </button>
              )}
              <div className="ins-popover-divider" role="separator" />
            </>
          )}
          {/* The image (copy, download), then the rest (link, compare),
              split by a divider so the list scans at a glance. */}
          <button
            type="button"
            className="ins-popover-item"
            role="menuitem"
            onClick={() => {
              setMoreOpen(false);
              void currentShot.copyPng();
            }}
          >
            <MenuIcon src={ICON_COPY_PNG} /> <span>Copy PNG</span>
          </button>
          {view.downloadable && (
            // The same watermarked PNG the card's menu downloads, made
            // here: a link to the API is on another origin, where the
            // browser ignores `download` and opens the image instead.
            <button
              type="button"
              className="ins-popover-item"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                void currentShot.downloadPng();
              }}
            >
              <MenuIcon src={ICON_DOWNLOAD} /> <span>Download</span>
            </button>
          )}
          <div className="ins-popover-divider" role="separator" />
          <button type="button" className="ins-popover-item" role="menuitem" onClick={() => void copyLink()}>
            <MenuIcon src={ICON_COPY_LINK} /> <span>Copy link</span>
          </button>
          {/* This screen's type, beside another app's (CompareScreens on the app page). */}
          {app && view.screenType && view.screenType !== 'other' && (
            <Link
              className="ins-popover-item"
              role="menuitem"
              href={`${INSPIRATIONS_ROUTES.app(app)}?compare=${encodeURIComponent(view.screenType)}`}
              onClick={() => setMoreOpen(false)}
            >
              <MenuIcon src={ICON_COMPARE} /> <span>Compare {screenTypeLabel(view.screenType).toLowerCase()}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );

  const credit = view.source.attribution || null;

  return createPortal(
    <>
      <div className="ins-search-overlay ins-sheet-overlay" role="presentation" onClick={close}>
        <div
          ref={sheetRef}
          className={`ins-screen-preview-modal ins-sheet--tall ${sheetClass}`}
          {...sheetDrag}
          role="dialog"
          aria-modal="true"
          aria-label={screenTrail(app, viewFlow, view).join(' / ')}
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
                {/* Named the way the flow preview names the same screen: the
                    app, the flow it is a step of, then the screen — its type,
                    or its own name when its type is only "Other". */}
                <div className="ins-screen-preview-head-title">
                  {app && <span>{app.name}</span>}
                  {app && <span className="ins-screen-preview-head-sep">/</span>}
                  {viewFlow && (
                    <>
                      <span>{viewFlow.name}</span>
                      <span className="ins-screen-preview-head-sep">/</span>
                    </>
                  )}
                  <span className={viewFlow ? 'ins-flow-head-step' : undefined}>{screenTitleIn(viewFlow, view)}</span>
                </div>
              </div>
              <div className="ins-flow-head-actions">
                {/* Keyboard shortcuts beside Close, like the flow preview's Present. */}
                <button
                  ref={keysBtnRef}
                  type="button"
                  className="ins-flow-present-open"
                  aria-label="Keyboard shortcuts"
                  aria-expanded={showKeys}
                  onClick={() => {
                    setMoreOpen(false);
                    setShowKeys((v) => !v);
                  }}
                >
                  <span className="ins-preview-keys-icon" aria-hidden="true">
                    ?
                  </span>
                  <span>Shortcuts</span>
                </button>
                <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
                  <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
                </button>
              </div>
            </div>

            <div className="ins-screen-preview-filmstrip-wrap">
              {multiScreen ? (
                <div className="ins-screen-preview-filmstrip" ref={filmRef} onScroll={updateScrollState}>
                  {screens.map((s) => (
                    <div
                      key={s.id}
                      className={`ins-screen-preview-shot ${isDesktopPlatform(s.platform) ? 'ins-screen-preview-shot--web' : ''}`}
                      data-screen-id={s.id}
                      onClick={() => setZoomScreen(s)}
                      onContextMenu={onShotContextMenu(s)}
                    >
                      <Screenshot screen={s} priority={s.id === screen.id} />
                    </div>
                  ))}
                </div>
              ) : (
                // Right-click anywhere on this strip (not only on the screenshot):
                // the same menu, for the screen being viewed.
                <div className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single" onContextMenu={onShotContextMenu(view)} {...shotSwipe}>
                  <div
                    ref={shotRef}
                    className={`ins-screen-preview-shot ${isDesktopPlatform((screens[activeIndex] ?? screen).platform) ? 'ins-screen-preview-shot--web' : ''}`}
                    data-screen-id={screens[activeIndex]?.id ?? view.id}
                    onClick={() => setZoomScreen(screens[activeIndex] ?? screen)}
                    onContextMenu={onShotContextMenu(screens[activeIndex] ?? screen)}
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
                <span className="ins-screen-preview-foot-tag">{INDUSTRY_LABEL[view.industry]}</span>
                <span className="ins-screen-preview-foot-tag">{PLATFORM_LABEL[view.platform]}</span>
              </div>
              <div className="ins-screen-preview-foot-primary">
                <SaveButton
                  ref={saveBtnRef}
                  // A UI element or pattern when opened from those grids.
                  type={saveItemFor(view).type}
                  id={saveItemFor(view).id}
                  variant="button"
                  app={app ?? undefined}
                  className="ins-screen-preview-foot-btn ins-screen-preview-foot-btn--save"
                />
                {/* The live store listing, found by name (StoreLinkButton), as the masthead's menu does — the app's own link is often empty. */}
                {store && (
                  <StoreLinkButton name={app?.name ?? ''} platform={view.platform} action={store} className="ins-screen-preview-foot-btn" />
                )}
                {/* A phone: More sits in this row, holding the flow and Nearby screens too. */}
                {phone && moreMenu}
              </div>
              {!phone && (
              <div className="ins-screen-preview-foot-secondary">
                {flowHref && viewFlow && (
                  <Link
                    className="ins-screen-preview-foot-more ins-preview-flow"
                    href={flowHref}
                    scroll={false}
                    aria-label={`Prototype: the ${viewFlow.name} flow`}
                  >
                    <img src="/ASSET/Icons/Motvin/flow.svg" alt="" width={18} height={18} />
                    <span className="ins-flow-tip" aria-hidden="true">
                      Prototype
                    </span>
                  </Link>
                )}
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
                {moreMenu}
              </div>
              )}
            </div>

            {/* The keyboard shortcuts, on ? (or the header's Shortcuts): a small
                black card under that button; Esc, ? or a click closes it. */}
            {showKeys && (
              <div ref={keysRef} className="ins-preview-keys" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setShowKeys(false)}>
                <p className="ins-preview-keys-title">Keyboard shortcuts</p>
                <dl>
                  {KEYS.map(([keys, label]) => (
                    <div key={label} className="ins-preview-keys-row">
                      <dt>
                        {keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </dt>
                      <dd>{label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="ins-screen-preview-details">
            <div className="ins-screen-preview-details-head">
              <h2>Details</h2>
            </div>
            {/* The facts in small labelled groups: the linked ones (App, Type,
                Platform, Industry) as the footer's grey pills; the screen's
                colours; patterns; a compare shortcut; the source; tags. */}
            <div
              className="ins-screen-preview-details-body"
              // Scrolled down: a fade at the top too (straight on the element, no re-render).
              onScroll={(e) => e.currentTarget.classList.toggle('is-scrolled', e.currentTarget.scrollTop > 2)}
            >
              <section className="ins-details-group" aria-labelledby="ins-details-screen">
                <h3 id="ins-details-screen" className="ins-details-group-title">
                  Screen
                </h3>
                <dl className="ins-details-list">
                  {app && (
                    <div className="ins-screen-preview-details-row">
                      <dt className="ins-screen-preview-details-term">App</dt>
                      <dd className="ins-screen-preview-details-value">
                        <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-details-pill ins-details-pill--app">
                          <AppLogo app={app} size={20} />
                          {app.name}
                        </Link>
                      </dd>
                    </div>
                  )}
                  <div className="ins-screen-preview-details-row">
                    <dt className="ins-screen-preview-details-term">Type</dt>
                    {/* Every type the screen is, the main one first; each opens its filter.
                        Two show; the rest wait behind "+N" until it is clicked. */}
                    <dd className="ins-screen-preview-details-value">
                      {(() => {
                        const types = view.screenTypes?.length ? view.screenTypes : [view.screenType];
                        const shown = showAllTypes ? types : types.slice(0, 2);
                        return (
                          <>
                            {shown.map((type) => (
                              <Link key={type} href={`${INSPIRATIONS_ROUTES.screens}?type=${type}&platform=${viewSection}`} className="ins-details-pill">
                                {screenTypeLabel(type)}
                              </Link>
                            ))}
                            {types.length > shown.length && (
                              <button
                                type="button"
                                className="ins-details-pill ins-details-pill--more"
                                aria-label={`Show ${types.length - shown.length} more type${types.length - shown.length === 1 ? '' : 's'}: ${types.slice(2).map(screenTypeLabel).join(', ')}`}
                                title={types.slice(2).map(screenTypeLabel).join(', ')}
                                onClick={() => setTypesOpenFor(view.id)}
                              >
                                +{types.length - shown.length}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </dd>
                  </div>
                  <div className="ins-screen-preview-details-row">
                    <dt className="ins-screen-preview-details-term">Platform</dt>
                    <dd className="ins-screen-preview-details-value">
                      <Link href={`${INSPIRATIONS_ROUTES.screens}?platform=${view.platform}`} className="ins-details-pill">
                        {PLATFORM_LABEL[view.platform]}
                      </Link>
                    </dd>
                  </div>
                  <div className="ins-screen-preview-details-row">
                    <dt className="ins-screen-preview-details-term">Industry</dt>
                    <dd className="ins-screen-preview-details-value">
                      <Link href={`${INSPIRATIONS_ROUTES.screens}?industry=${view.industry}`} className="ins-details-pill">
                        {INDUSTRY_LABEL[view.industry]}
                      </Link>
                    </dd>
                  </div>
                  {view.style.length > 0 && (
                    <div className="ins-screen-preview-details-row">
                      <dt className="ins-screen-preview-details-term">Style</dt>
                      <dd className="ins-screen-preview-details-value">{view.style.map((st) => styleLabel(st)).join(', ')}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <ScreenColours key={view.id} screen={view} />

              {patterns.length > 0 && (
                <section className="ins-details-group" aria-labelledby="ins-details-patterns">
                  <h3 id="ins-details-patterns" className="ins-details-group-title">
                    Patterns
                  </h3>
                  <div className="ins-details-pills">
                    {patterns.map((p) => (
                      <Link key={p.id} href={INSPIRATIONS_ROUTES.pattern(p)} className="ins-details-pill">
                        {p.name}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {app && <CompareShortcut app={app} screen={view} />}

              {(credit || view.capturedAt) && (
                <section className="ins-details-group" aria-labelledby="ins-details-source">
                  <h3 id="ins-details-source" className="ins-details-group-title">
                    Source
                  </h3>
                  <dl className="ins-details-list">
                    {credit && (
                      <div className="ins-screen-preview-details-row">
                        <dt className="ins-screen-preview-details-term">Credit</dt>
                        <dd className="ins-screen-preview-details-value">{credit}</dd>
                      </div>
                    )}
                    {view.capturedAt && (
                      <div className="ins-screen-preview-details-row">
                        <dt className="ins-screen-preview-details-term">Last Updated</dt>
                        <dd className="ins-screen-preview-details-value ins-details-num">
                          <time dateTime={view.capturedAt.slice(0, 10)} title={view.capturedAt.slice(0, 10)}>
                            {formatDay(view.capturedAt)}
                          </time>
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {view.tags.length > 0 && (
                <section className="ins-details-group" aria-labelledby="ins-details-tags">
                  <h3 id="ins-details-tags" className="ins-details-group-title">
                    Tags
                  </h3>
                  <div className="ins-details-pills">
                    {view.tags.map((t) => (
                      <Link key={t} href={tagHref(t, viewSection)} className="ins-details-pill ins-details-pill--tag">
                        <span aria-hidden="true">#</span>
                        {t}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
      {zoomScreen && <ScreenLightbox screen={zoomScreen} onClose={() => setZoomScreen(null)} />}
      {shotMenu.menu}
    </>,
    document.body,
  );
}

/** The shortcuts card's rows: keys, then what they do. */
const KEYS: [string[], string][] = [
  [['←', '→'], 'Previous / next screen'],
  [['S'], 'Save'],
  [['C'], 'Copy PNG'],
  [['L'], 'Copy link'],
  [['?'], 'Show these shortcuts'],
  [['Esc'], 'Close'],
];

/** "2026-10-06…" → "6 Oct 2026" (the day as captured, not shifted by the viewer's time zone). */
function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso.slice(0, 10);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The "…" menu's icons: Motvin's own set, as in the screen's right-click menu and the app menu. */
const ICON_COPY_LINK = '/ASSET/Icons/Motvin/copy-link.svg';
const ICON_COPY_PNG = '/ASSET/Icons/Motvin/copy-png.svg';
const ICON_COMPARE = '/ASSET/Icons/Motvin/compare.svg';
const ICON_DOWNLOAD = '/ASSET/Icons/Motvin/download-png.svg';

function MenuIcon({ src }: { src: string }) {
  return <img src={src} alt="" width={16} height={16} aria-hidden />;
}
