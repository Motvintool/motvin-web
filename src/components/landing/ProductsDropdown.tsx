/**
 * Products mega-menu, ported from motvin-ui/index.html (#products-dropdown);
 * open/close state is owned by Navbar. Its feature cards ("Convert websites",
 * "Explore creative tools") went with the old site's tools, which are no
 * longer online, so only the product list is left.
 */
export function ProductsDropdown({ open }: { open: boolean }) {
  return (
    <div className={`products-dropdown${open ? ' active' : ''}`} id="products-dropdown">
      <div className="products-dropdown-container">
        {/* Right Column: Product Links */}
        <div className="products-dropdown-right">
          <p className="dropdown-heading">Motvin tools</p>
          {/* Tools that aren't live yet are plain rows with a "Soon" tag, not links. */}
          <div className="dropdown-products-grid">
            {/* Motvin Inspirations */}
            <a href="/inspirations" className="product-link">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(92,74,225,0.08)" }}
              >
                <img src="/ASSET/Icons/motvin-logo.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>Motvin Inspirations</h4>
                <p>Browse screens, flows and patterns from real apps</p>
              </div>
            </a>
            {/* Motvin Convert */}
            <div className="product-link is-soon" aria-disabled="true">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(135,79,255,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-convert.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>
                  Motvin Convert
                  <span className="product-soon">Soon</span>
                </h4>
                <p>Turn any website into an editable design</p>
              </div>
            </div>
            {/* Motvin Extension */}
            <div className="product-link is-soon" aria-disabled="true">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(0,182,255,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-extension.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>
                  Motvin Extension
                  <span className="product-soon">Soon</span>
                </h4>
                <p>Convert websites directly from your browser</p>
              </div>
            </div>
            {/* Motvin Icons */}
            <a href="/icons" target="_blank" className="product-link">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(36,203,113,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-icons.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>Motvin Icons</h4>
                <p>Explore 350k+ editable icons</p>
              </div>
            </a>
            {/* Motvin Logos */}
            <a href="/logos" target="_blank" className="product-link">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(255,165,0,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-logos.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>Motvin Logos</h4>
                <p>Explore 10k+ editable logos</p>
              </div>
            </a>
            {/* Motvin Illustrations */}
            <a href="/illustrations" target="_blank" className="product-link">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(135,79,255,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-illustrations.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>Motvin Illustrations</h4>
                <p>Explore 20k+ editable illustrations</p>
              </div>
            </a>
            {/* Motvin Typescales */}
            <div className="product-link is-soon" aria-disabled="true">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(255,55,55,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-typescales.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>
                  Motvin Typescales
                  <span className="product-soon">Soon</span>
                </h4>
                <p>Generate and customize typeface variants</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
