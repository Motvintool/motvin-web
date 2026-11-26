import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { NewThisWeekView } from '@/components/inspirations/views/NewThisWeekView';
import { sectionMetadata } from '@/lib/config/share';

export const generateMetadata = sectionMetadata(
  '/inspirations/new',
  'New this week — Motvin Inspirations',
  'The apps added to Motvin Inspirations in the last 7 days: their real screens, flows and patterns.',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function NewThisWeekPage({ searchParams }: PageProps<'/inspirations/new'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('new', await searchParams)}>
      <Suspense fallback={null}>
        <NewThisWeekView />
      </Suspense>
    </SeedProvider>
  );
}
