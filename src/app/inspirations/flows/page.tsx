import { sectionMetadata } from '@/lib/config/share';
import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { FlowsView } from '@/components/inspirations/views/FlowsView';

export const generateMetadata = sectionMetadata(
  '/inspirations/flows',
  'Flows — Motvin Inspirations',
  'Step-by-step user flows from real apps (onboarding, sign-up, checkout, search and more), screen by screen, in order.',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function FlowsPage({ searchParams }: PageProps<'/inspirations/flows'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('flows', await searchParams)}>
      <Suspense fallback={null}>
        <FlowsView />
      </Suspense>
    </SeedProvider>
  );
}
