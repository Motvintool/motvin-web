import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppsView } from '@/components/inspirations/views/AppsView';

export const metadata: Metadata = { title: 'Apps — Motvin Inspirations' };

export default function AppsPage() {
  return (
    <Suspense fallback={null}>
      <AppsView />
    </Suspense>
  );
}
