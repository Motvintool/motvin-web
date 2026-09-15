'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { Aspect, Screen } from '@/lib/inspirations/types';
import { ScreenCard } from './ScreenCard';
import { ScreenGridSkeleton } from './Skeletons';
import { useColumnCount } from './useColumnCount';

/**
 * Masonry gallery. Cards are placed into the currently shortest column using
 * their known aspect ratio, so layout is exact on first paint (no measuring)
 * and the visual order stays roughly left→right, top→bottom.
 *
 * Infinite loading: a sentinel below the grid calls `onLoadMore` when it
 * scrolls into view. Cards use `content-visibility: auto` (CSS) so off-screen
 * mocks cost nothing to keep mounted.
 */

const ASPECT_HEIGHT: Record<Aspect, number> = {
  '9:16': 16 / 9,
  '3:4': 4 / 3,
  '4:5': 5 / 4,
  '1:1': 1,
  '16:10': 10 / 16,
  '16:9': 9 / 16,
};

const META_HEIGHT = 0.28; // metadata block, in column-width units

export function ScreenGrid({
  screens,
  loading = false,
  hasMore = false,
  onLoadMore,
  showApp = true,
  empty,
  preset = 'gallery',
}: {
  screens: Screen[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  showApp?: boolean;
  empty?: ReactNode;
  preset?: 'gallery' | 'wide';
}) {
  const columns = useColumnCount(preset);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const placed = useMemo(() => {
    const cols: { items: { screen: Screen; index: number }[]; height: number }[] = Array.from({ length: columns }, () => ({ items: [], height: 0 }));
    screens.forEach((screen, index) => {
      let target = 0;
      for (let i = 1; i < cols.length; i++) if (cols[i].height < cols[target].height - 0.001) target = i;
      cols[target].items.push({ screen, index });
      cols[target].height += ASPECT_HEIGHT[screen.aspect] + META_HEIGHT;
    });
    return cols;
  }, [screens, columns]);

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
    return <ScreenGridSkeleton columns={columns} count={columns * 3} />;
  }

  if (!loading && screens.length === 0) {
    return <>{empty}</>;
  }

  return (
    <>
      <div className="ins-grid" style={{ ['--ins-cols' as string]: columns }} role="list">
        {placed.map((col, ci) => (
          <div className="ins-grid-col" key={ci}>
            {col.items.map(({ screen, index }) => (
              <div role="listitem" key={screen.id}>
                <ScreenCard screen={screen} app={inspirationsApi.appFor(screen)} showApp={showApp} index={index} />
              </div>
            ))}
          </div>
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
