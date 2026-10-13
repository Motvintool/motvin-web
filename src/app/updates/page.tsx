import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ButtonEffects } from '@/components/landing/ButtonEffects';
import { ConsentBanners } from '@/components/landing/ConsentBanners';
import { Footer } from '@/components/landing/Footer';
import { Navbar } from '@/components/landing/Navbar';
import { PublicAuthBanner } from '@/components/updates/public/PublicAuthBanner';
import { ReleaseFeed } from '@/components/updates/public/ReleaseFeed';
import '@/styles/landing.css';
import '@/styles/landing-inspirations.css';
import '@/styles/updates-feed.css';

export const metadata: Metadata = {
  title: 'Updates — Motvin',
  description: 'New features, improvements and fixes in Motvin, release by release.',
};

/**
 * Updates: Motvin's release notes, newest first, in the same chrome as the
 * landing and About pages (navbar, white sheet, curtain footer).
 *
 * ReleaseFeed reads `?release=<slug>` to scroll a shared release into view,
 * so it sits in a Suspense boundary (Next 16 requires one around
 * useSearchParams during static generation). The publisher at
 * /updates/admin keeps its own layout and styles.
 */
export default function UpdatesPage() {
  return (
    <div className="landing-root">
      <Navbar />
      <div className="landing-sheet">
        <main id="main-content" className="lpi upd">
          <section className="upd-hero">
            <PublicAuthBanner />
            <h1 className="upd-title">What&apos;s new in Motvin</h1>
            <p className="upd-lead">New features, improvements and fixes, release by release.</p>
          </section>
          <Suspense fallback={null}>
            <ReleaseFeed />
          </Suspense>
        </main>
      </div>
      <Footer />
      <ConsentBanners />
      <ButtonEffects />
    </div>
  );
}
