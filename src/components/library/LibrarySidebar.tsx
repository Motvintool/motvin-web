'use client';

import Link from 'next/link';
import { useAuth } from '@/components/shared/AuthProvider';

/**
 * Left rail — port of `aside.mi-left-sidebar` in the three library pages.
 *
 * The buttons select which tab the right panel shows; `active` mirrors that
 * choice onto the rail. Markup is the original's, so the existing CSS applies
 * unchanged.
 */

export type SidebarTab = 'filters' | 'categories' | 'saved' | 'plugins' | 'help';

type Props = {
  active: SidebarTab;
  onSelect: (tab: SidebarTab) => void;
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
};

export function LibrarySidebar({
  active,
  onSelect,
  mobileMenuOpen,
  onToggleMobileMenu,
}: Props) {
  const { user } = useAuth();
  const itemClass = (tab: SidebarTab) =>
    `mi-sidebar-item${active === tab ? ' is-active' : ''}`;

  return (
    <aside className="mi-left-sidebar" aria-label="Navigation">
      <div className="mi-sidebar-top">
        <Link href="/" className="mi-sidebar-logo" aria-label="Motvin home">
          {/* The phone/tablet bar shows the landing bar's logo file (its 38px
              artboard sizes the mark differently from the rail's 42px one), so
              it doesn't change size when the shared menu opens over it. */}
          <picture>
            <source media="(max-width: 1300px)" srcSet="/ASSET/Icons/motvin-logo.svg" />
            <img
              src="/ASSET/Icons/nav-icon-motvin-logo.svg"
              alt="Motvin"
              className="mi-sidebar-logo-img"
            />
          </picture>
        </Link>
        <button className={itemClass('filters')} onClick={() => onSelect('filters')} data-sidebar="filters" title="Filters">
          <span className="mi-sidebar-icon-container">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="21" y1="4" x2="14" y2="4"></line>
              <line x1="10" y1="4" x2="3" y2="4"></line>
              <line x1="21" y1="12" x2="12" y2="12"></line>
              <line x1="8" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="20" x2="16" y2="20"></line>
              <line x1="12" y1="20" x2="3" y2="20"></line>
              <line x1="14" y1="2" x2="14" y2="6"></line>
              <line x1="8" y1="10" x2="8" y2="14"></line>
              <line x1="16" y1="18" x2="16" y2="22"></line>
            </svg>
            <img
              src="/ASSET/Icons/sidebar-filters-active.svg"
              alt=""
              className="mi-sidebar-active-icon"
            />
            <img
              src="/ASSET/Icons/sidebar-filters-inactive.svg"
              alt=""
              className="mi-sidebar-inactive-icon"
            />
          </span>
          <span className="mi-sidebar-label">Filters</span>
          <img
            src="/ASSET/Icons/active-tab-highlight.svg"
            alt=""
            className="mi-sidebar-active-indicator"
          />
        </button>
        <button
          className={itemClass('categories')}
          onClick={() => onSelect('categories')}
          data-sidebar="categories"
          title="Categories"
        >
          <span className="mi-sidebar-icon-container">
            <img
              src="/ASSET/Icons/sidebar-packs.svg"
              alt=""
              className="mi-sidebar-tab-icon"
            />
          </span>
          <span className="mi-sidebar-label">Packs</span>
          <img
            src="/ASSET/Icons/active-tab-highlight.svg"
            alt=""
            className="mi-sidebar-active-indicator"
          />
        </button>
        <button
          className={itemClass('saved')}
          onClick={() => onSelect('saved')}
          id="btn-favorites"
          data-sidebar="saved"
          title="Saved / Favorites"
          aria-label="Favorites"
        >
          <span className="mi-sidebar-icon-container">
            <img
              src="/ASSET/Icons/sidebar-saved.svg"
              alt=""
              className="mi-sidebar-tab-icon"
            />
          </span>
          <span className="mi-sidebar-label">Saved</span>
          <img
            src="/ASSET/Icons/active-tab-highlight.svg"
            alt=""
            className="mi-sidebar-active-indicator"
          />
        </button>
      </div>
      <div className="mi-sidebar-bottom">
        <button className={itemClass('plugins')} onClick={() => onSelect('plugins')} data-sidebar="plugins" title="Plugins">
          <span className="mi-sidebar-icon-container">
            <img
              src="/ASSET/Icons/sidebar-plugins.svg"
              alt=""
              className="mi-sidebar-tab-icon mi-sidebar-tab-icon--plugins"
            />
          </span>
          <span className="mi-sidebar-label">Plugins</span>
          <img
            src="/ASSET/Icons/active-tab-highlight.svg"
            alt=""
            className="mi-sidebar-active-indicator"
          />
        </button>
        <button className={itemClass('help')} onClick={() => onSelect('help')} data-sidebar="help" title="Help">
          <span className="mi-sidebar-icon-container">
            <img
              src="/ASSET/Icons/sidebar-helps.svg"
              alt=""
              className="mi-sidebar-tab-icon"
            />
          </span>
          <span className="mi-sidebar-label">Helps</span>
          <img
            src="/ASSET/Icons/active-tab-highlight.svg"
            alt=""
            className="mi-sidebar-active-indicator"
          />
        </button>
      </div>
      {/* Phone/tablet top bar, as on the landing pages: the call to action, then
          the hamburger that opens the shared menu (MobileMenuPanel). */}
      <div className="mi-mobile-navbar-actions">
        <Link
          href={user ? '/inspirations' : '/signup'}
          className={`mi-mobile-get-started${user ? '' : ' is-dark'}`}
        >
          {user ? 'Go to Library' : 'Get started for free'}
        </Link>
        <button
          className={`mi-mobile-menu-toggle${mobileMenuOpen ? ' is-open' : ''}`}
          id="mobile-menu-toggle"
          aria-label="Menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="nav-mobile-panel"
          onClick={onToggleMobileMenu}
        >
          <img
            src="/ASSET/Icons/nav-open-bold.svg"
            alt=""
            className="mi-mobile-menu-icon-open"
          />
          <img
            src="/ASSET/Icons/nav-close-bold.svg"
            alt=""
            className="mi-mobile-menu-icon-close"
          />
        </button>
      </div>
    </aside>
  );
}
