import type { Aspect } from '@/lib/inspirations/types';

/**
 * Loading placeholders. Grid skeletons vary their aspect so the shimmer
 * already has the rhythm of the real gallery.
 */

const SKELETON_ASPECTS: Aspect[] = ['9:16', '16:10', '4:5', '3:4', '16:9', '1:1', '9:16', '16:10'];

export function aspectRatioValue(aspect: Aspect): string {
  return aspect.replace(':', ' / ');
}

export function ScreenGridSkeleton({ count = 15, columns = 5 }: { count?: number; columns?: number }) {
  const cols: Aspect[][] = Array.from({ length: columns }, () => []);
  for (let i = 0; i < count; i++) cols[i % columns].push(SKELETON_ASPECTS[i % SKELETON_ASPECTS.length]);
  return (
    <div className="ins-grid" style={{ ['--ins-cols' as string]: columns }} aria-busy aria-label="Loading screens">
      {cols.map((col, ci) => (
        <div className="ins-grid-col" key={ci}>
          {col.map((aspect, i) => (
            <div className="ins-card ins-card--skeleton" key={i}>
              <div className="ins-skel ins-skel--shot" style={{ aspectRatio: aspectRatioValue(aspect) }} />
              <div className="ins-card-meta">
                <div className="ins-skel ins-skel--line" style={{ width: '46%' }} />
                <div className="ins-skel ins-skel--line" style={{ width: '70%' }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardRowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="ins-app-grid" aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div className="ins-app-card ins-app-card--skeleton" key={i}>
          <div className="ins-skel" style={{ width: 40, height: 40, borderRadius: 10 }} />
          <div className="ins-skel ins-skel--line" style={{ width: '50%' }} />
          <div className="ins-skel ins-skel--line" style={{ width: '70%' }} />
        </div>
      ))}
    </div>
  );
}

export function LineSkeleton({ width = '100%' }: { width?: string | number }) {
  return <div className="ins-skel ins-skel--line" style={{ width }} />;
}
