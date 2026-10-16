'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { PLATFORM_LABEL, screenTypeLabel } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type App, type Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { useAppPalette } from './AppPalette';
import { SCREEN_PARAM } from './ScreenPreviewModal';
import { Screenshot } from './Screenshot';
import { useAsync } from './useAsync';
import { useScreenContextMenu } from './useScreenContextMenu';

/** `?compare=<screen type>` opens the compare view on an app page; `&with=<app slug>` picks the other app. */
export const COMPARE_PARAM = 'compare';
export const COMPARE_WITH_PARAM = 'with';

/** The type the compare view opens on when none is asked for: login if the app has any, else its most common. */
export function defaultCompareType(screens: Screen[]): string | null {
  const counts = typeCounts(screens);
  if (counts.has('login')) return 'login';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function typeCounts(screens: Screen[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of screens) if (s.screenType && s.screenType !== 'other') counts.set(s.screenType, (counts.get(s.screenType) ?? 0) + 1);
  return counts;
}

function subscribeNever() {
  return () => {};
}

/**
 * "Compare Login with…": one pair at a time — this app's screen of a type
 * beside another app's, large, with arrows stepping both together and a strip
 * of thumbnails under each to jump either side on its own. Lives on the app
 * page, opened by `?compare=` (the "…" menus link to it), so it's linkable and
 * Back closes it.
 */
export function CompareScreens({ app, screens }: { app: App; screens: Screen[] }) {
  const params = useSearchParams();
  const type = params.get(COMPARE_PARAM);
  if (!type) return null;
  return <CompareModal app={app} screens={screens} type={type} withSlug={params.get(COMPARE_WITH_PARAM)} />;
}

function CompareModal({ app, screens, type, withSlug }: { app: App; screens: Screen[]; type: string; withSlug: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<'type' | 'app' | null>(null);
  // Each side's brand colour (from its screenshots, as the Palette button
  // does), shown as a small dot by its name.
  const [brands, setBrands] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  const setLeftBrand = useCallback((hex: string | null) => setBrands((b) => (b.left === hex ? b : { ...b, left: hex })), []);
  const setRightBrand = useCallback((hex: string | null) => setBrands((b) => (b.right === hex ? b : { ...b, right: hex })), []);

  const { data: ofType, loading } = useAsync(() => inspirationsApi.listScreensOfType(type), `compare-type:${type}`);
  const { data: apps } = useAsync(() => inspirationsApi.listApps(), 'compare-apps');

  // This app's types (the type picker), and every other app's screens of this type.
  const ownTypes = useMemo(() => [...typeCounts(screens).entries()].sort((a, b) => b[1] - a[1]), [screens]);
  const ownScreens = useMemo(() => screens.filter((s) => s.screenType === type), [screens, type]);
  const others = useMemo(() => {
    const byApp = new Map<string, Screen[]>();
    for (const s of ofType ?? []) {
      if (s.appId === app.id) continue;
      byApp.set(s.appId, [...(byApp.get(s.appId) ?? []), s]);
    }
    const appById = new Map((apps ?? []).map((a) => [a.id, a]));
    return [...byApp.entries()]
      .map(([id, list]) => ({ app: appById.get(id), screens: list }))
      .filter((o): o is { app: App; screens: Screen[] } => Boolean(o.app))
      .sort((a, b) => b.screens.length - a.screens.length);
  }, [ofType, apps, app.id]);
  // The asked-for app if it has this type, else the one with the most.
  const other = others.find((o) => o.app.slug === withSlug) ?? others[0] ?? null;
  const otherScreens = useMemo(() => other?.screens ?? [], [other]);

  // Where each side is. A different type or app starts both from the first.
  const [pos, setPos] = useState({ key: '', left: 0, right: 0 });
  const pairKey = `${type}:${other?.app.id ?? ''}`;
  const left = pos.key === pairKey ? Math.min(pos.left, Math.max(0, ownScreens.length - 1)) : 0;
  const right = pos.key === pairKey ? Math.min(pos.right, Math.max(0, otherScreens.length - 1)) : 0;
  const lastLeft = ownScreens.length - 1;
  const lastRight = otherScreens.length - 1;
  const setSide = (side: 'left' | 'right', i: number) => setPos({ key: pairKey, left: side === 'left' ? i : left, right: side === 'right' ? i : right });
  // Right-click on a screen: the grid card's menu (Copy PNG,
  // Download PNG, Copy link) for that screenshot, with its own app's
  // watermark and link, in place of the browser's "Save image as…".
  const [ctx, setCtx] = useState<{ side: 'left' | 'right'; id: string } | null>(null);
  const ctxScreen =
    (ctx && (ctx.side === 'left' ? ownScreens : otherScreens).find((s) => s.id === ctx.id)) || ownScreens[left] || otherScreens[right] || null;
  const ctxApp = ctx?.side === 'right' ? (other?.app ?? null) : app;
  const shotMenu = useScreenContextMenu(ctxScreen, ctxApp, () =>
    `${window.location.origin}${INSPIRATIONS_ROUTES.app(ctxApp ?? app)}?${SCREEN_PARAM}=${ctxScreen?.id ?? ''}`,
  );
  const onShotMenu = (side: 'left' | 'right') => (s: Screen, e: React.MouseEvent) => {
    setCtx({ side, id: s.id });
    shotMenu.onContextMenu(e);
  };

  // A side can be locked: it holds its screen while the arrows step the
  // other (its own thumbnails still change it). A new type or app unlocks.
  const [locks, setLocks] = useState({ key: '', left: false, right: false });
  const lockedLeft = locks.key === pairKey && locks.left;
  const lockedRight = locks.key === pairKey && locks.right;
  // The screen under the pointer, so only its lock shows. Leaving waits a
  // moment, so the pointer can cross from the screen to its lock.
  const [hoverSide, setHoverSide] = useState<'left' | 'right' | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const enterSide = (side: 'left' | 'right') => {
    window.clearTimeout(hoverTimer.current);
    setHoverSide(side);
  };
  const leaveSide = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHoverSide(null), 250);
  };
  const toggleLock = (side: 'left' | 'right') =>
    setLocks({ key: pairKey, left: side === 'left' ? !lockedLeft : lockedLeft, right: side === 'right' ? !lockedRight : lockedRight });
  // The arrows move both sides together (but not a locked one); each stops
  // at its own last screen.
  const step = useCallback(
    (dir: 1 | -1) =>
      setPos({
        key: pairKey,
        left: lockedLeft ? left : Math.min(Math.max(left + dir, 0), Math.max(0, lastLeft)),
        right: lockedRight ? right : Math.min(Math.max(right + dir, 0), Math.max(0, lastRight)),
      }),
    [pairKey, left, right, lastLeft, lastRight, lockedLeft, lockedRight],
  );
  const atStart = (lockedLeft || left === 0) && (lockedRight || right === 0);
  const atEnd = (lockedLeft || left >= lastLeft) && (lockedRight || right >= lastRight);

  const setParams = useCallback(
    (next: Record<string, string | null>, mode: 'push' | 'replace' = 'replace') => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null) sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const close = useCallback(() => setParams({ [COMPARE_PARAM]: null, [COMPARE_WITH_PARAM]: null }), [setParams]);
  // A screenshot opens the usual preview on top; closing it comes back here.
  const openScreen = (s: Screen) => setParams({ [SCREEN_PARAM]: s.id }, 'push');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A screen preview opened from here takes the keyboard while it's open.
      if (params.get(SCREEN_PARAM)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (menu) setMenu(null);
        else close();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        step(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, menu, params, step]);

  // Above phones, each side's thumbnails sit centred under its own screen,
  // as wide as the screen (up to STRIP_MAX) but always clear of the seam's
  // line and of the tags / Swap sides. CSS can't know the screen's drawn
  // width, so it's measured (offsetWidth: the hover lift doesn't count).
  const stageRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<StripPlacement | null>(null);
  // Each screen's drawn box in the stage, for its lock button (any width).
  const [frames, setFrames] = useState<{ w: number; l?: Frame; r?: Frame }>({ w: 0 });
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const foot = footRef.current;
    if (!stage || !foot) return;
    const wide = window.matchMedia('(min-width: 901px)');
    const measure = () => {
      const stR = stage.getBoundingClientRect();
      const frameOf = (side: Element | undefined): Frame | undefined => {
        const shot = side?.querySelector<HTMLElement>('.ins-compare-shot > *');
        if (!shot || !shot.offsetWidth) return undefined;
        const r = shot.getBoundingClientRect();
        // Unscaled (the hover lift scales about the centre).
        const w = shot.offsetWidth;
        const h = shot.offsetHeight;
        return { x: Math.round(r.left + r.width / 2 - w / 2 - stR.left), y: Math.round(r.top + r.height / 2 - h / 2 - stR.top), w, h };
      };
      const sideEls = stage.querySelectorAll('.ins-compare-side');
      const nextFrames = { w: Math.round(stR.width), l: frameOf(sideEls[0]), r: frameOf(sideEls[1]) };
      setFrames((f) => (JSON.stringify(f) === JSON.stringify(nextFrames) ? f : nextFrames));
      const seam = stage.querySelector('.ins-compare-seam');
      if (!wide.matches || !seam) {
        setPlaced(null);
        return;
      }
      const fr = foot.getBoundingClientRect();
      const sr = seam.getBoundingClientRect();
      const line = sr.left + sr.width / 2 - fr.left;
      const tags = foot.querySelector('.ins-screen-preview-foot-tags')?.getBoundingClientRect();
      const swap = foot.querySelector('.ins-screen-preview-foot-secondary')?.getBoundingClientRect();
      // 'keep': the screen is there but not laid out yet (a new step's image,
      // for a frame), so the side keeps where it was rather than hiding (which
      // would flicker and drop keyboard focus from its thumbnails).
      const box = (side: Element | undefined, min: number, max: number): StripBox | undefined | 'keep' => {
        const shot = side?.querySelector<HTMLElement>('.ins-compare-shot > *');
        if (!shot) return undefined;
        if (!shot.offsetWidth) return 'keep';
        const r = shot.getBoundingClientRect();
        const cx = r.left + r.width / 2 - fr.left;
        const half = Math.min(Math.min(shot.offsetWidth, STRIP_MAX) / 2, cx - min, max - cx);
        return half >= 30 ? { x: Math.round(cx - half), w: Math.round(half * 2) } : undefined;
      };
      const sides = stage.querySelectorAll('.ins-compare-side');
      const l = box(sides[0], (tags ? tags.right - fr.left : 0) + 16, line - 20);
      const r = box(sides[1], line + 20, (swap ? swap.left - fr.left : fr.width) - 16);
      setPlaced((p) => {
        const next: StripPlacement = { line: Math.round(line), l: l === 'keep' ? p?.l : l, r: r === 'keep' ? p?.r : r };
        return JSON.stringify(p) === JSON.stringify(next) ? p : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(foot);
    stage.querySelectorAll('.ins-compare-shot > *').forEach((el) => observer.observe(el));
    wide.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      wide.removeEventListener('change', measure);
    };
  }, [mounted, left, right, pairKey, ownScreens.length, otherScreens.length]);

  if (!mounted) return null;
  const label = screenTypeLabel(type);

  const platform = PLATFORM_LABEL[ownScreens[0]?.platform ?? app.platforms[0]] ?? '';
  const swapHref = other ? `${INSPIRATIONS_ROUTES.app(other.app)}?${COMPARE_PARAM}=${encodeURIComponent(type)}&${COMPARE_WITH_PARAM}=${encodeURIComponent(app.slug)}` : null;

  return createPortal(
    <div className="ins-search-overlay" role="presentation" onClick={close}>
      <div
        className="ins-screen-preview-modal ins-compare-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Compare ${label} screens`}
        onClick={(e) => {
          e.stopPropagation();
          if (menu && !(e.target as HTMLElement).closest('.ins-compare-pick')) setMenu(null);
        }}
      >
        <div className="ins-screen-preview-main ins-compare-main">
          {/* The flow / screen preview's own header: logos, then breadcrumbs. */}
          <div className="ins-screen-preview-head">
            <div className="ins-screen-preview-head-app">
              <span className="ins-compare-logos" aria-hidden="true">
                <AppLogo app={app} size={40} className="ins-screen-preview-head-logo" />
                {other ? (
                  <AppLogo app={other.app} size={40} className="ins-screen-preview-head-logo" />
                ) : loading ? (
                  // Holds the second logo's place, so the title doesn't shift when it lands.
                  <span className="ins-skel ins-compare-skel-logo" />
                ) : null}
              </span>
              <div className="ins-screen-preview-head-title ins-compare-crumbs">
                <span>{app.name}</span>
                <span className="ins-compare-crumbs-vs">vs</span>
                <div className="ins-compare-pick">
                  <button
                    type="button"
                    className="ins-compare-title-pick"
                    aria-haspopup="menu"
                    aria-expanded={menu === 'app'}
                    disabled={!others.length}
                    onClick={() => setMenu(menu === 'app' ? null : 'app')}
                  >
                    {other ? (
                      other.app.name
                    ) : loading ? (
                      // The other app's name as a placeholder bar until the apps load.
                      <span className="ins-skel ins-skel--line ins-compare-skel-name" aria-label="Finding apps" />
                    ) : (
                      'No other app'
                    )}
                    {others.length > 0 && <Chevron />}
                  </button>
                  {menu === 'app' && (
                    <div className="ins-context-menu ins-compare-menu" role="menu">
                      {others.map((o) => (
                        <button
                          key={o.app.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={o.app.id === other?.app.id}
                          className={`ins-context-menu-btn ${o.app.id === other?.app.id ? 'is-active' : ''}`}
                          onClick={() => {
                            setMenu(null);
                            setParams({ [COMPARE_WITH_PARAM]: o.app.slug });
                          }}
                        >
                          <span className="ins-compare-menu-app">
                            <AppLogo app={o.app} size={22} />
                            <span className="ins-context-menu-text">{o.app.name}</span>
                          </span>
                          <span className="ins-compare-menu-count">{o.screens.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
              <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
            </button>
          </div>

          <BrandProbe app={app} screens={screens} version={app.currentVersion ?? ''} onBrand={setLeftBrand} />
          {other ? <OtherBrandProbe key={other.app.id} app={other.app} onBrand={setRightBrand} /> : null}

          <div className="ins-screen-preview-filmstrip-wrap ins-compare-stage" ref={stageRef}>
            <CompareSide
              screens={ownScreens}
              index={left}
              label={label}
              brand={brands.left}
              onOpen={openScreen}
              onMenu={onShotMenu('left')}
              onHover={(on) => (on ? enterSide('left') : leaveSide())}
            />
            {/* The seam: a hairline, and on it the pair's swap (icon only), so
                you flip the sides where they meet. */}
            <div className="ins-compare-seam">
              {swapHref && (
                <Link href={swapHref} className="ins-compare-swap" scroll={false} aria-label="Swap sides">
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2.5 5h10l-2.5-2.5M13.5 11h-10l2.5 2.5" />
                </svg>
                  <span className="ins-flow-tip" aria-hidden="true">
                    Swap sides
                  </span>
                </Link>
              )}
            </div>
            {other ? (
              <CompareSide
                screens={otherScreens}
                index={right}
                label={label}
                brand={brands.right}
                onOpen={openScreen}
                onMenu={onShotMenu('right')}
                onHover={(on) => (on ? enterSide('right') : leaveSide())}
              />
            ) : (
              <div className="ins-compare-side">
                {loading ? (
                  // The other app's screen as a placeholder in the same frame
                  // (and so the same place) as the screen that replaces it.
                  <span className="ins-compare-shot ins-compare-shot--skel" aria-hidden>
                    <span className="ins-skel ins-compare-skel-shot" />
                  </span>
                ) : (
                  <p className="ins-compare-empty">{`No other app has ${label.toLowerCase()} screens yet.`}</p>
                )}
              </div>
            )}
            {/* Each screen's lock, at its top outer corner (inside it on
                phones, where there's no room beside it). */}
            {(['left', 'right'] as const).map((side) => {
              const f = side === 'left' ? frames.l : frames.r;
              if (!f) return null;
              const locked = side === 'left' ? lockedLeft : lockedRight;
              const name = side === 'left' ? app.name : (other?.app.name ?? '');
              // 44px button, 12px off the screen; inside its corner (36px,
              // 8px in) when there's less than 68px beside it.
              const outside = (side === 'left' ? f.x : frames.w - (f.x + f.w)) >= 68;
              const style: CSSProperties = outside
                ? { top: f.y, left: side === 'left' ? f.x - 56 : f.x + f.w + 12 }
                : { top: f.y + 8, left: side === 'left' ? f.x + 8 : f.x + f.w - 44 };
              return (
                <button
                  key={side}
                  type="button"
                  className={`ins-compare-lock ${locked ? 'is-locked' : ''} ${outside ? '' : 'is-inside'} ${hoverSide === side ? 'is-shown' : ''}`}
                  style={style}
                  onPointerEnter={() => enterSide(side)}
                  onPointerLeave={leaveSide}
                  aria-pressed={locked}
                  aria-label={locked ? `Unlock ${name}'s screen` : `Lock ${name}'s screen`}
                  onClick={(e) => {
                    toggleLock(side);
                    // A mouse click hands the keys back to the page (its arrows),
                    // and doesn't leave the tooltip up; keyboard focus stays.
                    if (e.detail > 0) e.currentTarget.blur();
                  }}
                >
                  <LockIcon locked={locked} />
                  <span className="ins-flow-tip" aria-hidden="true">
                    {locked ? 'Unlock screen' : 'Lock screen'}
                  </span>
                </button>
              );
            })}
            {/* The preview's own round arrows: they step both sides together. */}
            <button
              type="button"
              className="ins-card-control ins-card-control--prev ins-screen-preview-nav ins-screen-preview-nav--prev"
              aria-label="Previous pair"
              disabled={atStart}
              onClick={() => step(-1)}
            >
              <img src="/ASSET/Icons/Motvin/previous-arrow.svg" alt="" width={24} height={18} />
            </button>
            <button
              type="button"
              className="ins-card-control ins-screen-preview-nav ins-screen-preview-nav--next"
              aria-label="Next pair"
              disabled={atEnd}
              onClick={() => step(1)}
            >
              <img src="/ASSET/Icons/Motvin/next-arrow.svg" alt="" width={24} height={18} />
            </button>
          </div>

          {/* The flow preview's footer: the type and platform tags left, both
              sides' thumbnails centred (to jump either on its own), the type
              picker right. */}
          <div className="ins-screen-preview-foot ins-flow-foot ins-compare-foot" ref={footRef}>
            <div className="ins-screen-preview-foot-tags">
              <span className="ins-screen-preview-foot-tag">{label}</span>
              {platform && <span className="ins-screen-preview-foot-tag">{platform}</span>}
            </div>
            {/* Each side's thumbnails either side of the seam carried down
                from the stage (the current one larger and ringed; click one
                to jump that side alone). */}
            <div className={`ins-compare-strips ${placed ? 'is-placed' : ''}`}>
              <ThumbStrip
                screens={ownScreens}
                index={left}
                name={app.name}
                label={label}
                box={placed ? placed.l ?? null : undefined}
                onPick={(i) => setSide('left', i)}
              />
              <span className="ins-compare-strips-vs" aria-hidden="true" style={placed ? { left: placed.line } : undefined} />
              <ThumbStrip
                screens={otherScreens}
                index={right}
                name={other?.app.name ?? ''}
                label={label}
                box={placed ? placed.r ?? null : undefined}
                onPick={(i) => setSide('right', i)}
                loading={!other && loading}
              />
            </div>
            <div className="ins-screen-preview-foot-secondary">
              {/* The screen type, as a picker: an outlined footer button (the
                  grey pills are plain tags); it opens upward, from its right. */}
              <div className="ins-compare-pick">
                <button
                  type="button"
                  className="ins-screen-preview-foot-btn ins-compare-tag-pick"
                  aria-haspopup="menu"
                  aria-expanded={menu === 'type'}
                  aria-label={`Screen type: ${label}. Change`}
                  onClick={() => setMenu(menu === 'type' ? null : 'type')}
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <rect x="2.25" y="1.75" width="7" height="12.5" rx="1.75" />
                    <path d="M12.25 3.5v9" strokeLinecap="round" />
                  </svg>
                  {label}
                  <Chevron />
                </button>
                {menu === 'type' && (
                  <div className="ins-context-menu ins-compare-menu ins-compare-menu--up" role="menu">
                    {ownTypes.map(([t, n]) => (
                      <button
                        key={t}
                        type="button"
                        role="menuitemradio"
                        aria-checked={t === type}
                        className={`ins-context-menu-btn ${t === type ? 'is-active' : ''}`}
                        onClick={() => {
                          setMenu(null);
                          setParams({ [COMPARE_PARAM]: t });
                        }}
                      >
                        <span className="ins-context-menu-text">{screenTypeLabel(t)}</span>
                        <span className="ins-compare-menu-count">{n}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* On phones the seam is too narrow for its swap: it sits here. */}
              {swapHref && (
                <Link href={swapHref} className="ins-screen-preview-foot-more ins-compare-foot-swap" scroll={false} aria-label="Swap sides">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2.5 5h10l-2.5-2.5M13.5 11h-10l2.5 2.5" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
      {shotMenu.menu}
    </div>,
    document.body,
  );
}

/** One side: the screen, large (its place in the side's screens shows in the footer's thumbnails). */
function CompareSide({
  screens,
  index,
  label,
  brand,
  onOpen,
  onMenu,
  onHover,
}: {
  screens: Screen[];
  index: number;
  label: string;
  brand: string | null;
  onOpen: (s: Screen) => void;
  /** Right-click: the screenshot's menu. */
  onMenu?: (s: Screen, e: React.MouseEvent) => void;
  /** The pointer onto / off the screen (for its lock). */
  onHover?: (on: boolean) => void;
}) {
  const current = screens[index];

  return (
    <div className="ins-compare-side" style={brand ? ({ '--ins-compare-brand': brand } as CSSProperties) : undefined}>
      {current ? (
        <button
          type="button"
          className={`ins-compare-shot ${isDesktopPlatform(current.platform) ? 'is-web' : ''}`}
          aria-label={`Open ${current.name}`}
          onClick={() => onOpen(current)}
          onContextMenu={onMenu ? (e) => onMenu(current, e) : undefined}
          onPointerEnter={() => onHover?.(true)}
          onPointerLeave={() => onHover?.(false)}
        >
          <Screenshot key={current.id} screen={current} priority />
        </button>
      ) : (
        <p className="ins-compare-empty">No {label.toLowerCase()} screens here.</p>
      )}
    </div>
  );
}

/** Where the footer's thumbnails go, in the footer's own coordinates (see CompareModal). */
type StripBox = { x: number; w: number };
/** A screen's drawn box, in the stage's coordinates. */
type Frame = { x: number; y: number; w: number; h: number };
type StripPlacement = { line: number; l?: StripBox; r?: StripBox };
/** The widest a side's thumbnails get: about seven. */
const STRIP_MAX = 252;
/** Half the current thumbnail's width with its 3px margin (.ins-compare-thumb.is-current). */
const CURRENT_HALF = 18;
/** The thumbnails' size change (.ins-compare-thumb: width .35s cubic-bezier(.22, 1, .36, 1)), which the strip's glide matches. */
const GLIDE_MS = 350;
const GLIDE_EASE = cubicBezier(0.22, 1, 0.36, 1);

/** A CSS cubic-bezier() timing function, for animating in step with a CSS transition. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (u: number, a: number, b: number) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  const slope = (u: number) => 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
  return (t: number) => {
    if (t <= 0 || t >= 1) return Math.min(1, Math.max(0, t));
    let u = t;
    for (let i = 0; i < 8; i++) {
      const d = slope(u);
      if (Math.abs(d) < 1e-6) break;
      u = Math.min(1, Math.max(0, u - (at(u, x1, x2) - t) / d));
    }
    return at(u, y1, y2);
  };
}

/**
 * One side's thumbnails, in the footer; the current one larger and ringed.
 * Hovering one lifts a larger preview of it above the strip (with its place,
 * "3 / 12"), and the mouse wheel scrolls a long strip sideways. `box` is
 * where it sits in the footer once measured (null: no room or no screen, so
 * it's hidden; undefined: not measured, so it flows in the grid).
 */
/** Placeholder thumbnails a loading strip shows (graded like the real ones). */
const THUMB_SKELETON_COUNT = 6;

function ThumbStrip({
  screens,
  index,
  name,
  label,
  box,
  onPick,
  loading = false,
}: {
  screens: Screen[];
  index: number;
  name: string;
  label: string;
  box?: { x: number; w: number } | null;
  /** Its screens are still on their way: graded placeholder thumbnails meanwhile. */
  loading?: boolean;
  onPick: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Which ends have thumbnails hidden past them: only those ends fade.
  const [more, setMore] = useState({ before: false, after: false });
  // The hovered thumbnail and where its centre sits in the pill. Kept (with
  // `on` false) after the pointer leaves, so the card fades out in place;
  // `glide` when it moves from one thumbnail to the next.
  const [peek, setPeek] = useState<{ i: number; x: number; on: boolean; glide: boolean } | null>(null);
  const hide = () => setPeek((p) => (p && p.on ? { ...p, on: false } : p));
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const before = el.scrollLeft > 1;
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.before === before && m.after === after ? m : { before, after }));
  }, []);
  // Keep the current thumbnail centred under its screen. It opens (and
  // snaps, on a resize) already centred; a change of screen glides there in
  // one motion, timed and eased with the sizes' own change (they grade by
  // distance from the current one), toward where it will be once they have
  // finished, worked out from the size tokens rather than read mid-change.
  const boxW = box?.w;
  const shownIndex = useRef<number | null>(null);
  const glide = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !screens.length) return;
    const cs = getComputedStyle(el);
    const px = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
    const [base, stepPx, min, current, currentM, gap] = ['--ins-thumb', '--ins-thumb-step', '--ins-thumb-min', '--ins-thumb-current', '--ins-thumb-current-m', '--ins-thumb-gap'].map(px);
    let x = parseFloat(cs.paddingLeft) || 0;
    for (let j = 0; j < index; j++) x += Math.max(min, base - Math.min(index - j, 4) * stepPx) + gap;
    const target = Math.max(0, x + currentM + current / 2 - el.clientWidth / 2);

    const moved = shownIndex.current !== null && shownIndex.current !== index;
    shownIndex.current = index;
    cancelAnimationFrame(glide.current);
    if (!moved || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollTo({ left: target, behavior: 'instant' });
    } else {
      const from = el.scrollLeft;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / GLIDE_MS);
        el.scrollTo({ left: from + (target - from) * GLIDE_EASE(t), behavior: 'instant' });
        if (t < 1) glide.current = requestAnimationFrame(tick);
      };
      glide.current = requestAnimationFrame(tick);
    }
    // Moving with the keyboard: focus follows the current thumbnail.
    if (el.contains(document.activeElement)) (el.children[index] as HTMLElement | undefined)?.focus({ preventScroll: true });
    // The wheel takes over from a glide in progress.
    const stop = () => cancelAnimationFrame(glide.current);
    el.addEventListener('wheel', stop, { passive: true });
    return () => {
      el.removeEventListener('wheel', stop);
      cancelAnimationFrame(glide.current);
    };
  }, [index, boxW, screens.length]);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // An up/down wheel scrolls the strip sideways (not passive, to keep the page still).
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: 'instant' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, [measure, screens.length]);

  const show = (i: number, thumb: HTMLElement) => {
    const pill = ref.current?.parentElement;
    if (!pill) return;
    const t = thumb.getBoundingClientRect();
    const x = t.left + t.width / 2 - pill.getBoundingClientRect().left;
    setPeek((p) => ({ i, x, on: true, glide: Boolean(p?.on) }));
  };
  const peeked = peek ? screens[peek.i] : undefined;

  return (
    <>
      <div
        className={`ins-compare-strip ${more.before ? 'has-before' : ''} ${more.after ? 'has-after' : ''}`}
        // Placed: half the box of air at each end, so even the first and last
        // screens scroll to the middle and the current one always sits
        // centred under its screen, the rest grading away to either side.
        style={
          box === undefined
            ? undefined
            : box
              ? { left: box.x, width: box.w, paddingInline: Math.max(6, Math.round(box.w / 2 - CURRENT_HALF)) }
              : { display: 'none' }
        }
        ref={ref}
        onScroll={() => {
          measure();
          hide();
        }}
        onPointerLeave={hide}
        // One Tab stop per side (the current thumbnail); from there ←/→ move
        // this side alone, Home/End jump to its first/last, and the page's
        // own arrows (both sides together) don't also fire.
        onKeyDown={(e) => {
          const last = screens.length - 1;
          const next =
            e.key === 'ArrowLeft' ? index - 1 : e.key === 'ArrowRight' ? index + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
          if (next === null) return;
          e.preventDefault();
          e.stopPropagation();
          onPick(Math.min(Math.max(next, 0), last));
        }}
        role="group"
        aria-label={`${name} ${label.toLowerCase()} screens`}
      >
        {loading && screens.length === 0 &&
          Array.from({ length: THUMB_SKELETON_COUNT }, (_, i) => (
            <span
              key={i}
              className={`ins-compare-thumb ins-compare-thumb--skel ${i === 0 ? 'is-current' : ''}`}
              style={{ '--d': Math.min(i, 4) } as CSSProperties}
              aria-hidden
            >
              <span className="ins-skel" />
            </span>
          ))}
        {screens.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`ins-compare-thumb ${i === index ? 'is-current' : ''}`}
            // Steps from the current one (capped): each step smaller, like a dock.
            style={{ '--d': Math.min(Math.abs(i - index), 4) } as CSSProperties}
            aria-label={`${name} ${i + 1}: ${s.name}`}
            aria-current={i === index ? 'true' : undefined}
            tabIndex={i === index ? 0 : -1}
            onPointerEnter={(e) => e.pointerType === 'mouse' && show(i, e.currentTarget)}
            onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(i, e.currentTarget)}
            onBlur={hide}
            onClick={() => onPick(i)}
            // No menu on a thumbnail (the large screen has it), nor the
            // browser's own "Save image as…".
            onContextMenu={(e) => e.preventDefault()}
          >
            <Screenshot screen={s} />
          </button>
        ))}
      </div>
      {/* Outside the strip, which clips; positioned in the footer's strips. */}
      <div className={`ins-compare-peek ${peek?.on && peeked ? 'is-visible' : ''} ${peek?.glide ? 'is-gliding' : ''}`} style={peek ? ({ '--x': `${peek.x}px` } as CSSProperties) : undefined} aria-hidden>
        {peeked && (
          <>
            <Screenshot key={peeked.id} screen={peeked} />
            <span className="ins-compare-peek-label">
              {peek!.i + 1} / {screens.length}
            </span>
          </>
        )}
      </div>
    </>
  );
}

