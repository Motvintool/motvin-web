import { sectionMetadata } from '@/lib/config/share';
import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { PatternsView } from '@/components/inspirations/views/PatternsView';

export const generateMetadata = sectionMetadata(
  '/inspirations/patterns',
  'Patterns — Motvin Inspirations',
  'Common UX patterns from real products, with every app screen that uses each one, so you can see how it is done.',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function PatternsPage({ searchParams }: PageProps<'/inspirations/patterns'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('patterns', await searchParams)}>
      <Suspense fallback={null}>
        <PatternsView />
      </Suspense>
    </SeedProvider>
  );
}
