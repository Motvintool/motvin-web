'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONTENT_KINDS, formatCount } from '@/lib/inspirations/taxonomy';
import type { ContentKind, LibraryCounts } from '@/lib/inspirations/types';

/**
 * Apps · Screens · UI Elements · Flows · Patterns — the content-type strip
 * under the page title. Counts are muted so they inform without shouting.
 * Every one of these five index pages is also one tap away from the header's
 * hamburger drawer, so this row is a shortcut, not the only route to them.
 *
 * `right` renders as a trailing child of the same flex row — the screen count
 * and Filters trigger on Explore/Screens sit here instead of a separate row
 * beneath, the same way .ins-tabbar-showing rides the app-detail page's tab
 * row. Whoever passes it owns pushing it to the far edge (margin-left: auto);
 * this component only reserves the slot.
 *
 * `secondary` renders inline after the content-type tabs (or alone, when
 * `hideKinds` is set) — Explore's Curated/Newest/Oldest/By app sort sits here
 * instead of a second .ins-tabs row underneath.
 *
 * `hideKinds` drops the five content-type links entirely, keeping only
 * `secondary`/`right` in the row — Explore uses this, since a page that *is*
 * one of these five (there's no "Explore" tab to mark active) doesn't need a
 * shortcut back to itself among four unrelated ones.
 */
export function ContentTabs({
  counts,
  active,
  right,
  secondary,
  hideKinds = false,
}: {
  counts: LibraryCounts | null;
  active?: ContentKind;
  right?: ReactNode;
  secondary?: ReactNode;
  hideKinds?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="ins-tabs" aria-label={hideKinds ? 'Sort' : 'Content type'}>
      {!hideKinds &&
        CONTENT_KINDS.map(({ kind, label, href }) => {
          const isActive = active ? active === kind : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={kind} href={href} className={`ins-tab ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined}>
              {label}
              {counts && <span className="ins-tab-count">{formatCount(counts[kind])}</span>}
            </Link>
          );
        })}
      {secondary && (
        <>
          {!hideKinds && <span className="ins-tabs-divider" aria-hidden />}
          {secondary}
        </>
      )}
      {right}
    </nav>
  );
}
