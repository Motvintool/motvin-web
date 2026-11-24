import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SitesView } from '@/components/inspirations/views/SitesView';

export const metadata: Metadata = { title: 'Sites — Motvin Inspirations' };

export default function SitesPage() {
  return (
    <Suspense fallback={null}>
      <SitesView />
    </Suspense>
  );
}
