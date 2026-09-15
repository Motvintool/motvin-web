import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SavedView } from '@/components/inspirations/views/SavedView';

export const metadata: Metadata = { title: 'Saved — Motvin Inspirations' };

export default function SavedPage() {
  return (
    <Suspense fallback={null}>
      <SavedView />
    </Suspense>
  );
}
