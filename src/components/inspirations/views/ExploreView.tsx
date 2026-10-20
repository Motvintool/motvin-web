'use client';

import { isDesktopPlatform, type App, type Platform, type Screen, type ScreenType } from '@/lib/inspirations/types';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { openSearch, type SearchSection } from '@/lib/inspirations/openSearch';
import { elementLabel, flowCategoryLabel, INDUSTRY_LABEL, screenTypeLabel } from '@/lib/inspirations/taxonomy';
import { BackToTop } from '../BackToTop';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { RotatingTitle } from '../RotatingTitle';
import { usePlatformMeta } from '../useMeta';
import { ExploreSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';
import { AppLogo } from '../AppLogo';
import { inspirationsApi } from '@/lib/inspirations/api';
import { EMPTY_FILTERS, browsedPlatforms } from '@/lib/inspirations/filters';
import { taxonomyEmoji } from '@/lib/inspirations/emoji';

type PreviewItem = { type: 'screen' | 'app'; id: string; name: string; url: string | null; app: App | null };

const PREVIEW_LIMIT = 5;
/** Near the top of the page, a scroll down folds the heading away instead of moving the page. */
const FOLD_ZONE_PX = 24;
/** After the fold, a flick's coasting is absorbed while its events keep coming this close together… */
const COAST_GAP_MS = 140;
/** …for at most this long. */
const COAST_MAX_MS = 900;
/** The first moments after the fold, while the flick that caused it is still speeding up. */
const FLICK_PUSH_MS = 280;
/** How long the page's own smooth scroll back to the results is told apart from the visitor's scrolling. */
const OWN_SCROLL_MS = 1200;
/** Longest the card waits on its pictures before showing anyway. */
const PREVIEW_IMAGE_WAIT_MS = 1500;
/** How soon after Back / Forward the page counts as returning to where it was left. */
const RETURN_WINDOW_MS = 2000;

// Whether the heading was folded when the visitor last left Explore, and when the browser last went Back or
// Forward: together they say the page is being returned to (an app opened from the gallery, then Back), so
// it comes back folded as it was left — the restored scroll was measured that way — instead of a heading's
// height off and folding again under the visitor on the next scroll. Arriving fresh it starts open.
let leftFolded = false;
let poppedAt = -Infinity;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    poppedAt = performance.now();
  });
}
const returningFolded = () => leftFolded && performance.now() - poppedAt < RETURN_WINDOW_MS;

/**
 * Preview content per link, kept for the visit: hovering a link a second
 * time shows its card at once instead of fetching it again, and the
 * pictures are loaded and decoded before the card first appears, so it never
 * opens on an empty tile that fills in a moment later.
 */
const previewCache = new Map<string, Promise<PreviewItem[]>>();
/** The same, once loaded: read straight away when the pointer moves to a
 * link, so the card switches to that link's own items in the same frame. */
const previewReady = new Map<string, PreviewItem[]>();

function previewKey(category: { id: string; title: string }, platforms: Platform[]) {
  return `${category.title}|${category.id}|${platforms.join(',')}`;
}

function previewImage(item: PreviewItem): string | null {
  if (item.type === 'screen' && item.url) return inspirationsApi.mediaUrl(item.url) ?? item.url;
  if (item.app) return inspirationsApi.mediaUrl(item.app.logo);
  return null;
}

async function fetchPreview(category: { id: string; title: string }, platforms: Platform[]): Promise<PreviewItem[]> {
  const scoped = { ...EMPTY_FILTERS, platforms };
  const fromScreens = (screens: Screen[]): PreviewItem[] =>
    screens.slice(0, PREVIEW_LIMIT).map((s) => ({ type: 'screen', id: s.id, name: s.name, url: s.url, app: null }));

  if (category.title === 'Categories') {
    const apps = (await inspirationsApi.listApps(category.id)).filter((a) => a.platforms.some((p) => platforms.includes(p)));
    return apps.slice(0, PREVIEW_LIMIT).map((a) => ({ type: 'app', id: a.id, name: a.name, url: null, app: a }));
  }
  if (category.title === 'Screens') {
    return fromScreens((await inspirationsApi.listScreens({ ...scoped, screenTypes: [category.id as ScreenType] }, 0, 'curated')).items);
  }
  if (category.title === 'UI Elements') {
    return fromScreens((await inspirationsApi.listScreens(scoped, 0, 'curated', { element: category.id })).items);
  }
  if (category.title === 'Flows') {
    const flows = (await inspirationsApi.listFlows(category.id)).filter((f) => platforms.includes(f.platform));
    if (!flows.length) return [];
    // The top flow in this category, previewed as its actual sequence of screens.
    return fromScreens(await inspirationsApi.getScreens(flows[0].screenIds.slice(0, PREVIEW_LIMIT).filter(Boolean)));
  }
  return [];
}

