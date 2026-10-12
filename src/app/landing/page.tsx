import { ButtonEffects } from '@/components/landing/ButtonEffects';
import { ConsentBanners } from '@/components/landing/ConsentBanners';
import { Explore } from '@/components/landing/Explore';
import { Faq } from '@/components/landing/Faq';
import { Footer } from '@/components/landing/Footer';
import { Hero } from '@/components/landing/Hero';
import { ClosingCta } from '@/components/landing/inspirations/ClosingCta';
import { InspirationsSections } from '@/components/landing/inspirations/InspirationsSections';
import { LandingAnimations } from '@/components/landing/LandingAnimations';
import { Navbar } from '@/components/landing/Navbar';
import { Templates } from '@/components/landing/Templates';
import '@/styles/landing.css';
import '@/styles/landing-inspirations.css';

/**
 * Landing page — port of motvin-ui/index.html.
 *
 * Section order matches the original exactly; the GSAP work and the button
 * effects mount last because they bind to elements across every section.
 *
 * Reachable at `/` (via `src/app/page.tsx` re-export) and `/landing`
 * canonicalises to `/` through the redirect in `next.config.ts`.
 */
export default function HomePage() {
  return (
    <div className="landing-root">
      <Navbar />
      {/* The white "sheet" scrolls up off the footer, which waits underneath. */}
      <div className="landing-sheet">
        <main id="main-content">
          <Hero />
          <InspirationsSections />
          <Templates />
          <Explore />
          <Faq />
          {/* Last, right above the footer, the way the page signs off. */}
          <ClosingCta />
        </main>
      </div>
      <Footer />
      <ConsentBanners />
      <LandingAnimations />
      <ButtonEffects />
    </div>
  );
}
