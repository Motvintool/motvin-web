'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

/** The event Navbar listens for: "someone asked to request an app" (see Navbar's requestApp). */
export const REQUEST_APP_EVENT = 'motvin:request-app';

/**
 * A "Request an app" link for the landing-style pages. A plain click stays on
 * the page and lets Navbar decide: the request form right here for a
 * first-time visitor, or the Requests page for someone who already has
 * requests. A modified click (new tab) still follows the link to that page.
 */
export function RequestAppLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link
      href={INSPIRATIONS_ROUTES.settingsRequests}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new Event(REQUEST_APP_EVENT));
      }}
    >
      {children}
    </Link>
  );
}