function decodeImage(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}

function loadPreview(category: { id: string; title: string }, platforms: Platform[]): Promise<PreviewItem[]> {
  const key = previewKey(category, platforms);
  let pending = previewCache.get(key);
  if (!pending) {
    pending = fetchPreview(category, platforms).then(async (items) => {
      const images = items.map(previewImage).filter((src): src is string => Boolean(src));
      await Promise.race([
        Promise.all(images.map(decodeImage)),
        new Promise((resolve) => setTimeout(resolve, PREVIEW_IMAGE_WAIT_MS)),
      ]);
      previewReady.set(key, items);
      return items;
    });
    // A failed load is dropped, so the next hover tries again.
    pending.catch(() => previewCache.delete(key));
    previewCache.set(key, pending);
  }
  return pending;
}

/**
 * The cursor card beside a taxonomy link. Everything it previews is scoped to
 * the platform being browsed — apps, screens and flows from Web when Web is
 * chosen — so what it shows is what the link leads to, and a Web screen is
 * drawn landscape rather than squeezed into a phone frame.
 */
function HoverPreview({
  category,
  mousePos,
  platforms,
}: {
  category: { id: string; title: string };
  mousePos: { x: number; y: number };
  platforms: Platform[];
}) {
  const isWeb = platforms.every(isDesktopPlatform);
  const isScreens = category.title === 'Screens' || category.title === 'Flows' || category.title === 'UI Elements';

  const key = previewKey(category, platforms);
  const { data } = useAsync(() => loadPreview(category, platforms), `preview-${key}`);

  const [cycleIndex, setCycleIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCycleIndex(i => i + 1), 800);
    return () => clearInterval(timer);
  }, []);
  // A different link starts its cycle from its first item.
  const [cycleKey, setCycleKey] = useState(key);
  if (cycleKey !== key) {
    setCycleKey(key);
    setCycleIndex(0);
  }

  // Only ever the hovered link's own items: until they are loaded the card
  // stays hidden rather than showing the previous link's.
  const shownItems = previewReady.get(key) ?? data ?? [];

  if (shownItems.length === 0) return null;

  const top = mousePos.y > window.innerHeight - (isScreens ? 400 : 200) 
    ? mousePos.y - (isScreens ? 380 : 160) 
    : mousePos.y + 16;
    
  const left = mousePos.x > window.innerWidth - (isScreens ? 250 : 200) 
    ? mousePos.x - (isScreens ? 200 : 130) 
    : mousePos.x + 16;

  const active = cycleIndex % shownItems.length;
  const preview = shownItems[active];

  return createPortal(
    <div 
      className={`ins-explore-cursor-preview ${isScreens ? 'is-screen' : ''} ${isWeb ? 'is-web' : ''}`}
      style={{ position: 'fixed', top, left }}
    >
      {/* Every item stays mounted, stacked in one cell, and the cycle only
          switches which one shows. Swapping in a fresh <img> each turn showed
          a blank tile until it loaded, which read as the card flickering. */}
      <div className="ins-explore-cursor-stack">
        {shownItems.map((item, i) => (
          <div key={item.id} className={`ins-explore-cursor-slide ${i === active ? 'is-active' : ''}`} aria-hidden={i !== active}>
            {item.type === 'screen' && item.url ? (
              <img
                src={inspirationsApi.mediaUrl(item.url) ?? item.url}
                alt=""
                className={`ins-explore-cursor-logo is-screen ${isWeb ? 'is-web' : ''}`}
              />
            ) : item.app ? (
              <AppLogo app={item.app} size={84} className="ins-explore-cursor-logo" />
            ) : null}
          </div>
        ))}
      </div>
      
      {!isScreens && (
        <p className="ins-explore-cursor-title">{preview.name}</p>
      )}
    </div>,
    document.body
  );
}


/** Caps each column so one taxonomy with many more values than the others
 * (e.g. a store with 12 screen types but 3 industries) doesn't throw the
 * four columns out of visual balance. */
