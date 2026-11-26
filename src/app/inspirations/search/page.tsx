import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchView } from '@/components/inspirations/views/SearchView';

export const metadata: Metadata = {
  title: 'Search — Motvin Inspirations',
  // Every query is its own thin page: search engines may follow its links, not list it.
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}
