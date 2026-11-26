import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { ExploreView } from '@/components/inspirations/views/ExploreView';
import { sectionMetadata } from '@/lib/config/share';

export const generateMetadata = sectionMetadata(
  '/inspirations',
  'Motvin Inspirations — Search UI screens, flows and patterns',
  'A visual search engine for product design. Find real screens, flows, patterns and UI elements from shipped iOS apps, web apps and websites.',
);

/** /inspirations — Explore. The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it. */
export default async function InspirationsExplorePage({ searchParams }: PageProps<'/inspirations'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('explore', await searchParams)}>
      <Suspense fallback={null}>
        <ExploreView />
      </Suspense>
    </SeedProvider>
  );
}
