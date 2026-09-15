'use client';

import { Suspense } from 'react';
import { ContentTabs } from '../ContentTabs';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useMeta } from '../useMeta';
import { VisualSearchEntry } from '../VisualSearchEntry';

/**
 * /inspirations — Explore. Title, content-type tabs, filters, then the gallery
 * within the first viewport.
 */
export function ExploreView() {
  const meta = useMeta();
  return (
    <>
      <PageHeading title="Explore" />
      <ContentTabs counts={meta.counts} active="explore" />
      <Suspense fallback={null}>
        <FilteredGallery />
      </Suspense>
      {meta.counts.screens > 0 && <VisualSearchEntry />}
    </>
  );
}