/** Works out one app's brand colour (its Primary, else Accent) and hands it up. */
function BrandProbe({ app, screens, version, onBrand }: { app: App; screens: Screen[]; version: string; onBrand: (hex: string | null) => void }) {
  const colors = useAppPalette(app, screens, version);
  const brand = colors ? (colors.find((c) => c.role === 'Primary') ?? colors.find((c) => c.role === 'Accent'))?.hex ?? null : null;
  useEffect(() => {
    onBrand(brand);
  }, [brand, onBrand]);
  return null;
}

/**
 * The other app's colour from all its screens (its current capture), not
 * just this type's, which can be dominated by one screen's photo; it then
 * matches that app's own Palette button, and shares its cache.
 */
function OtherBrandProbe({ app, onBrand }: { app: App; onBrand: (hex: string | null) => void }) {
  const { data } = useAsync(() => inspirationsApi.getApp(app.slug), `compare-app:${app.slug}`);
  const version = data?.app.currentVersion ?? '';
  const screens = useMemo(() => (data ? data.screens.filter((s) => !version || s.version === version) : []), [data, version]);
  useEffect(() => {
    if (!data) onBrand(null);
  }, [data, onBrand]);
  return data ? <BrandProbe app={data.app} screens={screens} version={version} onBrand={onBrand} /> : null;
}

/** A padlock, shut when locked, its shackle open when not. */
function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.75" />
      <path d={locked ? 'M5.25 7V5a2.75 2.75 0 015.5 0v2' : 'M5.25 7V5a2.75 2.75 0 015.33-.95'} />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="ins-compare-title-chevron" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4.75 6.5L8 9.75l3.25-3.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
