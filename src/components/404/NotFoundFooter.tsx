'use client';

import Link from 'next/link';

/**
 * Full 404 footer — brand, socials row, link columns, and the bottom bar with
 * copyright + legal + secondary socials. Ports the footer block from
 * motvin-ui/404.html.
 */

const FOOTER_LINKS: Array<{ heading: string; items: string[] }> = [
  {
    heading: 'Color Generator',
    items: ['Type Scale', 'Token Export', 'HTML Import', 'Design Analyzer'],
  },
  { heading: 'Documentation', items: ['Blog', 'Tutorials', 'Community', 'Status'] },
  { heading: 'Features', items: ['How it works', 'App', 'Changelog'] },
  { heading: 'About', items: ['Careers', 'Contact', 'Privacy', 'Terms'] },
];

const SOCIALS: Array<{ label: string; svg: string }> = [
  { label: 'Instagram', svg: 'instagram-icon.svg' },
  { label: 'X', svg: 'x-icon.svg' },
  { label: 'YouTube', svg: 'youtube-icon.svg' },
  { label: 'Facebook', svg: 'facebook-icon.svg' },
];

const BOTTOM_SOCIALS: Array<{ label: string; svg: string }> = [
  { label: 'Instagram', svg: 'instagram-icon.svg' },
  { label: 'LinkedIn', svg: 'linkedin-icon.svg' },
  { label: 'TikTok', svg: 'tiktok-icon.svg' },
];

const hideOnError: React.ImgHTMLAttributes<HTMLImageElement>['onError'] = (e) => {
  e.currentTarget.style.opacity = '0';
};

export function NotFoundFooter() {
  return (
    <footer className="footer-404">
      <div className="footer-404-container">
        <div className="footer-404-top">
          <div className="footer-404-brand">
            <Link href="/" className="footer-404-logo">
              <img
                src="/ASSET/svg/logo-icon-color.svg"
                alt="Motvin Logo"
                className="footer-404-logo-icon"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/ASSET/svg/logo-icon.svg';
                }}
              />
              <span className="footer-404-logo-text">motvin</span>
            </Link>
            <div className="footer-404-socials">
              {SOCIALS.map(({ label, svg }) => (
                <a href="#" key={label} className="footer-404-social-link">
                  <img src={`/ASSET/svg/${svg}`} alt={label} onError={hideOnError} />
                </a>
              ))}
            </div>
          </div>

          <div className="footer-404-links">
            {FOOTER_LINKS.map(({ heading, items }) => (
              <div className="footer-404-col" key={heading}>
                <h4>{heading}</h4>
                {items.map((label) => (
                  <a href="#" key={label}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="footer-404-bottom">
        <div className="footer-404-bottom-container">
          <div className="footer-404-copyright">
            <p>© 2026 Motvin. All rights reserved.</p>
            <div className="footer-404-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Cookie Policy</a>
            </div>
          </div>
          <div className="footer-404-bottom-socials">
            {BOTTOM_SOCIALS.map(({ label, svg }) => (
              <a href="#" key={label}>
                <img src={`/ASSET/svg/${svg}`} alt={label} onError={hideOnError} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
