import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SavedView } from '@/components/inspirations/views/SavedView';

export const metadata: Metadata = { title: 'Collections — Motvin Inspirations' };

export default function CollectionsPage() {
  return (
    <Suspense fallback={null}>
      <SavedView />
    </Suspense>
  );
}
