'use client';

import Link from 'next/link';

/** Public feed footer — copyright + link into the admin publisher. */
export function PublicFooter() {
  return (
    <footer className="footer">
      <div className="container">
        © 2026 Motvin. All rights reserved. &nbsp;·&nbsp;{' '}
        <a href="https://www.motvin.com/">motvin.com</a> &nbsp;·&nbsp;{' '}
        <Link href="/updates/admin">Publish updates</Link>
      </div>
    </footer>
  );
}
