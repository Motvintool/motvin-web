import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PatternsView } from '@/components/inspirations/views/PatternsView';

export const metadata: Metadata = { title: 'Patterns — Motvin Inspirations' };

export default function PatternsPage() {
  return (
    <Suspense fallback={null}>
      <PatternsView />
    </Suspense>
  );
}
