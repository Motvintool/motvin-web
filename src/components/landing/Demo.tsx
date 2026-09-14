import Link from 'next/link';

/**
 * Feature demo section — static markup; the hero GSAP timeline animates it by
 * selector (see HeroAnimations).
 *
 * Markup ported from motvin-ui/index.html (#demo-section).
 */
export function Demo() {
  return (
    <section className="demo-section" id="demo-section">
      <div className="demo-container">
        <div className="demo-content-wrapper">
          <div className="demo-header-container">
            <div className="demo-title-group">
              <p className="demo-subtitle">CanopyOS</p>
              <h2 className="demo-title">
                <span className="animated-word">Turn</span>
                <span className="animated-word">any</span>
                <span className="animated-word">live</span>
                <span className="animated-word">working</span>
                <span className="animated-word">websites</span>
                <span className="animated-word">into</span>
                <span className="animated-word">an</span>
                <span className="animated-word">editable.</span>
                <br />
                <span className="demo-title-light">
                  <span className="animated-word">Super</span>
                  <span className="animated-word">Fast.</span>
                  <span className="animated-word">Easy,</span>
                  <span className="animated-word">Powerful</span>
                </span>
              </h2>
            </div>
            <a href="#" className="demo-explore-btn">
              <span>Explore Our Platform</span>
              <svg
                className="demo-explore-icon"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5.25 2.33334L9.91667 7.00001L5.25 11.6667"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                ></path>
              </svg>
            </a>
          </div>
          <div className="demo-body-container">
            <div className="demo-covers" aria-label="CanopyOS product previews">
              <img
                className="demo-cover demo-cover-1"
                src="/ASSET/Images/cover-1.webp"
                alt="Abstract typography editor preview"
              />
              <img
                className="demo-cover demo-cover-2"
                src="/ASSET/Images/cover-2.webp"
                alt="Bitmap mosaic controls preview"
              />
              <img
                className="demo-cover demo-cover-3"
                src="/ASSET/Images/cover-3.webp"
                alt="Vector editing preview"
              />
              <img
                className="demo-cover demo-cover-4"
                src="/ASSET/Images/cover-4.webp"
                alt="Texture controls preview"
              />
            </div>
            <div className="demo-features-grid">
              <div className="demo-feature-card">
                <div className="demo-feature-icon-wrapper">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g clipPath="url(#clip0_716_12333)">
                      <mask
                        id="mask0_716_12333"
                        style={{ maskType: "luminance" }}
                        maskUnits="userSpaceOnUse"
                        x="0"
                        y="0"
                        width="16"
                        height="16"
                      >
                        <path d="M0 0H16V16H0V0Z" fill="white"></path>
                      </mask>
                      <g mask="url(#mask0_716_12333)">
                        <path
                          d="M16 8C16 3.58172 12.4183 0 8 0C3.58172 0 0 3.58172 0 8C0 12.4183 3.58172 16 8 16C12.4183 16 16 12.4183 16 8Z"
                          fill="#00B6FF"
                        ></path>
                      </g>
                    </g>
                    <defs>
                      <clipPath id="clip0_716_12333">
                        <rect width="16" height="16" fill="white"></rect>
                      </clipPath>
                    </defs>
                  </svg>
                </div>
                <div className="demo-feature-text">
                  <h3>Design without limits</h3>
                  <p>
                    Create stunning UI for websites, apps, and with total freedom.
                  </p>
                </div>
                <Link href="/motvin" className="demo-feature-link">
                  <span>Explore design tools</span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4.16666 10H15.8333M15.8333 10L10 4.16667M15.8333 10L10 15.8333"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                  </svg>
                </Link>
              </div>
              <div className="demo-feature-card">
                <div className="demo-feature-icon-wrapper">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g clipPath="url(#clip0_716_12348)">
                      <mask
                        id="mask0_716_12348"
                        style={{ maskType: "luminance" }}
                        maskUnits="userSpaceOnUse"
                        x="0"
                        y="0"
                        width="16"
                        height="16"
                      >
                        <path d="M0 0H16V16H0V0Z" fill="white"></path>
                      </mask>
                      <g mask="url(#mask0_716_12348)">
                        <path
                          d="M13.1754 0C14.7354 0 16.0001 1.302 16.0001 2.908C16.0032 3.42335 15.8699 3.93036 15.6137 4.37753C15.3576 4.8247 14.9876 5.1961 14.5414 5.454C14.9876 5.71191 15.3576 6.0833 15.6137 6.53047C15.8699 6.97764 16.0032 7.48465 16.0001 8C16.0032 8.51542 15.8698 9.02247 15.6135 9.46964C15.3571 9.91682 14.987 10.2882 14.5407 10.546C14.987 10.8038 15.3571 11.1752 15.6135 11.6224C15.8698 12.0695 16.0032 12.5766 16.0001 13.092C16.0001 14.6987 14.7354 16 13.1754 16C12.0187 16 11.0247 15.2847 10.5874 14.26C10.1507 15.2853 9.15606 16 8.00006 16C6.84339 16 5.84939 15.2847 5.41272 14.2607C4.97539 15.2847 3.98139 16.0007 2.82472 16.0007C1.26472 16 5.51519e-05 14.6973 5.51519e-05 13.0913C5.51519e-05 11.9953 0.589388 11.0407 1.45872 10.5453C1.01264 10.2875 0.642721 9.91619 0.386533 9.46915C0.130344 9.02211 -0.00299395 8.51524 5.51519e-05 8C5.51519e-05 6.904 0.588722 5.95 1.45872 5.454C1.01254 5.1961 0.642559 4.8247 0.386365 4.37753C0.130171 3.93036 -0.00311188 3.42335 5.51519e-05 2.908C5.51519e-05 1.302 1.26472 0 2.82472 0C3.98139 0 4.97539 0.715333 5.41339 1.73933C5.84939 0.715333 6.84339 0 7.99939 0C9.15606 0 10.1501 0.715333 10.5874 1.74C11.0247 0.714667 12.0187 0 13.1754 0Z"
                          fill="#24CB71"
                        ></path>
                      </g>
                    </g>
                    <defs>
                      <clipPath id="clip0_716_12348">
                        <rect width="16" height="16" fill="white"></rect>
                      </clipPath>
                    </defs>
                  </svg>
                </div>
                <div className="demo-feature-text">
                  <h3>Build Smarter with AI</h3>
                  <p>
                    Generate beautiful color palettes and type scales with AI in seconds.
                  </p>
                </div>
                <a href="/MOTVIN/styles" target="_blank" className="demo-feature-link">
                  <span>Explore build tools</span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4.16666 10H15.8333M15.8333 10L10 4.16667M15.8333 10L10 15.8333"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
