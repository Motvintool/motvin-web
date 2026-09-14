'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  CATEGORIES,
  CATEGORY_CONFIG,
  categoryHref,
  type CategoryConfig,
} from '@/lib/config/categories';
import { LibraryProfileMenu } from './LibraryProfileMenu';
import type { SidebarTab } from './LibrarySidebar';

/**
 * The top pane — port of `header.mi-top-header` in the three library pages.
 *
 * Wordmark and beta badge on the left with the community/updates nav,
 * the library switcher and profile avatar on the right. The switcher's trigger
 * shows whichever library you're in; its menu links to the other two.
 */

type Props = {
  config: CategoryConfig;
  /** Passed to the profile menu so "Saved Collections" can flip the right panel. */
  onSelectSidebarTab?: (tab: SidebarTab) => void;
};

/** Three overlapping source marks, used on the trigger and each menu row. */
function IconCluster({ logos }: { logos: readonly string[] }) {
  return (
    <div className="mi-products-dropdown-item-icon-cluster">
      {logos.slice(0, 3).map((src) => (
        <div className="mi-cluster-circle" key={src}>
          <img src={src} alt="" className="mi-cluster-img" />
        </div>
      ))}
    </div>
  );
}

export function LibraryTopHeader({ config, onSelectSidebarTab }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <header className="mi-top-header">
      <div className="mi-top-header-left">
        <div className="mi-top-logo-group">
          <Link href="/" aria-label="Motvin home">
            <img
              src="/ASSET/Icons/header-motvin-wordmark.svg"
              alt="Motvin"
              className="mi-top-logo-text"
            />
          </Link>
          <div className="mi-top-beta-badge">Beta</div>
        </div>
        <div className="mi-top-nav-wrap">
          <img
            src="/ASSET/Icons/header-nav-divider.svg"
            className="mi-top-header-divider"
            alt=""
          />
          <nav className="mi-top-nav">
            <a
              href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
              target="_blank"
              className="mi-top-nav-link"
            >
              Community
              <span className="mi-top-nav-badge">New</span>
            </a>
            <a href="/updates/" target="_blank" className="mi-top-nav-link">
              Release Notes
            </a>
          </nav>
        </div>
      </div>

      <div className="mi-top-header-right">
        <div className="mi-top-products-wrap" id="products-wrap" ref={wrapRef}>
          <button
            className="mi-top-products-link"
            id="mi-top-products-link"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <IconCluster logos={config.clusterLogos} />
            {config.libraryLabel}
            <img
              src="/ASSET/Icons/icon-down-arrow.svg"
              alt=""
              className="mi-top-products-caret"
            />
          </button>

          <div
            className={`mi-products-dropdown${menuOpen ? ' is-open' : ''}`}
            id="products-dropdown"
            role="menu"
          >
            <div className="mi-products-dropdown-inner">
              {CATEGORIES.map((slug) => {
                const entry = CATEGORY_CONFIG[slug];
                return (
                  <Link
                    key={slug}
                    href={categoryHref(slug)}
                    className={`mi-products-dropdown-item${slug === config.slug ? ' is-active' : ''}`}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <IconCluster logos={entry.clusterLogos} />
                    <div className="mi-products-dropdown-item-text">
                      <span className="mi-products-dropdown-item-label">
                        {entry.libraryLabel}
                      </span>
                      <span className="mi-products-dropdown-item-sub">
                        {entry.librarySubtitle}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <LibraryProfileMenu onSelectSidebarTab={onSelectSidebarTab} />
      </div>
    </header>
  );
}
