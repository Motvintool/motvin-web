'use client';

import Link from 'next/link';
import type { Ref } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { SHOW_MCP_IN_NAV } from '@/lib/mcp/visibility';

export const INSTAGRAM_URL = 'https://www.instagram.com/motvintool/';
export const LINKEDIN_URL = 'https://www.linkedin.com/company/motvin/home';

/**
 * The hamburger panel's list (<=1300px): every link at once under small group labels, in large type, the
 * way mobbin.com's menu reads, instead of the desktop mega-menus folded into accordions. Tools that aren't
 * live yet are plain rows with a "Soon" tag, as in the desktop Products menu.
 */

export type MobileMenuItem = { label: string; href?: string; external?: boolean; soon?: boolean; fresh?: boolean; onClick?: () => void };
type Item = MobileMenuItem;

export function MobileMenu({
  onNavigate,
  onRequestApp,
  instagramUrl,
  linkedinUrl,
  extraResources = [],
}: {
  onNavigate: () => void;
  /** Opens the request form in place. Without it, Request apps is a plain link to the Requests page. */
  onRequestApp?: () => void;
  instagramUrl: string;
  linkedinUrl: string;
  /** Page-specific links listed first under Resources (the library adds its Community group). */
  extraResources?: MobileMenuItem[];
}) {
  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Products',
      items: [
        { label: 'Inspirations', href: '/inspirations' },
        { label: 'Icons', href: '/icons', external: true },
        { label: 'Logos', href: '/logos', external: true },
        { label: 'Illustrations', href: '/illustrations', external: true },
        // The desktop navbar's "MCP" link (it replaced the "Join us" community menu); hidden while MCP is tested privately.
        ...(SHOW_MCP_IN_NAV ? [{ label: 'MCP', href: '/mcp', fresh: true }] : []),
        { label: 'Convert', soon: true },
        { label: 'Extension', soon: true },
        { label: 'Typescales', soon: true },
      ],
    },
    {
      title: 'Resources',
      items: [
        ...extraResources,
        { label: 'Updates', href: '/updates/', external: true },
        { label: 'About us', href: '/about' },
        // Opens the library's request form right over the page, as the desktop Resources menu does.
        { label: 'Request apps', href: INSPIRATIONS_ROUTES.settingsRequests, onClick: onRequestApp },
        { label: 'Copyrights', href: '/copyrights' },
      ],
    },
    {
      title: 'Socials',
      items: [
        { label: 'Instagram', href: instagramUrl, external: true },
        { label: 'LinkedIn', href: linkedinUrl, external: true },
      ],
    },
  ];

  const row = (item: Item) => {
    const body = (
      <>
        <span className="mi-mm-label">{item.label}</span>
        {item.soon && <span className="mi-mm-soon">Soon</span>}
        {item.fresh && <span className="mi-mm-new">New</span>}
      </>
    );
    if (item.soon || !item.href) {
      return (
        <span className="mi-mm-link is-soon" aria-disabled="true">
          {body}
        </span>
      );
    }
    if (item.onClick) {
      const run = item.onClick;
      return (
        <a
          className="mi-mm-link"
          href={item.href}
          onClick={(e) => {
            e.preventDefault();
            onNavigate();
            run();
          }}
        >
          {body}
        </a>
      );
    }
    if (item.external) {
      return (
        <a className="mi-mm-link" href={item.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
          {body}
        </a>
      );
    }
    return (
      <Link className="mi-mm-link" href={item.href} onClick={onNavigate}>
        {body}
      </Link>
    );
  };

  return (
    <nav className="mi-mm" aria-label="Menu">
      {groups.map((group) => (
        <section className="mi-mm-group" key={group.title}>
          <h2 className="mi-mm-title">{group.title}</h2>
          <ul className="mi-mm-list">
            {group.items.map((item) => (
              <li key={item.label}>{row(item)}</li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/**
 * The full-screen hamburger panel around the list: logo, the page's call to action and close along the top,
 * Sign in across the bottom for visitors. The landing pages' Navbar and the library pages both open it; its
 * styles are in mobile-menu.css. The opener owns `open`, scroll locking and outside-click / Escape handling.
 */
export function MobileMenuPanel({
  open,
  onClose,
  onRequestApp,
  extraResources,
  panelRef,
}: {
  open: boolean;
  onClose: () => void;
  onRequestApp?: () => void;
  extraResources?: MobileMenuItem[];
  panelRef?: Ref<HTMLDivElement>;
}) {
  const { user } = useAuth();
  return (
    <div className={`mi-nav-mobile-panel${open ? ' is-open' : ''}`} id="nav-mobile-panel" ref={panelRef}>
      <div className="mi-nav-mobile-panel-main">
        <div className="mi-nav-mobile-panel-header">
          <Link href="/" className="mi-nav-mobile-panel-logo" aria-label="Motvin home" onClick={onClose}>
            <img src="/ASSET/Icons/motvin-logo.svg" alt="" />
          </Link>
          <div className="mi-mm-head-actions">
            {/* The page's main call to action rides in the menu's top row, as on mobbin.com. Same label and
                look as the top bar's button it opens over, so nothing jumps when the menu opens. */}
            <Link href={user ? '/inspirations' : '/signup'} className="mi-mm-cta" onClick={onClose}>
              {user ? 'Go to Library' : 'Get started for free'}
            </Link>
            <button
              className="mi-nav-mobile-panel-close"
              id="nav-mobile-panel-close"
              aria-label="Close menu"
              onClick={onClose}
            >
              <img src="/ASSET/Icons/nav-close-bold.svg" alt="" />
            </button>
          </div>
        </div>
        <div className="mi-nav-mobile-panel-content">
          <MobileMenu
            onNavigate={onClose}
            onRequestApp={onRequestApp}
            instagramUrl={INSTAGRAM_URL}
            linkedinUrl={LINKEDIN_URL}
            extraResources={extraResources}
          />
        </div>
      </div>
      {!user && (
        <div className="mi-nav-mobile-panel-actions mi-mm-foot">
          <Link href="/login" className="mi-mm-signin" onClick={onClose}>
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
