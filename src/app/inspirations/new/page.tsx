import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewThisWeekView } from '@/components/inspirations/views/NewThisWeekView';
import { pageMetadata } from '@/lib/config/share';

export const metadata: Metadata = pageMetadata(
  'New this week — Motvin Inspirations',
  'The apps added to Motvin Inspirations in the last 7 days: their real screens, flows and patterns.',
);

export default function NewThisWeekPage() {
  return (
    <Suspense fallback={null}>
      <NewThisWeekView />
    </Suspense>
  );
}
