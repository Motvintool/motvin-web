import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreensView } from '@/components/inspirations/views/ScreensView';

export const metadata: Metadata = { title: 'Screens — Motvin Inspirations' };

export default function ScreensPage() {
  return (
    <Suspense fallback={null}>
      <ScreensView />
    </Suspense>
  );
}
