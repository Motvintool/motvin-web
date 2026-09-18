/**
 * Loading placeholders.
 *
 * The grid skeleton varies its block heights so the shimmer already has the
 * rhythm of a real masonry gallery. These are loading states, not stand-ins
 * for content: once a request resolves they are replaced by what the store
 * actually holds, or by an empty state.
 */

export function ScreenGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="ins-grid" aria-busy aria-label="Loading screens">
      {Array.from({ length: count }, (_, i) => (
        <div className="ins-card ins-card--skeleton" key={i}>
          <div className="ins-skel ins-skel--shot" />
          <div className="ins-card-meta">
            <div className="ins-skel" style={{ width: 40, height: 40, borderRadius: 12, flex: 'none' }} />
            <div className="ins-card-meta-text">
              <div className="ins-skel ins-skel--line" style={{ width: '46%' }} />
              <div className="ins-skel ins-skel--line" style={{ width: '70%' }} />
            </div>
          </div>
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
