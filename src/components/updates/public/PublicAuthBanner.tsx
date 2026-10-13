'use client';

import Link from 'next/link';
import { usePublicAdminAccess } from './usePublicAdminAccess';

/**
 * A small note above the "What's new in Motvin" title once an admin signs
 * in, with the way into the publisher (the public nav no longer has an
 * Admin link, now that the page uses the site's own navbar).
 */
export function PublicAuthBanner() {
  const { canAccessAdmin } = usePublicAdminAccess();
  if (!canAccessAdmin) return null;
  return (
    <div className="upd-admin-banner">
      <i aria-hidden="true" />
      Signed in with updates admin access.
      <Link href="/updates/admin">Open publisher →</Link>
    </div>
  );
}
