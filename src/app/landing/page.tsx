import { ButtonEffects } from '@/components/landing/ButtonEffects';
import { ConsentBanners } from '@/components/landing/ConsentBanners';
import { Demo } from '@/components/landing/Demo';
import { Explore } from '@/components/landing/Explore';
import { Faq } from '@/components/landing/Faq';
import { Footer } from '@/components/landing/Footer';
import { Hero } from '@/components/landing/Hero';
import { HowItWork } from '@/components/landing/HowItWork';
import { IconsLibrary } from '@/components/landing/IconsLibrary';
import { LandingAnimations } from '@/components/landing/LandingAnimations';
import { Navbar } from '@/components/landing/Navbar';
import { Templates } from '@/components/landing/Templates';
import '@/styles/landing.css';

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
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Demo />
        <IconsLibrary />
        <HowItWork />
        <Templates />
        <Faq />
      </main>
      {/* Outside <main>, as in the original markup. */}
      <Explore />
      <Footer />
      <ConsentBanners />
      <LandingAnimations />
      <ButtonEffects />
    </>
  );
}
