'use client';

import { Suspense } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { formatCount } from '@/lib/inspirations/taxonomy';
import { ContentTabs } from '../ContentTabs';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useAsync } from '../useAsync';

/** /inspirations/screens — the full gallery with filters. */
export function ScreensView() {
  const { data: counts } = useAsync(() => inspirationsApi.getCounts(), 'counts');
  return (
    <>
      <PageHeading title="Screens" count={counts ? formatCount(counts.screens) : undefined} />
      <ContentTabs counts={counts} active="screens" />
      <Suspense fallback={null}>
        <FilteredGallery />
      </Suspense>
    </>
  );
}
