import { sectionMetadata } from '@/lib/config/share';
import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { ScreensView } from '@/components/inspirations/views/ScreensView';

export const generateMetadata = sectionMetadata(
  '/inspirations/screens',
  'Screens — Motvin Inspirations',
  'Real UI screens from shipped apps: sign-up, onboarding, checkout, settings and more. Filter by screen type, style and industry.',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function ScreensPage({ searchParams }: PageProps<'/inspirations/screens'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('screens', await searchParams)}>
      <Suspense fallback={null}>
        <ScreensView />
      </Suspense>
    </SeedProvider>
  );
}
