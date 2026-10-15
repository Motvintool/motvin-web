'use client';

import { isDesktopPlatform, type App, type Platform, type Screen, type ScreenType } from '@/lib/inspirations/types';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { openSearch, type SearchSection } from '@/lib/inspirations/openSearch';
import { elementLabel, flowCategoryLabel, INDUSTRY_LABEL, screenTypeLabel } from '@/lib/inspirations/taxonomy';
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
/** Longest the card waits on its pictures before showing anyway. */
const PREVIEW_IMAGE_WAIT_MS = 1500;

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
  const isWeb = platforms.length === 1 && isDesktopPlatform(platforms[0]);
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
    <div className="ins-explore-view" aria-busy={loading || undefined}>
      <PageHeading title={<RotatingTitle override={hoveredLabel?.text} overrideEmoji={hoveredLabel?.emoji} />} />
      {loading ? (
        <ExploreSkeleton web={platforms.length === 1 && isDesktopPlatform(platforms[0])} />
      ) : (
      <>
      {taxonomyGroups.length > 0 && (
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
      <Suspense fallback={null}>
        <FilteredGallery counts={meta.counts} />
      </Suspense>

      {mounted && hoveredCategory && (
        <HoverPreview category={hoveredCategory} mousePos={mousePos} platforms={platforms} />
      )}
      </>
      )}
    </div>
  );
}
