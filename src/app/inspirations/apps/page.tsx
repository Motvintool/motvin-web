import { sectionMetadata } from '@/lib/config/share';
import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { AppsView } from '@/components/inspirations/views/AppsView';

export const generateMetadata = sectionMetadata(
  '/inspirations/apps',
  'Apps — Motvin Inspirations',
  'Browse real iOS apps, web apps and websites by industry, and open any one to see all of its screens, flows and patterns.',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function AppsPage({ searchParams }: PageProps<'/inspirations/apps'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('apps', await searchParams)}>
      <Suspense fallback={null}>
        <AppsView />
      </Suspense>
    </SeedProvider>
  );
}
