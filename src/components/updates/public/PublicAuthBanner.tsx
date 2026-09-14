'use client';

import { usePublicAdminAccess } from './usePublicAdminAccess';

/**
 * Small green banner shown above the "What's new in Motvin" title once an
 * admin signs in — matches `setPublicAuthBanner('Signed in with release-notes
 * admin access.', 'success')` in motvin-ui/updates/script.110f497c05.js:502.
 */
export function PublicAuthBanner() {
  const { canAccessAdmin } = usePublicAdminAccess();
  if (!canAccessAdmin) return null;
  return (
    <div className="public-auth-banner" data-tone="success">
      Signed in with updates admin access.
    </div>
  );
}
