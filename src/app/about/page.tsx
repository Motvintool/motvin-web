import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { AboutAnimations } from '@/components/landing/AboutAnimations';
import { AboutFeatured } from '@/components/landing/AboutFeatured';
import { AboutStage } from '@/components/landing/AboutStage';
import { AboutStatement } from '@/components/landing/AboutStatement';
import { ButtonEffects } from '@/components/landing/ButtonEffects';
import { ConsentBanners } from '@/components/landing/ConsentBanners';
import { ClosingCta } from '@/components/landing/inspirations/ClosingCta';
import { Footer } from '@/components/landing/Footer';
import { Navbar } from '@/components/landing/Navbar';
import { CONTACT_EMAIL } from '@/components/legal/LegalPage';
import { optimizedImage } from '@/lib/inspirations/optimizedImage';
import '@/styles/landing.css';
import '@/styles/landing-inspirations.css';
import '@/styles/about.css';

export const metadata: Metadata = {
  title: 'About us — Motvin',
  description:
    'Motvin is a set of tools for designers: real app screens to learn from, a website-to-design converter, and libraries of icons, logos and illustrations.',
};

/**
 * Motvin's other tools, with the same names and lines as the Products menu,
 * laid out as a bento: wide and narrow tiles alternating row by row, the
 * live ones first. Each tile shows a small picture of what the tool does.
 * Inspirations, the flagship, has its own banner above them (AboutFeatured).
 */
const PRODUCTS = [
  { name: 'Motvin Icons', text: 'Explore 350k+ editable icons, in every style, ready to drop into your designs.', href: '/icons', icon: '/ASSET/svg/motvin-icons.svg', tone: 'green', visual: 'icons', wide: true },
  { name: 'Motvin Logos', text: 'Explore 10k+ editable logos', href: '/logos', icon: '/ASSET/svg/motvin-logos.svg', tone: 'orange', visual: 'logos', wide: false },
  { name: 'Motvin Illustrations', text: 'Explore 20k+ editable illustrations', href: '/illustrations', icon: '/ASSET/svg/motvin-illustrations.svg', tone: 'pink', visual: 'illustrations', wide: false, hidden: true },
  { name: 'Motvin Convert', text: 'Turn any website into an editable design, layer by layer.', href: null, icon: '/ASSET/svg/motvin-convert.svg', tone: 'violet', visual: 'convert', wide: true, hidden: true },
  { name: 'Motvin Extension', text: 'Convert websites directly from your browser, in one click.', href: null, icon: '/ASSET/svg/motvin-extension.svg', tone: 'blue', visual: 'extension', wide: true },
  { name: 'Motvin Typescales', text: 'Generate and customise typeface variants', href: null, icon: '/ASSET/svg/motvin-typescales.svg', tone: 'red', visual: 'typescales', wide: false },
] as const;

// Kept in the list but not shown for now; drop `hidden` to bring a tile back.
const SHOWN_PRODUCTS = PRODUCTS.filter((product) => !('hidden' in product && product.hidden));

type ProductVisual = (typeof PRODUCTS)[number]['visual'];

// The icons shown on the Icons tile, the same set the hero floats.
const ICON_SAMPLES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `/ASSET/Icons/imgI${n}.svg`);
const LOGO_SAMPLES = [1, 2, 3, 4].map((n) => `/ASSET/landing/hero-app-icon-${n}.webp`);

