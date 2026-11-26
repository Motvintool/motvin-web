import { sectionMetadata } from '@/lib/config/share';
import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { UiElementsView } from '@/components/inspirations/views/UiElementsView';

export const generateMetadata = sectionMetadata(
  '/inspirations/ui-elements',
  'UI Elements — Motvin Inspirations',
  'Buttons, cards, modals, tab bars, forms and other UI elements from real app screens, side by side to compare how products build them.',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function UiElementsPage({ searchParams }: PageProps<'/inspirations/ui-elements'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('ui-elements', await searchParams)}>
      <Suspense fallback={null}>
        <UiElementsView />
      </Suspense>
    </SeedProvider>
  );
}