const MAX_TAXONOMY_ITEMS = 5;

/**
 * /inspirations — Explore. Title, then the content-type tabs (with the screen
 * count and Filters trigger riding their right edge) and the gallery, within
 * the first viewport.
 */
export function ExploreView() {
  // The taxonomy below is the browsed platform's own (see usePlatformMeta):
  // choose Web in the header and these four columns are what Web holds.
  const { meta, loading } = usePlatformMeta();
  const params = useSearchParams();
  const platforms = browsedPlatforms(params);
  // Each link lands on a page that applies the URL's platform, so the choice
  // is carried across — and left off for the iOS default, which pages assume.
  const rawPlatform = params.get('platform');
  const withPlatform = (href: string) =>
    rawPlatform ? `${href}${href.includes('?') ? '&' : '?'}platform=${encodeURIComponent(rawPlatform)}` : href;

  const [hoveredCategory, setHoveredCategory] = useState<{ id: string, title: string } | null>(null);
  // The link under the pointer (or keyboard focus): its name is typed into the heading.
  const [hoveredLabel, setHoveredLabel] = useState<{ text: string; emoji: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  // Read once, so the class it sets is the same on every render and never fights the ones toggled below.
  const [startFolded] = useState(returningFolded);
  // Until when a scroll is the page's own (bringing results back up after a filter change), not the
  // visitor's: it mustn't unfold the heading by arriving at the top.
  const ownScrollUntil = useRef(0);

  // The heading and the four lists fold away on the first scroll down and the gallery fits the window
  // (the toolbar under the header, the first row of screens right below it, nothing cut); scrolling up at
  // the very top unfolds them. Driven by the scroll's direction, not by how far the page has scrolled:
  // the fold eases in CSS while the page stays where it is, so nothing jumps back, and nothing is held —
  // a scroll that keeps going simply carries on. Toggled as a class, so scrolling never re-renders.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || loading) return;
    const head = view.querySelector<HTMLElement>('.ins-explore-head');
    const folded = () => view.classList.contains('is-head-collapsed');
    // Only when there's something to fold: on narrower windows the heading and lists aren't shown at all,
    // and folding would swallow a scroll and shift the page for nothing.
    const canFold = () => (head?.querySelector<HTMLElement>('.ins-explore-head-inner')?.scrollHeight ?? 0) > 0 && head?.offsetParent !== null;
    // Returned to folded (startFolded), or set up again after a cleanup that opened it: folded, as left.
    if (folded() || returningFolded()) {
      view.classList.add('is-head-collapsed');
      if (head) head.inert = true;
    }
    const fold = (on: boolean) => {
      view.classList.toggle('is-head-collapsed', on);
      // Folded away, its links leave the tab order too, and a preview card open under the pointer closes.
      if (head) head.inert = on;
      if (on) {
        setHoveredCategory(null);
        setHoveredLabel(null);
      }
    };
    // A fast flick that folds keeps going — first its push, still speeding up, then its coasting, a stream
    // of ever-smaller wheel events — which would scroll straight past the fitted view and cut the first
    // row. Both are absorbed, and only them: after the push, a fresh swipe arrives as a growing push and
    // lets go at once, so the page never holds anyone for long.
    let coastUntil = 0;
    let coastStarted = 0;
    let lastPush = 0;
    const onWheel = (e: WheelEvent) => {
      // A scroll in the Filters drawer scrolls the drawer, not the page.
      if (e.target instanceof Element && e.target.closest('.ins-fdrawer')) return;
      const y = window.scrollY;
      const now = performance.now();
      const push = Math.abs(e.deltaY);
      if (now < coastUntil && e.deltaY > 0) {
        // The flick's own push (its first moments, still speeding up) and then its coasting are held.
        if (now - coastStarted < FLICK_PUSH_MS || push <= lastPush * 1.3 + 2) {
          e.preventDefault();
          lastPush = push;
          coastUntil = Math.min(Math.max(now + COAST_GAP_MS, coastStarted + FLICK_PUSH_MS), coastStarted + COAST_MAX_MS);
          return;
        }
        coastUntil = 0;
      }
      if (e.deltaY > 0 && !folded() && y < FOLD_ZONE_PX && canFold()) {
        // This first nudge folds instead of scrolling; a new swipe scrolls as usual.
        e.preventDefault();
        fold(true);
        coastStarted = now;
        coastUntil = now + COAST_GAP_MS;
        lastPush = push;
      } else if (e.deltaY < 0 && folded() && y <= 0) {
        e.preventDefault();
        fold(false);
      }
    };
    // A wheel listener that can hold the page (passive: false) makes the browser wait on this script before
    // every scroll step, so it's only there where it's needed — at the very top, where the fold happens, and
    // while a flick's coasting is being absorbed. Everywhere else the page scrolls on its own, untouched.
    let wheelOn = false;
    const syncWheel = () => {
      const want = window.scrollY < FOLD_ZONE_PX || performance.now() < coastUntil;
      if (want === wheelOn) return;
      wheelOn = want;
      if (want) window.addEventListener('wheel', onWheel, { passive: false });
      else window.removeEventListener('wheel', onWheel);
    };
    // Touch and keys: the same, from where the page has got to.
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (!folded() && y > FOLD_ZONE_PX && y > lastY && canFold()) fold(true);
      else if (folded() && y <= 0 && lastY > 0 && performance.now() > ownScrollUntil.current) fold(false);
      lastY = y;
      syncWheel();
    };
    syncWheel();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      leftFolded = folded();
      fold(false);
    };
  }, [loading]);

  // Once the toolbar row is pinned under the header, the two share one pane of glass (CSS: the row's
  // backdrop reaches up behind the header, whose own glass steps aside) instead of two blurs meeting at a
  // seam. "Pinned" is measured — the row's top at its sticky offset — on scroll, on resize and when the
  // heading's fold finishes, and kept as a class so it costs no re-render.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || loading) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const anchor = view.querySelector<HTMLElement>('.ins-ftoolbar-anchor.is-pinned');
      // At its own sticky offset: under the header, or near the top while the header has stepped away.
      const stuck = Boolean(anchor && anchor.getBoundingClientRect().top <= (parseFloat(getComputedStyle(anchor).top) || 0) + 0.5);
      view.classList.toggle('is-bar-stuck', stuck);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    view.addEventListener('transitionend', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      view.removeEventListener('transitionend', schedule);
      view.classList.remove('is-bar-stuck');
    };
  }, [loading]);

  // A filter, sort or category picked while scrolled down the gallery: the list changes length under the
  // visitor, which could leave them in blank space or mid-list. Bring the results' start back up to the
  // toolbar's line, smoothly — only from below it, so a pick made at the top of the page moves nothing.
  const query = params.toString();
  const lastQuery = useRef(query);
  useEffect(() => {
    if (lastQuery.current === query) return;
    lastQuery.current = query;
    const view = viewRef.current;
    const anchor = view?.querySelector<HTMLElement>('.ins-ftoolbar-anchor');
    const grid = view?.querySelector<HTMLElement>('.ins-app-grid');
    if (!anchor || !grid) return;
    // Under the header: scrolling back up brings it back (FilterToolbar), even when it had stepped away.
    const line = (document.querySelector<HTMLElement>('.ins-header')?.offsetHeight ?? 0) + anchor.offsetHeight;
    const target = Math.round(grid.getBoundingClientRect().top + window.scrollY - line);
    if (window.scrollY > target + 1) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ownScrollUntil.current = performance.now() + OWN_SCROLL_MS;
      window.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, [query]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Every value here comes from meta.taxonomy — what the store actually
  // holds — rather than a fixed list, so a group disappears instead of
  // showing entries with nothing behind them. Each item links into the page
  // that already filters on that exact query param.
  // Lead with what the library holds most of, not whichever values sort first
  // (which put "Alert" and "Banner" ahead of the nav bar on every screen).
  // Ties keep the taxonomy's own order. An older backend without usage numbers
  // simply keeps that order.
  const mostUsed = <T extends string>(values: T[], counts?: Record<string, number>): T[] =>
    counts ? [...values].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)) : values;
  // "Other" is where unclassified screens land — never a destination worth featuring.
  const screenTypes = mostUsed(meta.taxonomy.screenTypes, meta.usage?.screenTypes).filter((type) => type !== 'other');

  const usage = meta.usage;
  const taxonomyGroups = [
    {
      title: 'Categories',
      section: 'categories' as SearchSection,
      items: mostUsed(meta.taxonomy.industries, usage?.industries).slice(0, MAX_TAXONOMY_ITEMS).map((industry) => ({
        key: industry,
        label: INDUSTRY_LABEL[industry] ?? industry,
        emoji: taxonomyEmoji('industry', industry),
        count: usage?.industries[industry],
        href: withPlatform(`${INSPIRATIONS_ROUTES.screens}?industry=${industry}`),
      })),
    },
    {
      title: 'Screens',
      section: 'screens' as SearchSection,
      items: screenTypes.slice(0, MAX_TAXONOMY_ITEMS).map((type) => ({
        key: type,
        label: screenTypeLabel(type),
        emoji: taxonomyEmoji('screen', type),
        count: usage?.screenTypes[type],
        href: withPlatform(`${INSPIRATIONS_ROUTES.screens}?type=${type}`),
      })),
    },
    {
      title: 'UI Elements',
      section: 'elements' as SearchSection,
      items: mostUsed(meta.taxonomy.elements, usage?.elements).slice(0, MAX_TAXONOMY_ITEMS).map((kind) => ({
        key: kind,
        label: elementLabel(kind),
        emoji: taxonomyEmoji('element', kind),
        count: usage?.elements[kind],
        href: withPlatform(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(kind)}`),
      })),
    },
    {
      title: 'Flows',
      section: 'flows' as SearchSection,
      items: mostUsed(meta.taxonomy.flowCategories, usage?.flowCategories).slice(0, MAX_TAXONOMY_ITEMS).map((category) => ({
        key: category,
        label: flowCategoryLabel(category),
        emoji: taxonomyEmoji('flow', category),
        count: usage?.flowCategories[category],
        href: withPlatform(`${INSPIRATIONS_ROUTES.flows}?category=${encodeURIComponent(category)}`),
      })),
    },
  ].filter((group) => group.items.length > 0);

  // The heading stays mounted through loading (only what's below it swaps
  // from placeholder to content), so its typed phrase starts once on first
  // paint instead of restarting when the taxonomy arrives.
  return (
    <div ref={viewRef} className={`ins-explore-view${startFolded ? ' is-head-collapsed' : ''}`} aria-busy={loading || undefined}>
      {/* The heading and the lists, folded away together on the first scroll down (see the effect above). */}
      <div className="ins-explore-head">
        <div className="ins-explore-head-inner">
      <PageHeading title={<RotatingTitle override={hoveredLabel?.text} overrideEmoji={hoveredLabel?.emoji} />} />
      {!loading && taxonomyGroups.length > 0 && (
        <section
          className="ins-explore-taxonomy"
          aria-label="Explore categories"
          // Heading for a link: start every link's preview now, so the card
          // is usually ready by the time the pointer reaches one (each loads
          // once per visit; see loadPreview).
          onPointerEnter={() => {
            for (const group of taxonomyGroups) {
              for (const item of group.items) void loadPreview({ id: item.key, title: group.title }, platforms).catch(() => undefined);
            }
          }}
        >
          {taxonomyGroups.map((group) => (
            <div key={group.title} className="ins-explore-taxonomy-group">
              <h2 className="ins-explore-taxonomy-title">
                <button type="button" className="ins-explore-taxonomy-titlebtn" onClick={() => openSearch(group.section)}>
                  {group.title}
                </button>
              </h2>
              <ul className="ins-explore-taxonomy-list">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="ins-explore-taxonomy-link"
                      onMouseEnter={(e) => {
                        setHoveredCategory({ id: item.key, title: group.title });
                        setHoveredLabel({ text: item.label, emoji: item.emoji });
                        setMousePos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => {
                        setHoveredCategory(null);
                        setHoveredLabel(null);
                      }}
                      onFocus={() => setHoveredLabel({ text: item.label, emoji: item.emoji })}
                      onBlur={() => setHoveredLabel(null)}
                    >
                      <span className="ins-explore-index-label">{item.label}</span>
                      <span className="ins-explore-index-leader" aria-hidden />
                      {item.count !== undefined && (
                        <span className="ins-explore-index-count">{item.count.toLocaleString('en-US')}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
        </div>
      </div>
      {loading ? (
        <ExploreSkeleton web={platforms.every(isDesktopPlatform)} />
      ) : (
      <>
      <Suspense fallback={null}>
        <FilteredGallery counts={meta.counts} />
      </Suspense>
      <BackToTop />

      {mounted && hoveredCategory && (
        <HoverPreview category={hoveredCategory} mousePos={mousePos} platforms={platforms} />
      )}
      </>
      )}
    </div>
  );
}
