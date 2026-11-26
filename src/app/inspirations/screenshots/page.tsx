import { sectionMetadata } from '@/lib/config/share';
import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { ScreenshotsView } from '@/components/inspirations/views/ScreenshotsView';

export const generateMetadata = sectionMetadata(
  '/inspirations/screenshots',
  'App Store Screenshots — Motvin Inspirations',
  'App Store screenshots from real apps, side by side: see how top products present themselves on the store.',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function ScreenshotsPage({ searchParams }: PageProps<'/inspirations/screenshots'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('screenshots', await searchParams)}>
      <Suspense fallback={null}>
        <ScreenshotsView />
      </Suspense>
    </SeedProvider>
  );
}