/** The small picture at the top of each tool's tile. Decorative. */
function ProductVisual({ visual, icon }: { visual: ProductVisual; icon: string }) {
  switch (visual) {
    case 'icons':
      return (
        <span className="abt-vis abt-vis-icons">
          {[...ICON_SAMPLES, ...ICON_SAMPLES.slice(0, 4)].map((src, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties}>
              <img src={src} alt="" width={28} height={28} />
            </span>
          ))}
        </span>
      );
    case 'logos':
      return (
        <span className="abt-vis abt-vis-logos">
          {LOGO_SAMPLES.map((src, i) => (
            <img key={src} src={src} alt="" width={64} height={64} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      );
    case 'illustrations':
      return (
        <span className="abt-vis abt-vis-illustrations">
          <span className="abt-vis-blob" />
          <img className="abt-vis-hero" src={icon} alt="" width={84} height={84} />
          <img className="abt-vis-spark is-a" src="/ASSET/Icons/imgI2.svg" alt="" width={26} height={26} />
          <img className="abt-vis-spark is-b" src="/ASSET/landing/hero-sparkle-green.svg" alt="" width={22} height={22} />
        </span>
      );
    case 'convert':
      return (
        <span className="abt-vis abt-vis-convert">
          <span className="abt-vis-url">
            <i />
            motvin.com
          </span>
          <span className="abt-vis-arrow">→</span>
          <span className="abt-vis-layers">
            <i />
            <i />
            <i />
          </span>
        </span>
      );
    case 'extension':
      return (
        <span className="abt-vis abt-vis-extension">
          <span className="abt-vis-browser">
            <span className="abt-vis-browser-bar">
              <i />
              <i />
              <i />
              <span className="abt-vis-browser-url" />
              <img src={icon} alt="" width={18} height={18} />
            </span>
            <span className="abt-vis-popup">
              <img src={icon} alt="" width={20} height={20} />
              Capture this page
            </span>
          </span>
        </span>
      );
    case 'typescales':
      return (
        <span className="abt-vis abt-vis-type">
          <b>Aa</b>
          <span className="abt-vis-scale">
            <i style={{ width: '88%' }} />
            <i style={{ width: '64%' }} />
            <i style={{ width: '44%' }} />
          </span>
        </span>
      );
  }
}

/** The founder's public profiles, the same ones the footer links to. */
const FOUNDER_LINKS = [
  { label: 'Instagram', handle: '@siren.uix', href: 'https://www.instagram.com/siren.uix', icon: '/ASSET/Icons/instagram-icon.svg', tone: 'instagram' },
  { label: 'LinkedIn', handle: 'sirenuix', href: 'https://www.linkedin.com/in/sirenuix/', icon: '/ASSET/Icons/linkedin-icon.svg', tone: 'linkedin' },
  { label: 'Behance', handle: 'surendarv', href: 'https://www.behance.net/surendarv', icon: '/ASSET/Icons/behance-icon.svg', tone: 'behance' },
];

// Shown 200px round; the original is far larger, so it is resized on the way.
const FOUNDER_PHOTO = optimizedImage('/ASSET/Images/avatar.webp', 200);

const BELIEFS = [
  {
    title: 'Start from something real',
    text: 'Great design rarely begins on a blank canvas. Seeing how shipped products solve the same problem is the fastest way to a confident first idea.',
  },
  {
    title: 'Credit where it is due',
    text: 'Every screen, logo and name in the library belongs to its owner, and is shown for reference only. Owners can ask for anything to be removed.',
  },
  {
    title: 'Made with designers',
    text: 'Motvin grows with its community. Ideas, requests and feedback from the people who use it decide what we build next.',
  },
];

/**
 * About Motvin: what it is, what it makes, what it stands for, and how to
 * reach the people behind it. Uses the landing page's own navbar, footer and
 * section styles, so it reads as part of the same site.
 */
export default function AboutPage() {
  return (
    <div className="landing-root">
      <Navbar />
      <div className="landing-sheet">
        <main id="main-content" className="lpi abt">
          {/* A short headline and one line, then the picture: the sky stage
              with the phone and Motvin's tools floating round it. */}
          <section className="abt-hero">
            <h1 className="abt-title">
              We&apos;re here to help <br className="abt-title-break" />
              ideas shine
            </h1>
            <p className="abt-lead">We&apos;re on a mission to make designing from real products easier.</p>
            <AboutStage />
          </section>

          <AboutStatement />

          <section className="abt-founder" aria-labelledby="abt-founder-title">
            <div className="abt-founder-card">
              {/* The portrait, dressed up on a soft pastel panel: a brand-colour
                  ring, a hello sticker, and the hero's sparkles and the
                  wordmark's dots floating round it. */}
              <div className="abt-founder-visual">
                <div className="abt-founder-portrait">
                  <span className="abt-founder-ring">
                    <img className="abt-founder-photo" {...FOUNDER_PHOTO} alt="Surendar V" width={200} height={200} />
                  </span>
                  <span className="abt-founder-hello" aria-hidden="true">
                    Hello! <span className="abt-founder-wave">👋</span>
                  </span>
                  <img className="abt-founder-deco is-spark-blue" src="/ASSET/Icons/imgI2.svg" alt="" width={30} height={30} aria-hidden="true" />
                  <img className="abt-founder-deco is-spark-green" src="/ASSET/landing/hero-sparkle-green.svg" alt="" width={26} height={26} aria-hidden="true" />
                  <span className="abt-founder-dot is-red" aria-hidden="true" />
                  <span className="abt-founder-dot is-purple" aria-hidden="true" />
                  <span className="abt-founder-dot is-green" aria-hidden="true" />
                </div>
              </div>

              <div className="abt-founder-copy">
                <h2 className="lpi-title" id="abt-founder-title">
                  Meet the founder
                </h2>
                <p className="abt-founder-text">
                  Motvin is founded and designed by Surendar V, a product designer. Find more of Surendar&apos;s work, UI templates
                  and design experiments on the channels below.
                </p>
                <p className="abt-founder-sign">
                  <span className="abt-founder-signature">
                    Surendar V
                    <svg className="abt-founder-swoosh" viewBox="0 0 160 20" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M4 14 C 40 4, 90 2, 156 10" pathLength={1} />
                    </svg>
                  </span>
                  <span className="abt-founder-role">Founder &amp; Product Designer</span>
                </p>
                <ul className="abt-founder-links">
                  {FOUNDER_LINKS.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Surendar V on ${link.label} (${link.handle})`}
                        title={`${link.label} · ${link.handle}`}
                        className={`is-${link.tone}`}
                      >
                        <img src={link.icon} alt="" width={20} height={20} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="abt-products" aria-labelledby="abt-products-title">
            <div className="lpi-heading">
              <h2 className="lpi-title" id="abt-products-title">
                What we make
              </h2>
              <p className="lpi-lead">One family of tools, each built for a different part of the job.</p>
            </div>
            <AboutFeatured />
            <ul className="abt-product-grid">
              {SHOWN_PRODUCTS.map((product) => {
                const body = (
                  <>
                    <ProductVisual visual={product.visual} icon={product.icon} />
                    {product.href ? null : <span className="abt-product-soon">Soon</span>}
                    <span className="abt-product-copy">
                      <b>
                        <span className={`abt-product-icon is-${product.tone}`} aria-hidden="true">
                          <img src={product.icon} alt="" width={18} height={18} />
                        </span>
                        {product.name}
                      </b>
                      <span>{product.text}</span>
                    </span>
                    {product.href ? (
                      <img className="abt-product-arrow" src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={20} height={20} aria-hidden="true" />
                    ) : null}
                  </>
                );
                return (
                  <li key={product.name} className={product.wide ? 'is-wide' : undefined}>
                    {product.href ? (
                      // The libraries live on their own sites, so they open in a new tab.
                      <a href={product.href} target="_blank" rel="noopener" className="abt-product">
                        {body}
                      </a>
                    ) : (
                      <div className="abt-product is-soon" aria-disabled="true">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="abt-beliefs" aria-labelledby="abt-beliefs-title">
            <div className="lpi-heading">
              <h2 className="lpi-title" id="abt-beliefs-title">
                What we believe
              </h2>
            </div>
            <ol className="abt-belief-grid">
              {BELIEFS.map((belief, i) => (
                <li className="abt-belief" key={belief.title}>
                  <span className="abt-belief-index">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{belief.title}</h3>
                  <p>{belief.text}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Signs off the same way as the landing page, with its own words. */}
          <ClosingCta
            title="Say hello"
            text="Questions, ideas, or something shown here that you own and want changed? Write to us and we will get back to you."
            primary={{ label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` }}
            secondary={{ label: 'Request a removal', href: '/copyrights#ask-for-a-change-or-removal' }}
          />
        </main>
      </div>
      <Footer />
      <ConsentBanners />
      <AboutAnimations />
      <ButtonEffects />
    </div>
  );
}
