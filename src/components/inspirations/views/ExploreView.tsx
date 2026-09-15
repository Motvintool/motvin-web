'use client';

import { Suspense } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { ContentTabs } from '../ContentTabs';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useAsync } from '../useAsync';
import { VisualSearchEntry } from '../VisualSearchEntry';

/**
 * /inspirations — Explore. Title, content-type tabs, filters, then the
 * gallery within the first viewport. Visual search sits at the end so it
 * never competes with the screens.
 */
export function ExploreView() {
  const { data: counts } = useAsync(() => inspirationsApi.getCounts(), 'counts');
  return (
    <>
      <PageHeading title="Explore" />
      <ContentTabs counts={counts} active="explore" />
      <Suspense fallback={null}>
        <FilteredGallery />
      </Suspense>
      <VisualSearchEntry />
    </>
  );
}
