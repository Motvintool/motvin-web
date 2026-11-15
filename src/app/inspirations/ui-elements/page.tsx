import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UiElementsView } from '@/components/inspirations/views/UiElementsView';

export const metadata: Metadata = { title: 'UI Elements — Motvin Inspirations' };

export default function UiElementsPage() {
  return (
    <Suspense fallback={null}>
      <UiElementsView />
    </Suspense>
  );
}
