'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { App, Screen } from '@/lib/inspirations/types';
import { ScreenCard } from './ScreenCard';
import { ScreenGridSkeleton } from './Skeletons';
import { useApps } from './useApps';

/**
 * Fixed-size gallery: every card is the same 380x590 footprint (see
 * .ins-card-shot in inspirations.css), laid out four to a row. Since cards no
 * longer vary in height there is nothing to bin-pack — plain CSS Grid handles
 * placement.
 *
 * Infinite loading: a sentinel below the grid calls `onLoadMore` when it
 * scrolls into view. Cards use `content-visibility: auto` (CSS) so off-screen
 * rows cost nothing to keep mounted.
 */

export function ScreenGrid({
  screens,
  apps: appsOverride,
  loading = false,
  hasMore = false,
  onLoadMore,
  showApp = true,
  empty,
}: {
  screens: Screen[];
  /** Overrides the shared app lookup; omit and the grid fetches it itself. */
  apps?: Map<string, App>;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  showApp?: boolean;
  empty?: ReactNode;
}) {
  const fetchedApps = useApps();
  const apps = appsOverride ?? fetchedApps;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: '900px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore, loading, screens.length]);

  if (loading && screens.length === 0) {
    return <ScreenGridSkeleton count={12} />;
  }

  if (!loading && screens.length === 0) {
    return <>{empty}</>;
  }

  return (
    <>
      <div className="ins-grid" role="list">
        {screens.map((screen, index) => (
          <ScreenCard
            key={screen.id}
            screen={screen}
            app={apps.get(screen.appId)}
            showApp={showApp}
            index={index}
          />
        ))}
      </div>
      {(hasMore || loading) && (
        <div ref={sentinelRef} className="ins-grid-sentinel" aria-hidden>
          {loading && <span className="ins-spinner" />}
        </div>
      )}
    </>
  );
}
