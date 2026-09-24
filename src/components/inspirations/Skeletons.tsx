/**
 * Loading placeholders.
 *
 * The grid skeleton varies its block heights so the shimmer already has the
 * rhythm of a real masonry gallery. These are loading states, not stand-ins
 * for content: once a request resolves they are replaced by what the store
 * actually holds, or by an empty state.
 */

import { PageHeading } from './PageHeading';

export function ExploreSkeleton() {
  return (
    <div className="ins-explore-view" aria-busy aria-label="Loading explore">
      <PageHeading title="Inspirations" />
      <section className="ins-explore-taxonomy" aria-hidden="true">
        <div className="ins-explore-taxonomy-group">
          <h2 className="ins-explore-taxonomy-title">Categories</h2>
          <ul className="ins-explore-taxonomy-list">
            <li><span className="ins-explore-taxonomy-link" style={{ color: 'var(--ins-text)', pointerEvents: 'none' }}>SaaS</span></li>
            <li><span className="ins-explore-taxonomy-link" style={{ color: 'var(--ins-text)', pointerEvents: 'none' }}>Productivity</span></li>
          </ul>
        </div>
        <div className="ins-explore-taxonomy-group">
          <h2 className="ins-explore-taxonomy-title">Screens</h2>
          <ul className="ins-explore-taxonomy-list">
            <li><span className="ins-explore-taxonomy-link" style={{ color: 'var(--ins-text)', pointerEvents: 'none' }}>Login</span></li>
            <li><span className="ins-explore-taxonomy-link" style={{ color: 'var(--ins-text)', pointerEvents: 'none' }}>Settings</span></li>
            <li><span className="ins-explore-taxonomy-link" style={{ color: 'var(--ins-text)', pointerEvents: 'none' }}>Other</span></li>
          </ul>
        </div>
        <div className="ins-explore-taxonomy-group">
          <h2 className="ins-explore-taxonomy-title">UI Elements</h2>
          <ul className="ins-explore-taxonomy-list">
            <li><span className="ins-explore-taxonomy-link" style={{ color: 'var(--ins-text)', pointerEvents: 'none' }}>List</span></li>
          </ul>
        </div>
        <div className="ins-explore-taxonomy-group">
          <h2 className="ins-explore-taxonomy-title">Flows</h2>
          <ul className="ins-explore-taxonomy-list">
            <li><span className="ins-explore-taxonomy-link" style={{ color: 'var(--ins-text)', pointerEvents: 'none' }}>Authentication</span></li>
          </ul>
        </div>
      </section>
      <div className="ins-ftoolbar-anchor ins-skeleton-toolbar" aria-hidden="true">
        <div className="ins-ftoolbar">
          <div className="ins-skeleton-toolbar-group">
            <span className="ins-skel ins-skel--pill ins-skel--pill-first" />
            <span className="ins-skel ins-skel--pill ins-skel--pill-second" />
            <span className="ins-skel ins-skel--pill ins-skel--pill-third" />
          </div>
          <div className="ins-skeleton-toolbar-group ins-skeleton-toolbar-group--right">
            <span className="ins-skel ins-skel--count" />
            <span className="ins-skel ins-skel--pill ins-skel--sort" />
          </div>
        </div>
      </div>

      <ScreenGridSkeleton count={4} />
    </div>
  );
}

export function ScreenGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="ins-grid" aria-busy aria-label="Loading screens">
      {Array.from({ length: count }, (_, i) => (
        <article className="ins-card ins-card--skeleton" key={i}>
          <div className="ins-card-shot">
            <div className="ins-skel ins-skel--shot" />
          </div>
          <div className="ins-card-meta">
            <div className="ins-skel ins-skel--app-icon" />
            <div className="ins-card-meta-text">
              <div className="ins-skel ins-skel--line ins-skel--app-name" />
              <div className="ins-skel ins-skel--line ins-skel--app-description" />
            </div>
          </div>
        </article>
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
