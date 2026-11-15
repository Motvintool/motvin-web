'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { requestApp } from '../requestAppEvent';

/**
 * The features grid's "Request an app" card. A plain click does what the
 * Resources menu's "Request apps" does (the form over the page, or the
 * Requests page if they already have requests), so a first-time visitor
 * isn't sent away and back. A modified click still opens the Requests page
 * in a new tab.
 */
export function RequestAppCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    <Link
      href={INSPIRATIONS_ROUTES.settingsRequests}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        requestApp();
      }}
    >
      {children}
    </Link>
  );
}
