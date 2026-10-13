import type { Metadata } from 'next';
import Link from 'next/link';
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

const COMMUNITY_URL = 'https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4';

/** Every Motvin product, with the same names and lines as the Products menu. */
const PRODUCTS = [
  { name: 'Motvin Inspirations', text: 'Browse screens, flows and patterns from real apps', href: '/inspirations', icon: '/ASSET/Icons/motvin-logo.svg', tone: 'violet' },
  { name: 'Motvin Convert', text: 'Turn any website into an editable design', href: '/MOTVIN', icon: '/ASSET/svg/motvin-convert.svg', tone: 'violet', external: true },
  { name: 'Motvin Extension', text: 'Convert websites directly from your browser', href: null, icon: '/ASSET/svg/motvin-extension.svg', tone: 'blue' },
  { name: 'Motvin Icons', text: 'Explore 350k+ editable icons', href: '/icons', icon: '/ASSET/svg/motvin-icons.svg', tone: 'green', external: true },
  { name: 'Motvin Logos', text: 'Explore 10k+ editable logos', href: '/logos', icon: '/ASSET/svg/motvin-logos.svg', tone: 'orange', external: true },
  { name: 'Motvin Illustrations', text: 'Explore 20k+ editable illustrations', href: '/illustrations', icon: '/ASSET/svg/motvin-illustrations.svg', tone: 'pink', external: true },
  { name: 'Motvin Typescales', text: 'Generate and customise typeface variants', href: '/MOTVIN/typeface', icon: '/ASSET/svg/motvin-typescales.svg', tone: 'red', external: true },
] as const;

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

const ARROW = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

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
          <section className="abt-hero">
            <h1 className="abt-title">
              Tools that help designers start from <span>something real</span>
            </h1>
            <p className="abt-lead">
              Motvin brings together real app screens to learn from, a converter that turns any website into editable design
              layers, and libraries of icons, logos and illustrations ready to drop into your work.
            </p>
            <div className="abt-actions">
              <Link href="/inspirations" className="abt-primary">
                Explore Inspirations {ARROW}
              </Link>
              <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="abt-secondary">
                Join the community
              </a>
            </div>
          </section>

          <section className="abt-story" aria-labelledby="abt-story-title">
            <h2 className="lpi-title" id="abt-story-title">
              Why Motvin
            </h2>
            <div className="abt-story-copy">
              <p>
                Designers spend a surprising share of their time looking for things: a reference for a checkout flow, the right icon,
                a logo in a usable format, a type scale that holds together.
              </p>
              <p>
                Motvin puts those things in one place. Look at how real products handle a moment, take a website apart into layers,
                and pick up the building blocks you need, so more of your time goes into the design itself.
              </p>
            </div>
          </section>

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
            <ul className="abt-product-grid">
              {PRODUCTS.map((product) => {
                const body = (
                  <>
                    <span className={`abt-product-icon is-${product.tone}`} aria-hidden="true">
                      <img src={product.icon} alt="" width={26} height={26} />
                    </span>
                    <span className="abt-product-copy">
                      <b>{product.name}</b>
                      <span>{product.text}</span>
                    </span>
                    {product.href ? (
                      <img className="abt-product-arrow" src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={20} height={20} aria-hidden="true" />
                    ) : (
                      <span className="abt-product-soon">Soon</span>
                    )}
                  </>
                );
                return (
                  <li key={product.name}>
                    {product.href ? (
                      'external' in product && product.external ? (
                        <a href={product.href} target="_blank" rel="noopener" className="abt-product">
                          {body}
                        </a>
                      ) : (
                        <Link href={product.href} className="abt-product">
                          {body}
                        </Link>
                      )
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
      <ButtonEffects />
    </div>
  );
}
