'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONTENT_KINDS, formatCount } from '@/lib/inspirations/taxonomy';
import type { ContentKind, LibraryCounts } from '@/lib/inspirations/types';

/**
 * Apps · Screens · UI Elements · Flows · Patterns — the content-type strip
 * under the page title. Counts are muted so they inform without shouting.
 *
 * `right` renders as a trailing child of the same flex row — the screen count
 * and Filters trigger on Explore/Screens sit here instead of a separate row
 * beneath, the same way .ins-tabbar-showing rides the app-detail page's tab
 * row. Whoever passes it owns pushing it to the far edge (margin-left: auto);
 * this component only reserves the slot.
 */
export function ContentTabs({
  counts,
  active,
  right,
}: {
  counts: LibraryCounts | null;
  active?: ContentKind | 'explore';
  right?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <nav className="ins-tabs" aria-label="Content type">
      <Link href="/inspirations" className={`ins-tab ${active === 'explore' || (!active && pathname === '/inspirations') ? 'is-active' : ''}`}>
        All
      </Link>
      {CONTENT_KINDS.map(({ kind, label, href }) => {
        const isActive = active ? active === kind : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={kind} href={href} className={`ins-tab ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined}>
            {label}
            {counts && <span className="ins-tab-count">{formatCount(counts[kind])}</span>}
          </Link>
        );
      })}
      {right}
    </nav>
  );
}
