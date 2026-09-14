/**
 * Products mega-menu. Markup ported verbatim from motvin-ui/index.html
 * (#products-dropdown); open/close state is owned by Navbar.
 */
export function ProductsDropdown({ open }: { open: boolean }) {
  return (
    <div className={`products-dropdown${open ? ' active' : ''}`} id="products-dropdown">
      <div className="products-dropdown-container">
        {/* Left Column: Big Feature Cards */}
        <div className="products-dropdown-left">
          <p className="dropdown-heading">What you can do in Motvin</p>
          <div className="dropdown-features">
            {/* Feature 1 */}
            <a href="/motvin" target="_blank" className="feature-card">
              <div className="feature-card-header">
                <h3>Convert websites</h3>
                <img
                  src="/ASSET/Icons/arrow-redirect.svg"
                  alt=""
                  className="feature-card-arrow"
                />
              </div>
              <div className="feature-card-body">
                <div className="feature-card-img-wrapper">
                  <img
                    src="/ASSET/Images/convert-websites.webp"
                    alt="Convert websites graphic"
                  />
                </div>
                <p>Capture any website and turn it into ediable design layers.</p>
              </div>
            </a>
            {/* Feature 2 */}
            <a href="/MOTVIN/styles" target="_blank" className="feature-card">
              <div className="feature-card-header">
                <h3>Explore creative tools</h3>
                <img
                  src="/ASSET/Icons/arrow-redirect.svg"
                  alt=""
                  className="feature-card-arrow"
                />
              </div>
              <div className="feature-card-body">
                <div className="feature-card-img-wrapper">
                  <img
                    src="/ASSET/Images/explore-creative-tools.webp"
                    alt="Explore creative tools graphic"
                  />
                </div>
                <p>Colors, icons, templates, and resources all in one place.</p>
              </div>
            </a>
          </div>
        </div>
        {/* Right Column: Product Links */}
        <div className="products-dropdown-right">
          <p className="dropdown-heading">Explore all products</p>
          <div className="dropdown-products-grid">
            {/* Motvin Convert */}
            <a href="/MOTVIN" target="_blank" className="product-link">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(135,79,255,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-convert.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>Motvin Convert</h4>
                <p>Turn any webite into an editable design</p>
              </div>
            </a>
            {/* Motvin Extension */}
            <a href="#" className="product-link">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(0,182,255,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-extension.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>Motvin Extension</h4>
                <p>Convert websites directly from your browser</p>
              </div>
            </a>
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
            <a href="/MOTVIN/typeface" target="_blank" className="product-link">
              <div
                className="product-link-icon"
                style={{ backgroundColor: "rgba(255,55,55,0.08)" }}
              >
                <img src="/ASSET/svg/motvin-typescales.svg" alt="" />
              </div>
              <div className="product-link-text">
                <h4>Motvin Typescales</h4>
                <p>Generate and customize typeface varients</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
