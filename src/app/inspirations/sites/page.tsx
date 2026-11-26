import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/config/share';
import { Suspense } from 'react';
import { SeedProvider } from '@/components/inspirations/SeedProvider';
import { sectionSeeds } from '@/lib/inspirations/seeds';
import { SitesView } from '@/components/inspirations/views/SitesView';

// Sites are in Webs only, so the page's one address is the Webs one (SitesView moves a bare link there).
export const metadata: Metadata = pageMetadata(
  'Sites — Motvin Inspirations',
  'Full pages and sections from real websites (landing pages, pricing, about, blogs and more) to study how great sites are built.',
  '/inspirations/sites?platform=web',
);

// The plain address's content comes with the page (lib/inspirations/seeds.ts): search engines read it.
export default async function SitesPage({ searchParams }: PageProps<'/inspirations/sites'>) {
  return (
    <SeedProvider seeds={await sectionSeeds('sites', await searchParams)}>
      <Suspense fallback={null}>
        <SitesView />
      </Suspense>
    </SeedProvider>
  );
}
