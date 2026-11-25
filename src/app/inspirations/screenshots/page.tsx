import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenshotsView } from '@/components/inspirations/views/ScreenshotsView';

export const metadata: Metadata = { title: 'App Store Screenshots — Motvin Inspirations' };

export default function ScreenshotsPage() {
  return (
    <Suspense fallback={null}>
      <ScreenshotsView />
    </Suspense>
  );
}
