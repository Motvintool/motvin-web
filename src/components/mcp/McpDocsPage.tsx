import type { ReactNode } from 'react';
import { ButtonEffects } from '@/components/landing/ButtonEffects';
import { ConsentBanners } from '@/components/landing/ConsentBanners';
import { Footer } from '@/components/landing/Footer';
import { Navbar } from '@/components/landing/Navbar';

/** The page frame the MCP guides share: landing navbar, white sheet, curtain footer. */
export function McpDocsPage({ children }: { children: ReactNode }) {
  return (
    <div className="landing-root">
      {/* The guide starts close under the navbar, so it tucks away almost at once. */}
      <Navbar compactAfter={40} />
      <div className="landing-sheet">
        <main id="main-content" className="lpi mcd-page">
          {children}
        </main>
      </div>
      <Footer />
      <ConsentBanners />
      <ButtonEffects />
    </div>
  );
}
