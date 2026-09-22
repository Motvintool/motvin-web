'use client';

import { Suspense } from 'react';
import { FilteredGallery } from '../FilteredGallery';
import { PageHeading } from '../PageHeading';
import { useMeta } from '../useMeta';

/**
 * /inspirations/ui-elements — screens browsed by the components recorded in
 * them. Renders the same toolbar-driven gallery as /inspirations/screens; the
 * UI Elements pill is simply the dimension a visitor lands here to use
 * (`?kind=` links from Explore and elsewhere are read as `?element=`), and
 * every other dimension is available to narrow further — something the old
 * single chip row here couldn't do.
 */
export function UiElementsView() {
  const meta = useMeta();
  return (
    <>
      <PageHeading title="UI Elements" />
      <Suspense fallback={null}>
        <FilteredGallery counts={meta.counts} active="ui-elements" />
      </Suspense>
    </>
  );
}
