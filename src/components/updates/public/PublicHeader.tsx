'use client';

import { PublicAuthBanner } from './PublicAuthBanner';

/** Public feed header — "What's new in Motvin", with an admin-only banner
 * above it when the signed-in user can reach the publisher. */
export function PublicHeader() {
  return (
    <header className="header">
      <div className="container updates-shell">
        <PublicAuthBanner />
        <h1>What&apos;s new in Motvin</h1>
        <p>New updates and improvements in Motvin</p>
      </div>
    </header>
  );
}
