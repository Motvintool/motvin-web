import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FlowsView } from '@/components/inspirations/views/FlowsView';

export const metadata: Metadata = { title: 'Flows — Motvin Inspirations' };

export default function FlowsPage() {
  return (
    <Suspense fallback={null}>
      <FlowsView />
    </Suspense>
  );
}
