import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/config/share';
import { FIGMA_PLUGIN_URL } from '@/lib/figma/plugin';
import { ButtonEffects } from '@/components/landing/ButtonEffects';
import { ConsentBanners } from '@/components/landing/ConsentBanners';
import { Footer } from '@/components/landing/Footer';
import { Navbar } from '@/components/landing/Navbar';
import { ClosingCta } from '@/components/landing/inspirations/ClosingCta';
import { FigmaMark } from '@/components/plugins/FigmaMark';
import { PluginsAnimations } from '@/components/plugins/PluginsAnimations';
import { PluginsLanding } from '@/components/plugins/PluginsLanding';
import '@/styles/landing.css';
import '@/styles/landing-inspirations.css';
import '@/styles/mobile-menu.css';
import '@/styles/mcp-hero.css';
import '@/styles/mcp.css';
import '@/styles/plugins.css';
import '@/styles/plugin-demo.css';

export const metadata: Metadata = pageMetadata(
  'Motvin for Figma — real app screens on your canvas',
  'Search thousands of real screens and flows from shipped apps inside Figma, or copy them on motvin.com and paste them in. Free to browse.',
  '/plugins',
);

/**
 * /plugins — the Motvin Figma plugin ("Motvin — Inspiration"): what it does
 * and how to get it, in the landing page's clothes, like /mcp. The sections
 * are in PluginsLanding (client: real screens from the library); this file is
 * the page shell.
 */
export default function PluginsPage() {
  return (
    <div className="landing-root">
      <Navbar />
      <div className="landing-sheet">
        <main id="main-content" className="lpi mcpp plg">
          <PluginsLanding />
          <ClosingCta
            title="Start every design from what already works."
            text="Get the plugin, search real apps, and drop their screens straight onto your canvas."
            primary={{ label: 'Get the Figma plugin', href: FIGMA_PLUGIN_URL, icon: <FigmaMark /> }}
            secondary={{ label: 'Explore the library', href: '/inspirations' }}
          />
        </main>
      </div>
      {/* The curtain footer is sticky; it must sit after the sheet, not inside it, or it covers the page. */}
      <Footer />
      <ConsentBanners />
      <PluginsAnimations />
      <ButtonEffects />
    </div>
  );
}
