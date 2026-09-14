/**
 * Closing call-to-action band.
 *
 * Markup ported from motvin-ui/index.html (section.explore-section).
 */
export function Explore() {
  return (
    <section className="explore-section" aria-labelledby="explore-section-title">
      <div className="explore-section-container">
        <h2 id="explore-section-title">Explore everything you can do with Motvin</h2>
        <div className="explore-section-links">
          <div className="explore-section-row">
            <a
              className="explore-link explore-link-colors"
              href="/MOTVIN/styles"
              target="_blank"
            >
              <span>Explore Colors</span>
            </a>
            <img
              className="explore-decor explore-decor-one"
              src="/ASSET/Images/decor1.webp"
              alt=""
            />
            <a
              className="explore-link explore-link-icons"
              href="/icons"
              target="_blank"
            >
              <span>Icons Library</span>
            </a>
            <span className="explore-decor explore-decor-two" aria-hidden="true">
              <img src="/ASSET/Images/decor2.webp" alt="" />
            </span>
          </div>
          <div className="explore-section-row">
            <span className="explore-decor explore-decor-three" aria-hidden="true">
              <span className="explore-decor-three-inner">
                <img src="/ASSET/Images/decor3.webp" alt="" />
              </span>
            </span>
            <a
              className="explore-link explore-link-logos"
              href="/logos"
              target="_blank"
            >
              <span>Logos Library</span>
            </a>
            <a
              id="explore-signup-btn"
              className="explore-link explore-link-started"
              href="#"
            >
              <span>Get started</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
