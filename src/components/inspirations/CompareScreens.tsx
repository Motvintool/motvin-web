'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
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
  // The arrows move both sides together; each stops at its own last screen.
  const step = useCallback(
    (dir: 1 | -1) =>
      setPos({
        key: pairKey,
        left: Math.min(Math.max(left + dir, 0), Math.max(0, lastLeft)),
        right: Math.min(Math.max(right + dir, 0), Math.max(0, lastRight)),
      }),
    [pairKey, left, right, lastLeft, lastRight],
  );
  const atStart = left === 0 && right === 0;
  const atEnd = left >= lastLeft && right >= lastRight;

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
                {other && <AppLogo app={other.app} size={40} className="ins-screen-preview-head-logo" />}
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
                    {other ? other.app.name : loading ? 'Finding apps…' : 'No other app'}
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
                <span className="ins-screen-preview-head-sep">/</span>
                <div className="ins-compare-pick">
                  <button
                    type="button"
                    className="ins-compare-title-pick"
                    aria-haspopup="menu"
                    aria-expanded={menu === 'type'}
                    onClick={() => setMenu(menu === 'type' ? null : 'type')}
                  >
                    {label}
                    <Chevron />
                  </button>
                  {menu === 'type' && (
                    <div className="ins-context-menu ins-compare-menu" role="menu">
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
              </div>
            </div>
            <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={close}>
              <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
            </button>
          </div>

          <BrandProbe app={app} screens={screens} version={app.currentVersion ?? ''} onBrand={setLeftBrand} />
          {other ? <OtherBrandProbe key={other.app.id} app={other.app} onBrand={setRightBrand} /> : null}

          <div className="ins-screen-preview-filmstrip-wrap ins-compare-stage">
            <CompareSide
              screens={ownScreens}
              index={left}
              label={label}
              brand={brands.left}
              onOpen={openScreen}
            />
            <div className="ins-compare-seam" aria-hidden="true">
              <span>vs</span>
            </div>
            {other ? (
              <CompareSide
                screens={otherScreens}
                index={right}
                label={label}
                brand={brands.right}
                onOpen={openScreen}
              />
            ) : (
              <div className="ins-compare-side">
                <p className="ins-compare-empty">{loading ? 'Loading…' : `No other app has ${label.toLowerCase()} screens yet.`}</p>
              </div>
            )}
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

          {/* The flow preview's footer: tags left, both sides' thumbnails
              centred (to jump either on its own), Swap right. */}
          <div className="ins-screen-preview-foot ins-flow-foot ins-compare-foot">
            <div className="ins-screen-preview-foot-tags">
              <span className="ins-screen-preview-foot-tag">{label}</span>
              {platform && <span className="ins-screen-preview-foot-tag">{platform}</span>}
            </div>
            {/* Each side's thumbnails either side of the seam carried down
                from the stage (the current one larger and ringed; click one
                to jump that side alone). */}
            <div className="ins-compare-strips">
              <ThumbStrip screens={ownScreens} index={left} name={app.name} label={label} onPick={(i) => setSide('left', i)} />
              <span className="ins-compare-strips-vs" aria-hidden="true" />
              <ThumbStrip screens={otherScreens} index={right} name={other?.app.name ?? ''} label={label} onPick={(i) => setSide('right', i)} />
            </div>
            <div className="ins-screen-preview-foot-secondary">
              {swapHref && (
                <Link href={swapHref} className="ins-screen-preview-foot-btn" scroll={false}>
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2.5 5h10l-2.5-2.5M13.5 11h-10l2.5 2.5" />
                  </svg>
                  Swap sides
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
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
}: {
  screens: Screen[];
  index: number;
  label: string;
  brand: string | null;
  onOpen: (s: Screen) => void;
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
        >
          <Screenshot key={current.id} screen={current} priority />
        </button>
      ) : (
        <p className="ins-compare-empty">No {label.toLowerCase()} screens here.</p>
      )}
    </div>
  );
}

/**
 * One side's thumbnails, in the footer; the current one larger and ringed.
 * Hovering one lifts a larger preview of it above the strip (with its place,
 * "3 / 12"), and the mouse wheel scrolls a long strip sideways.
 */
function ThumbStrip({ screens, index, name, label, onPick }: { screens: Screen[]; index: number; name: string; label: string; onPick: (i: number) => void }) {
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
  // Keep the current thumbnail in view as the pair moves.
  useEffect(() => {
    const thumb = ref.current?.children[index] as HTMLElement | undefined;
    thumb?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);
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
        ref={ref}
        onScroll={() => {
          measure();
          hide();
        }}
        onPointerLeave={hide}
        role="group"
        aria-label={`${name} ${label.toLowerCase()} screens`}
      >
        {screens.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`ins-compare-thumb ${i === index ? 'is-current' : ''}`}
            aria-label={`${name} ${i + 1}: ${s.name}`}
            aria-current={i === index ? 'true' : undefined}
            onPointerEnter={(e) => e.pointerType === 'mouse' && show(i, e.currentTarget)}
            onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(i, e.currentTarget)}
            onBlur={hide}
            onClick={() => onPick(i)}
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

function Chevron() {
  return (
    <svg className="ins-compare-title-chevron" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4.75 6.5L8 9.75l3.25-3.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
