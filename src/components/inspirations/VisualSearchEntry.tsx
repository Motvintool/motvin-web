import { ImageIcon } from './Icons';

/**
 * Visual search — the entry point, not the feature.
 *
 * Matching a screenshot against the library needs image embeddings, which the
 * backend does not compute yet. Rather than accept an upload and answer with
 * something that only looks like a result, this states plainly that it is not
 * connected and where it will plug in.
 */
export function VisualSearchEntry() {
  return (
    <section className="ins-visual" aria-labelledby="ins-visual-title">
      <div className="ins-dropzone is-inactive">
        <ImageIcon size={22} className="ins-dropzone-icon" />
        <div className="ins-dropzone-text">
          <p id="ins-visual-title" className="ins-dropzone-title">
            Visual search
          </p>
          <p className="ins-dropzone-desc">
            Finding screens that look like an uploaded screenshot needs image embeddings for the
            library. Not available yet — search and filters cover everything stored today.
          </p>
        </div>
        <span className="ins-chip ins-chip--sm">Planned</span>
      </div>
    </section>
  );
}
