/**
 * Loading placeholders.
 *
 * The grid skeleton varies its block heights so the shimmer already has the
 * rhythm of a real masonry gallery. These are loading states, not stand-ins
 * for content: once a request resolves they are replaced by what the store
 * actually holds, or by an empty state.
 */


/** The four Explore columns' headings, with a bar width per row (as many
 * rows as the loaded columns show at most). */
const TAXONOMY_SKELETON = [
  { title: 'Categories', widths: [148, 112, 84, 104, 92] },
  { title: 'Screens', widths: [72, 96, 80, 104, 76] },
  { title: 'UI Elements', widths: [96, 64, 88, 80, 108] },
  { title: 'Flows', widths: [120, 140, 96, 112, 88] },
];

/**
 * Explore while its taxonomy loads: everything below the heading, which
 * ExploreView keeps mounted (so its typed phrase isn't restarted when the
 * data arrives). Same boxes as the loaded page — columns, rows, toolbar and
 * the app grid (`web` for the Webs / Web Apps layout) — so nothing moves.
 */
export function ExploreSkeleton({ web = false }: { web?: boolean }) {
  return (
    <>
      {/* Grey bars, not sample names: real-looking labels here read as the
          library's data (stale categories) for the moment before it loads.
          Same rows as the loaded columns, so nothing shifts when it arrives. */}
      <section className="ins-explore-taxonomy" aria-hidden="true">
        {TAXONOMY_SKELETON.map(({ title, widths }) => (
          <div className="ins-explore-taxonomy-group" key={title}>
            <h2 className="ins-explore-taxonomy-title">{title}</h2>
            <ul className="ins-explore-taxonomy-list">
              {widths.map((width, i) => (
                <li key={i}>
                  <span className="ins-explore-taxonomy-link" style={{ pointerEvents: 'none' }}>
                    <span className="ins-skel ins-skel--line" style={{ width }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
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

      <ScreenGridSkeleton count={6} apps web={web} />
    </>
  );
}

/**
 * `meta={false}` drops the app line under each card, for grids whose cards don't show one (showMeta={false});
 * `web` lays the placeholders out as website screenshots.
 */
export function ScreenGridSkeleton({ count = 12, meta = true, web = false, apps = false }: { count?: number; meta?: boolean; web?: boolean; apps?: boolean }) {
  return (
    // `apps`: the app cards' own grid (AppsGrid's .ins-app-grid), whose columns differ from the screens grid's.
    <div className={`ins-grid ${apps ? 'ins-app-grid' : ''} ${web ? 'ins-web-grid' : ''}`} aria-busy aria-label={apps ? 'Loading apps' : 'Loading screens'}>
      {Array.from({ length: count }, (_, i) =>
        web ? (
          // A website card (Web Apps' apps, or their screens): the web card's
          // own landscape frame, panel and app row, so the placeholder is
          // exactly the loaded card's size and shape.
          <article className="ins-web-card ins-web-card--skeleton" key={i}>
            <div className="ins-web-card-shot">
              <div className="ins-web-card-inset">
                <div className="ins-skel ins-web-card-skel-fill" />
              </div>
            </div>
            {meta && (
              <div className="ins-web-card-meta">
                <div className="ins-skel ins-skel--app-icon" />
                <div className="ins-web-card-meta-text">
                  <div className="ins-skel ins-skel--line ins-skel--app-name" />
                  <div className="ins-skel ins-skel--line ins-skel--app-description" />
                </div>
              </div>
            )}
          </article>
        ) : (
        <article className="ins-card ins-card--skeleton" key={i}>
          <div className="ins-card-shot">
            <div className="ins-skel ins-skel--shot" />
          </div>
          {meta && (
            <div className="ins-card-meta">
              <div className="ins-skel ins-skel--app-icon" />
              <div className="ins-card-meta-text">
                <div className="ins-skel ins-skel--line ins-skel--app-name" />
                <div className="ins-skel ins-skel--line ins-skel--app-description" />
              </div>
            </div>
          )}
        </article>
        ),
      )}
    </div>
  );
}

/**
 * The Flows list while it loads: FlowList's own rows (the card, its header
 * with play circle, name and app logo, and the strip of phone-sized steps),
 * so the loaded flows land exactly where these were.
 */
export function FlowListSkeleton({ count = 3, steps = 5 }: { count?: number; steps?: number }) {
  return (
    <div className="ins-flowlist" aria-busy aria-label="Loading flows">
      {Array.from({ length: count }, (_, i) => (
        <div className="ins-flows-row ins-flows-row--skeleton" key={i}>
          <div className="ins-flows-row-meta">
            <span className="ins-flows-row-title">
              <span className="ins-skel ins-flows-row-skel-play" />
              <span className="ins-flows-row-text">
                <span className="ins-skel ins-skel--line" style={{ width: 140 }} />
                <span className="ins-skel ins-skel--line" style={{ width: 96 }} />
              </span>
            </span>
            <span className="ins-skel ins-flows-row-skel-logo" />
          </div>
          <div className="ins-flows-row-strip">
            {Array.from({ length: steps }, (_, j) => (
              <span className="ins-flows-row-shot" key={j}>
                <span className="ins-skel ins-flows-row-skel-shot" />
              </span>
            ))}
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
