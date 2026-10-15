'use client';

import Link from 'next/link';

/**
 * Full 404 footer — brand, socials row, link columns, and the bottom bar with
 * copyright + legal. Ports the footer block from motvin-ui/404.html, wired to
 * the site's real pages and accounts.
 */

// The site's real destinations (the same ones the landing Footer links to),
// in place of the mockup's placeholder columns that all pointed at "#".
const FOOTER_LINKS: Array<{ heading: string; items: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    heading: 'Inspirations',
    items: [
      { label: 'Apps', href: '/inspirations/apps' },
      { label: 'Screens', href: '/inspirations/screens' },
      { label: 'Flows', href: '/inspirations/flows' },
      { label: 'Patterns', href: '/inspirations/patterns' },
    ],
  },
  {
    heading: 'Library',
    items: [
      { label: 'Icons', href: '/icons' },
      { label: 'Logos', href: '/logos' },
      { label: 'Illustrations', href: '/illustrations' },
    ],
  },
  {
    heading: 'Company',
    items: [
      { label: 'About us', href: '/about' },
      { label: 'Updates', href: '/updates' },
      { label: 'Community', href: 'https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4', external: true },
    ],
  },
  {
    heading: 'Legal',
    items: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Copyright', href: '/copyrights' },
      { label: 'Request a removal', href: '/copyrights#ask-for-a-change-or-removal' },
    ],
  },
];

// The real accounts and icons the landing Footer uses.
const SOCIALS: Array<{ label: string; href: string; icon: string }> = [
  { label: 'Instagram', href: 'https://www.instagram.com/siren.uix', icon: '/ASSET/Icons/instagram-icon.svg' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/sirenuix/', icon: '/ASSET/Icons/linkedin-icon.svg' },
  { label: 'Behance', href: 'https://www.behance.net/surendarv', icon: '/ASSET/Icons/behance-icon.svg' },
];

export function NotFoundFooter() {
  return (
    <footer className="footer-404">
      <div className="footer-404-container">
        <div className="footer-404-top">
          <div className="footer-404-brand">
            <Link href="/" className="footer-404-logo">
              {/* The header's colour mark (logo-icon.svg is white, for dark backgrounds). */}
              <img src="/ASSET/Icons/motvin-logo.svg" alt="Motvin Logo" className="footer-404-logo-icon" />
              <span className="footer-404-logo-text">motvin</span>
            </Link>
            <div className="footer-404-socials">
              {SOCIALS.map(({ label, href, icon }) => (
                <a href={href} key={label} className="footer-404-social-link" target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <img src={icon} alt="" />
                </a>
              ))}
            </div>
          </div>

          <div className="footer-404-links">
            {FOOTER_LINKS.map(({ heading, items }) => (
              <div className="footer-404-col" key={heading}>
                <h4>{heading}</h4>
                {items.map(({ label, href, external }) =>
                  external ? (
                    <a href={href} key={label} target="_blank" rel="noopener noreferrer">
                      {label}
                    </a>
                  ) : (
                    <Link href={href} key={label}>
                      {label}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="footer-404-bottom">
        <div className="footer-404-bottom-container">
          <div className="footer-404-copyright">
            <p>© {new Date().getFullYear()} Motvin. All rights reserved.</p>
            <div className="footer-404-legal">
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/copyrights">Copyright</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
