'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, SCREEN_TYPE_LABEL, elementLabel, flowCategoryLabel } from '@/lib/inspirations/taxonomy';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useMeta } from '../useMeta';
import { ExploreSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';
import { EMPTY_META, inspirationsApi } from '@/lib/inspirations/api';


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
  const { data, loading } = useAsync(() => inspirationsApi.getMeta(), 'meta');
  const meta = data ?? EMPTY_META;

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
        href: `${INSPIRATIONS_ROUTES.screens}?industry=${industry}`,
      })),
    },
    {
      title: 'Screens',
      items: meta.taxonomy.screenTypes.slice(0, MAX_TAXONOMY_ITEMS).map((type) => ({
        key: type,
        label: SCREEN_TYPE_LABEL[type] ?? type,
        href: `${INSPIRATIONS_ROUTES.screens}?type=${type}`,
      })),
    },
    {
      title: 'UI Elements',
      items: meta.taxonomy.elements.slice(0, MAX_TAXONOMY_ITEMS).map((kind) => ({
        key: kind,
        label: elementLabel(kind),
        href: `${INSPIRATIONS_ROUTES.uiElements}?kind=${encodeURIComponent(kind)}`,
      })),
    },
    {
      title: 'Flows',
      items: meta.taxonomy.flowCategories.slice(0, MAX_TAXONOMY_ITEMS).map((category) => ({
        key: category,
        label: flowCategoryLabel(category),
        href: `${INSPIRATIONS_ROUTES.flows}?category=${encodeURIComponent(category)}`,
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
                    <Link href={item.href} className="ins-explore-taxonomy-link">{item.label}</Link>
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
    </div>
  );
}
