'use client';

import { Suspense } from 'react';
import { PublicFooter } from '@/components/updates/public/PublicFooter';
import { PublicHeader } from '@/components/updates/public/PublicHeader';
import { PublicNav } from '@/components/updates/public/PublicNav';
import { ReleaseFeed } from '@/components/updates/public/ReleaseFeed';
import { UpdatesChrome } from '@/components/updates/UpdatesChrome';
import '@/styles/updates.css';

/**
 * Updates / release notes feed — port of motvin-ui/updates/index.html.
 *
 * Composed of standalone sections from `src/components/updates/`. Wrapped
 * in Suspense because ReleaseFeed calls `useSearchParams` (Next 16 requires the
 * boundary during static generation).
 */
export default function UpdatesPage() {
  return (
    <Suspense fallback={null}>
      <UpdatesChrome title="Motvin - Updates" />
      <PublicNav />
      <PublicHeader />
      <ReleaseFeed />
      <PublicFooter />
    </Suspense>
  );
}
