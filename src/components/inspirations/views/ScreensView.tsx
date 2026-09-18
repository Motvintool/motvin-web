'use client';

import { Suspense } from 'react';
import { formatCount } from '@/lib/inspirations/taxonomy';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useMeta } from '../useMeta';

/** /inspirations/screens — the full gallery with filters. */
export function ScreensView() {
  const meta = useMeta();
  return (
    <>
      <PageHeading title="Screens" count={meta.counts.screens ? formatCount(meta.counts.screens) : undefined} />
      <Suspense fallback={null}>
        <FilteredGallery counts={meta.counts} active="screens" />
      </Suspense>
    </>
  );
}
