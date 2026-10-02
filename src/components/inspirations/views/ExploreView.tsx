'use client';

import type { Platform, Screen } from '@/lib/inspirations/types';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, SCREEN_TYPE_LABEL, elementLabel, flowCategoryLabel } from '@/lib/inspirations/taxonomy';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { usePlatformMeta } from '../useMeta';
import { ExploreSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';
import { AppLogo } from '../AppLogo';
import { inspirationsApi } from '@/lib/inspirations/api';
import { EMPTY_FILTERS, browsedPlatforms } from '@/lib/inspirations/filters';

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
  const platformKey = platforms.join(',');
  const isWeb = platforms.length === 1 && platforms[0] === 'web';
  const isScreens = category.title === 'Screens' || category.title === 'Flows' || category.title === 'UI Elements';
  const isFlows = category.title === 'Flows';
  const isCategories = category.title === 'Categories';
  const isElements = category.title === 'UI Elements';
  
  const { data: appsData } = useAsync(async () => {
    if (!isCategories) return [];
    const apps = await inspirationsApi.listApps(category.id);
    return apps.filter((a) => a.platforms.some((p) => platforms.includes(p)));
  }, `preview-apps-${category.id}-${platformKey}`);

  const { data: screensData } = useAsync(() => {
    const scoped = { ...EMPTY_FILTERS, platforms };
    if (category.title === 'Screens') {
      return inspirationsApi.listScreens({ ...scoped, screenTypes: [category.id as any] }, 0, 'curated');
    }
    if (isElements) {
      return inspirationsApi.listScreens(scoped, 0, 'curated', { element: category.id });
    }
    return Promise.resolve({ items: [] } as any);
  }, `preview-screens-${category.id}-${category.title}-${platformKey}`);

  const { data: flowsScreensData } = useAsync(async (): Promise<Screen[]> => {
    if (!isFlows) return [];
    const flows = (await inspirationsApi.listFlows(category.id)).filter((f) => platforms.includes(f.platform));
    if (!flows.length) return [];
    // Grab the top flow in this category and preview its actual sequence of screens!
    const screenIds = flows[0].screenIds.slice(0, 5).filter(Boolean);
    return inspirationsApi.getScreens(screenIds);
  }, `preview-flows-${category.id}-${platformKey}`);

  const [cycleIndex, setCycleIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCycleIndex(i => i + 1), 800);
    return () => clearInterval(timer);
  }, []);

  const items = isFlows
    ? (flowsScreensData || []).slice(0, 5).map((s: Screen) => ({ type: 'screen', id: s.id, name: s.name, url: s.url, app: null }))
    : isScreens
    ? (screensData?.items || []).slice(0, 5).map((s: Screen) => ({ type: 'screen', id: s.id, name: s.name, url: s.url, app: null }))
    : (appsData || []).slice(0, 5).map(a => ({ type: 'app', id: a.id, name: a.name, url: null, app: a }));

  if (items.length === 0) return null;

  const top = mousePos.y > window.innerHeight - (isScreens ? 400 : 200) 
    ? mousePos.y - (isScreens ? 380 : 160) 
    : mousePos.y + 16;
    
  const left = mousePos.x > window.innerWidth - (isScreens ? 250 : 200) 
    ? mousePos.x - (isScreens ? 200 : 130) 
    : mousePos.x + 16;

  const preview = items[cycleIndex % items.length];

  return createPortal(
    <div 
      className={`ins-explore-cursor-preview ${isScreens ? 'is-screen' : ''} ${isWeb ? 'is-web' : ''}`}
      style={{ position: 'fixed', top, left }}
    >
      {preview.type === 'screen' && preview.url ? (
        <img 
          key={preview.id}
          src={inspirationsApi.mediaUrl(preview.url) ?? preview.url} 
          alt="" 
          className={`ins-explore-cursor-logo is-screen ${isWeb ? 'is-web' : ''}`}
        />
      ) : preview.app ? (
        <AppLogo key={preview.id} app={preview.app} size={84} className="ins-explore-cursor-logo" />
      ) : null}
      
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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Every value here comes from meta.taxonomy — what the store actually
  // holds — rather than a fixed list, so a group disappears instead of
  // showing entries with nothing behind them. Each item links into the page
  // that already filters on that exact query param.
  const taxonomyGroups = [
    {
      title: 'Categories',
      items: meta.taxonomy.industries.slice(0, MAX_TAXONOMY_ITEMS).map((industry) => ({
        key: industry,
        label: INDUSTRY_LABEL[industry] ?? industry,
        href: withPlatform(`${INSPIRATIONS_ROUTES.screens}?industry=${industry}`),
      })),
    },
    {
      title: 'Screens',
      items: meta.taxonomy.screenTypes.slice(0, MAX_TAXONOMY_ITEMS).map((type) => ({
        key: type,
        label: SCREEN_TYPE_LABEL[type] ?? type,
        href: withPlatform(`${INSPIRATIONS_ROUTES.screens}?type=${type}`),
      })),
    },
    {
      title: 'UI Elements',
      items: meta.taxonomy.elements.slice(0, MAX_TAXONOMY_ITEMS).map((kind) => ({
        key: kind,
        label: elementLabel(kind),
        href: withPlatform(`${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(kind)}`),
      })),
    },
    {
      title: 'Flows',
      items: meta.taxonomy.flowCategories.slice(0, MAX_TAXONOMY_ITEMS).map((category) => ({
        key: category,
        label: flowCategoryLabel(category),
        href: withPlatform(`${INSPIRATIONS_ROUTES.flows}?category=${encodeURIComponent(category)}`),
      })),
    },
  ].filter((group) => group.items.length > 0);

  if (loading) {
    return <ExploreSkeleton />;
  }

  return (
    <div className="ins-explore-view">
      <PageHeading title="Inspirations" />
      {taxonomyGroups.length > 0 && (
        <section className="ins-explore-taxonomy" aria-label="Explore categories">
          {taxonomyGroups.map((group) => (
            <div key={group.title} className="ins-explore-taxonomy-group">
              <h2 className="ins-explore-taxonomy-title">{group.title}</h2>
              <ul className="ins-explore-taxonomy-list">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <Link 
                      href={item.href} 
                      className="ins-explore-taxonomy-link"
                      onMouseEnter={(e) => {
                        if (group.title === 'Categories' || group.title === 'Screens' || group.title === 'Flows' || group.title === 'UI Elements') {
                          setHoveredCategory({ id: item.key, title: group.title });
                          setMousePos({ x: e.clientX, y: e.clientY });
                        }
                      }}
                      onMouseMove={(e) => {
                        if (group.title === 'Categories' || group.title === 'Screens' || group.title === 'Flows' || group.title === 'UI Elements') {
                          setMousePos({ x: e.clientX, y: e.clientY });
                        }
                      }}
                      onMouseLeave={() => {
                        if (group.title === 'Categories' || group.title === 'Screens' || group.title === 'Flows' || group.title === 'UI Elements') {
                          setHoveredCategory(null);
                        }
                      }}
                    >
                      {item.label}
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
    </div>
  );
}
