import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchView } from '@/components/inspirations/views/SearchView';

export const metadata: Metadata = { title: 'Search — Motvin Inspirations' };

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}
