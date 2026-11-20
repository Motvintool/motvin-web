import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/config/share';
import { ButtonEffects } from '@/components/landing/ButtonEffects';
import { ConsentBanners } from '@/components/landing/ConsentBanners';
import { Footer } from '@/components/landing/Footer';
import { Navbar } from '@/components/landing/Navbar';
import { ClosingCta } from '@/components/landing/inspirations/ClosingCta';
import { McpLanding } from '@/components/mcp/McpLanding';
import '@/styles/landing.css';
import '@/styles/landing-inspirations.css';
import '@/styles/mobile-menu.css';
import '@/styles/mcp-hero.css';
import '@/styles/mcp.css';

export const metadata: Metadata = pageMetadata(
  'Motvin MCP — real app screens for your AI tools',
  'Connect Claude, Cursor, ChatGPT and other AI tools to Motvin. Your AI searches thousands of real screens and flows from shipped apps, so it builds on what already works.',
);

/**
 * /mcp — what Motvin MCP is and how to connect it, in the landing page's
 * clothes. The sections themselves are in McpLanding (client: tabs, copy
 * buttons, real screens from the library); this file is the page shell the
 * About page also uses.
 */
export default function McpPage() {
  return (
    <div className="landing-root">
      <Navbar />
      <div className="landing-sheet">
        <main id="main-content" className="lpi mcpp">
          <McpLanding />
          <ClosingCta
            title="Your AI is guessing. It doesn't have to."
            text="Connect it to Motvin and it designs from real products. The library is free to explore."
            primary={{ label: 'Connect in a minute', href: '#mcp-setup' }}
            secondary={{ label: 'Explore the library', href: '/inspirations' }}
          />
        </main>
      </div>
      {/* The curtain footer is sticky; it must sit after the sheet, not inside it, or it covers the page. */}
      <Footer />
      <ConsentBanners />
      <ButtonEffects />
    </div>
  );
}
