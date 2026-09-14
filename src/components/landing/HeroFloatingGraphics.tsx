/**
 * The four decorative graphic clusters behind the hero headline — one per
 * interactive word. Pure markup ported from motvin-ui/index.html; Hero decides
 * which is active and runs the GSAP stagger on its `.floating-item` children.
 */
export type HeroState = 'convert-websites' | 'explore-colors' | 'type-systems' | 'icons';

export function HeroFloatingGraphics({ active }: { active: HeroState }) {
  return (
    <div className="hero-floating-graphics">
      {/* State: Convert Websites */}
      <div className={`hero-floating-state${active === 'convert-websites' ? ' active' : ''}`} id="floating-convert-websites">
        <div className="container-left">
          <div className="floating-item pos-cw-c2 exact-c2">
            <div className="exact-c2-content">
              <p className="exact-c2-title">Contrast</p>
              <div className="exact-c2-details">
                <p className="exact-c2-ratio">
                  <span className="exact-c2-ratio-1">A</span>
                  <span className="exact-c2-ratio-2">A</span>
                </p>
                <p className="exact-c2-val">4.6:1</p>
              </div>
            </div>
          </div>
          <div className="floating-item pos-cw-c1 exact-c1">
            <div className="exact-c1-top">
              <div className="exact-c1-icon-container">
                <img alt="" src="/ASSET/Icons/live-url.svg" />
              </div>
              <p className="exact-c1-title">Live URL</p>
            </div>
            <div className="exact-c1-bottom">
              <p className="exact-c1-url">https://motvin.com</p>
              <img alt="" src="/ASSET/Icons/live-enter.svg" />
            </div>
          </div>
          <div className="floating-item pos-cw-c3 exact-c3">
            <div className="exact-c3-top">
              <div className="exact-c3-icon-container">
                <img alt="" src="/ASSET/Icons/one-click-capture.svg" />
              </div>
              <p className="exact-c3-title">One Click Capture</p>
            </div>
            <div className="exact-c3-bottom">
              <div className="exact-c3-bottom-inner">
                <img alt="" src="/ASSET/Icons/capture-website-tick.svg" />
                <p className="exact-c3-btn-text">Capture Website</p>
              </div>
            </div>
          </div>
        </div>
        <div className="container-right">
          <div className="floating-item pos-cw-c4 exact-c4">
            <p className="exact-c4-title">Color Wheel</p>
            <div className="exact-c4-img-container">
              <img alt="" src="/ASSET/Images/imgImage17.webp" className="exact-c4-img" />
            </div>
          </div>
          <div className="floating-item pos-cw-c6 exact-c6">
            <div className="exact-c6-content">
              <p className="exact-c6-title">Contrast</p>
              <div className="exact-c6-details">
                <p className="exact-c6-ratio">
                  <span className="exact-c6-ratio-1">A</span>
                  <span className="exact-c6-ratio-2">A</span>
                </p>
                <p className="exact-c6-val">4.6:1</p>
              </div>
            </div>
          </div>
          <div className="floating-item pos-cw-c5 exact-c5">
            <div className="exact-c5-top">
              <div className="exact-c5-icon">
                <img alt="" src="/ASSET/Icons/imgFrame4.svg" />
              </div>
              <p className="exact-c5-title">Import HTML</p>
            </div>
            <div className="exact-c5-bottom">
              <p className="exact-c5-url">files.html</p>
              <img alt="" src="/ASSET/Icons/imgGroup28569.svg" />
            </div>
          </div>
        </div>
      </div>
      {/* State: Explore Colors */}
      <div className={`hero-floating-state${active === 'explore-colors' ? ' active' : ''}`} id="floating-explore-colors">
        <div className="container-left">
          <div className="floating-item pos-ec-e1 exact-e1">
            <p className="exact-e1-title">Brand Palette</p>
            <div className="exact-e1-content">
              <div className="exact-e1-colors">
                <div className="exact-e1-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse1.svg" />
                </div>
                <div className="exact-e1-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse2.svg" />
                </div>
                <div className="exact-e1-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse3.svg" />
                </div>
                <div className="exact-e1-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse4.svg" />
                </div>
                <div className="exact-e1-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse5.svg" />
                </div>
              </div>
              <div className="exact-e1-add">
                <div className="exact-e1-add-icon">
                  <img alt="" src="/ASSET/Icons/imgFrame.svg" />
                </div>
                <p className="exact-e1-add-text">Add Color</p>
              </div>
            </div>
          </div>
          <div className="floating-item pos-ec-e3 exact-e3">
            <div className="exact-e3-content">
              <div className="exact-e3-img-container">
                <img alt="" src="/ASSET/Images/imgFrame2147237063.webp" />
              </div>
              <p className="exact-e3-text">#754B4B</p>
            </div>
          </div>
          <div className="floating-item pos-ec-e2 exact-e2">
            <div className="exact-e2-content">
              <p className="exact-e2-title">Contrast</p>
              <div className="exact-e2-details">
                <p className="exact-e2-ratio">
                  <span className="exact-e2-ratio-1">A</span>
                  <span className="exact-e2-ratio-2">A</span>
                </p>
                <p className="exact-e2-val">4.6:1</p>
              </div>
            </div>
          </div>
        </div>
        <div className="container-right">
          <div className="floating-item pos-ec-e4 exact-e4">
            <div className="exact-e4-content">
              <p className="exact-e4-title">Color Wheel</p>
              <div className="exact-e4-img-container">
                <div className="exact-e4-img-container-inner">
                  <img alt="" src="/ASSET/Images/imgImage17.webp" />
                </div>
              </div>
            </div>
          </div>
          <div className="floating-item pos-ec-e5 exact-e5">
            <p className="exact-e5-title">Color Harmony</p>
            <div className="exact-e5-content">
              <div className="exact-e5-colors">
                <div className="exact-e5-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse6.svg" />
                </div>
                <div className="exact-e5-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse7.svg" />
                </div>
                <div className="exact-e5-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse8.svg" />
                </div>
                <div className="exact-e5-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse9.svg" />
                </div>
                <div className="exact-e5-ellipse">
                  <img alt="" src="/ASSET/Icons/imgEllipse10.svg" />
                </div>
              </div>
              <p className="exact-e5-footer">Complementary</p>
            </div>
          </div>
          <div className="floating-item pos-ec-e6 exact-e6">
            <div className="exact-e6-content">
              <p className="exact-e6-title">Contrast</p>
              <div className="exact-e6-details">
                <p className="exact-e6-ratio">
                  <span className="exact-e6-ratio-1">A</span>
                  <span className="exact-e6-ratio-2">A</span>
                </p>
                <p className="exact-e6-val">4.6:1</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* State: Type Systems */}
      <div className={`hero-floating-state${active === 'type-systems' ? ' active' : ''}`} id="floating-type-systems">
        <div className="container-left">
          <div className="floating-item pos-ts-t4 exact-t4">
            <div className="exact-t4-content">
              <p className="exact-t4-title">Inter</p>
              <p className="exact-t4-subtitle">Font Family</p>
            </div>
          </div>
          <div className="floating-item pos-ts-t3 exact-t3">
            <div className="exact-t3-inner">
              <div className="exact-t3-rotater">
                <div className="exact-t3-content">
                  <p className="exact-t3-title">Body</p>
                  <p className="exact-t3-subtitle">16px / 24px</p>
                </div>
              </div>
            </div>
          </div>
          <div className="floating-item pos-ts-t1 exact-t1">
            <div className="exact-t1-content">
              <p className="exact-t1-title">H1</p>
              <p className="exact-t1-subtitle">48px / 56px</p>
            </div>
          </div>
          <div className="floating-item pos-ts-t2 exact-t2">
            <p className="exact-t2-title">Aa</p>
          </div>
        </div>
        <div className="container-right">
          <div className="floating-item pos-ts-t8 exact-t8">
            <div className="exact-t8-content">
              <p className="exact-t8-title">Aa</p>
              <p className="exact-t8-subtitle">Semibold</p>
            </div>
          </div>
          <div className="floating-item pos-ts-t7 exact-t7">
            <div className="exact-t7-inner">
              <div className="exact-t7-rotater">
                <div className="exact-t7-content">
                  <p className="exact-t7-title">Body</p>
                  <p className="exact-t7-subtitle">16px / 24px</p>
                </div>
              </div>
            </div>
          </div>
          <div className="floating-item pos-ts-t5 exact-t5">
            <div className="exact-t5-content">
              <p className="exact-t5-title">H2</p>
              <p className="exact-t5-subtitle">32px / 40px</p>
            </div>
          </div>
          <div className="floating-item pos-ts-t6 exact-t6">
            <p className="exact-t6-title">16px</p>
          </div>
        </div>
      </div>
      {/* State: Icons */}
      <div className={`hero-floating-state${active === 'icons' ? ' active' : ''}`} id="floating-icons">
        <div className="container-left">
          <div className="floating-item pos-ic-i1">
            <img alt="" src="/ASSET/Icons/imgI1.svg" className="w-full h-full" />
          </div>
          <div className="floating-item pos-ic-i2">
            <img alt="" src="/ASSET/Icons/imgI2.svg" className="w-full h-full" />
          </div>
          <div className="floating-item pos-ic-i3">
            <img alt="" src="/ASSET/Icons/imgI3.svg" className="w-full h-full" />
          </div>
          <div className="floating-item pos-ic-i4">
            <img alt="" src="/ASSET/Icons/imgI4.svg" className="w-full h-full" />
          </div>
        </div>
        <div className="container-right">
          <div className="floating-item pos-ic-i5">
            <img alt="" src="/ASSET/Icons/imgI5.svg" className="w-full h-full" />
          </div>
          <div className="floating-item pos-ic-i6">
            <img alt="" src="/ASSET/Icons/imgI6.svg" className="w-full h-full" />
          </div>
          <div className="floating-item pos-ic-i7">
            <img alt="" src="/ASSET/Icons/imgI7.svg" className="w-full h-full" />
          </div>
          <div className="floating-item pos-ic-i8">
            <img alt="" src="/ASSET/Icons/imgI8.svg" className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
