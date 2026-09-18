'use client';

import { Suspense } from 'react';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useMeta } from '../useMeta';
import { VisualSearchEntry } from '../VisualSearchEntry';

/**
 * /inspirations — Explore. Title, then the content-type tabs (with the screen
 * count and Filters trigger riding their right edge) and the gallery, within
 * the first viewport.
 */
export function ExploreView() {
  const meta = useMeta();
  return (
    <>
      <PageHeading
        title="Explore"
        count={meta.counts.screens ? String(meta.counts.screens) : undefined}
        description="Real screens from real apps, with the flows and patterns behind them."
      />
      <Suspense fallback={null}>
        <FilteredGallery counts={meta.counts} active="explore" />
      </Suspense>
      {meta.counts.screens > 0 && <VisualSearchEntry />}
    </>
  );
}
