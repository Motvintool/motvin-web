import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsView } from '@/components/inspirations/SettingsView';

export const metadata: Metadata = {
  title: 'Settings — Motvin Inspirations',
  // A personal page: nothing here belongs in search results.
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  );
}
