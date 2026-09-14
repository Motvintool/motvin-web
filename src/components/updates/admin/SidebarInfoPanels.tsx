'use client';

import Link from 'next/link';

/**
 * Static explainer cards shown under the admin sidebar — "What gets created"
 * and "Next step" copy from the reference admin.html.
 */

export function SidebarInfoPanels() {
  return (
    <>
      <section className="admin-panel admin-panel-compact">
        <h2 className="panel-title">What gets created</h2>
        <p className="panel-copy">
          Each submission becomes one Firestore document in <strong>updates-feed</strong>.
        </p>
        <ul className="admin-list">
          <li>Title and date</li>
          <li>Description and optional image</li>
          <li>Per-release share slug and share summary</li>
          <li>Changes grouped into features, improvements, and fixes</li>
        </ul>
      </section>

      <section className="admin-panel admin-panel-compact">
        <h2 className="panel-title">Next step</h2>
        <p className="panel-copy">
          After publishing, refresh the updates page to see the new release note appear at
          the top.
        </p>
        <Link className="nav-link admin-inline-link" href="/updates">
          Open updates page
        </Link>
      </section>
    </>
  );
}
