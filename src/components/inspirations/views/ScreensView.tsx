'use client';

import { Suspense } from 'react';
import { formatCount } from '@/lib/inspirations/taxonomy';
import { ContentTabs } from '../ContentTabs';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useMeta } from '../useMeta';

/** /inspirations/screens — the full gallery with filters. */
export function ScreensView() {
  const meta = useMeta();
  return (
    <>
      <PageHeading title="Screens" count={meta.counts.screens ? formatCount(meta.counts.screens) : undefined} />
      <ContentTabs counts={meta.counts} active="screens" />
      <Suspense fallback={null}>
        <FilteredGallery />
      </Suspense>
    </>
  );
}
