import { Suspense } from 'react';
import { ExploreView } from '@/components/inspirations/views/ExploreView';

/** /inspirations — Explore. */
export default function InspirationsExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExploreView />
    </Suspense>
  );
}
