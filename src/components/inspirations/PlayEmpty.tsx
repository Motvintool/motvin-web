'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { browsedPlatforms } from '@/lib/inspirations/filters';
import { LogoPile } from './LogoPile';
import { useAsync } from './useAsync';

export type PlayEmptyAction = { label: string; href?: string; onClick?: () => void };

/**
 * The playful "nothing found" state: the message and its one next step, over
 * the library's own app logos dropped in as balls to knock about with the
 * bat (LogoPile). Each ball opens its app, so the dead end still leads
 * somewhere. Used for every no-results and not-found page (EmptyState's
 * `play`, SearchEmpty, the inspirations 404); `children` is for anything
 * the action opens, such as a modal.
 */
export function PlayEmpty({
  title,
  description,
  action,
  inline = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: PlayEmptyAction;
  /** Sits low in a page (an app's tabs): the balls stay in this box, under the message (LogoPile's `inline`). */
  inline?: boolean;
  children?: ReactNode;
}) {
  const { data: apps } = useAsync(() => inspirationsApi.listApps(), 'apps:all');
  // Only the apps of the section being browsed (Webs: its web apps), each opening there.
  const platforms = browsedPlatforms(useSearchParams());
  const withLogos = (apps ?? []).filter((a) => inspirationsApi.mediaUrl(a.logo) && a.platforms.some((p) => platforms.includes(p)));

  return (
    <div className={`ins-search-empty${inline ? ' is-inline' : ''}`} role="status">
      <div className="ins-search-empty-copy">
        <p className="ins-search-empty-title">{title}</p>
        {description && <p className="ins-search-empty-desc">{description}</p>}
        {action && (
          <div className="ins-search-empty-actions">
            {action.href ? (
              <Link href={action.href} className="ins-btn ins-btn--secondary">
                {action.label}
              </Link>
            ) : (
              <button type="button" className="ins-btn ins-btn--secondary" onClick={action.onClick}>
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>

      <LogoPile apps={withLogos} inline={inline} platforms={platforms} />

      {children}
    </div>
  );
}
