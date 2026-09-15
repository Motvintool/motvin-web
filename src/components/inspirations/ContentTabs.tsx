'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONTENT_KINDS, formatCount } from '@/lib/inspirations/taxonomy';
import type { ContentKind, LibraryCounts } from '@/lib/inspirations/types';

/**
 * Apps · Screens · UI Elements · Flows · Patterns — the content-type strip
 * under the page title. Counts are muted so they inform without shouting.
 */
export function ContentTabs({ counts, active }: { counts: LibraryCounts | null; active?: ContentKind | 'explore' }) {
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
    </nav>
  );
}
