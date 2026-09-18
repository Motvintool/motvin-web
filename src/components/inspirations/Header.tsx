'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { PLATFORMS } from '@/lib/inspirations/types';
import { GlobalSearch } from './GlobalSearch';
import { BookmarkIcon, CloseIcon, FolderIcon, MenuIcon, SearchIcon } from './Icons';
import { ProfileMenu } from './ProfileMenu';

/**
 * Compact sticky header: wordmark · Web / iOS / Android · search · Saved ·
 * Collections · profile · menu. On mobile it collapses to wordmark, a search
 * toggle and the menu; the search field drops in below the bar.
 */
export function Header() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const activePlatforms = (params.get('platform') ?? '').split(',').filter(Boolean);

  // Close the drawer and mobile search whenever the route changes. Adjusting
  // state during render (rather than in an effect) avoids an extra paint with
  // the menu still open.
  const routeKey = `${pathname}?${params.toString()}`;
  const [seenRoute, setSeenRoute] = useState(routeKey);
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey);
    setMenuOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const platformHref = (p: string) => {
    const on = activePlatforms.length === 1 && activePlatforms[0] === p;
    return on ? INSPIRATIONS_ROUTES.explore : `${INSPIRATIONS_ROUTES.explore}?platform=${p}`;
  };

  return (
    <header className="ins-header">
      <div className="ins-header-inner">
        <div className="ins-header-left">
          <Link href={INSPIRATIONS_ROUTES.explore} className="ins-brand-logo" aria-label="Motvin Inspirations home">
            <img src="/ASSET/svg/nav-motvin-logo.svg" alt="" className="ins-brand-logo-img" width={40} height={40} />
          </Link>
          <nav className="ins-platform-nav" aria-label="Platform">
            {PLATFORMS.map((p) => {
              const on = activePlatforms.length === 1 && activePlatforms[0] === p;
              return (
                <Link key={p} href={platformHref(p)} className={`ins-platform-link ${on ? 'is-active' : ''}`} aria-current={on ? 'true' : undefined}>
                  {PLATFORM_LABEL[p]}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="ins-header-center">
          <GlobalSearch />
        </div>

        <div className="ins-header-right">
          <Link href={INSPIRATIONS_ROUTES.saved} className={`ins-header-link ${pathname === INSPIRATIONS_ROUTES.saved ? 'is-active' : ''}`}>
            <BookmarkIcon size={15} />
            <span>Saved</span>
          </Link>
          <Link href={INSPIRATIONS_ROUTES.collections} className={`ins-header-link ${pathname === INSPIRATIONS_ROUTES.collections ? 'is-active' : ''}`}>
            <FolderIcon size={15} />
            <span>Collections</span>
          </Link>
          <button type="button" className="ins-iconbtn ins-iconbtn--plain ins-header-searchtoggle" aria-label={searchOpen ? 'Hide search' : 'Search'} aria-expanded={searchOpen} onClick={() => setSearchOpen((o) => !o)}>
            {searchOpen ? <CloseIcon size={18} /> : <SearchIcon size={18} />}
          </button>
          <ProfileMenu />
          <button type="button" className="ins-iconbtn ins-iconbtn--plain ins-header-menu" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <MenuIcon size={18} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="ins-header-mobile-search">
          <GlobalSearch autoFocus />
        </div>
      )}

      {menuOpen && (
        <div className="ins-drawer" role="dialog" aria-label="Menu">
          <div className="ins-drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="ins-drawer-panel">
            <div className="ins-drawer-head">
              <span className="ins-drawer-title">Menu</span>
              <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <CloseIcon size={18} />
              </button>
            </div>
            <nav className="ins-drawer-nav">
              <p className="ins-drawer-label">Platform</p>
              {PLATFORMS.map((p) => (
                <Link key={p} href={platformHref(p)} className="ins-drawer-link">{PLATFORM_LABEL[p]}</Link>
              ))}
              <p className="ins-drawer-label">Browse</p>
              <Link href={INSPIRATIONS_ROUTES.explore} className="ins-drawer-link">Explore</Link>
              <Link href={INSPIRATIONS_ROUTES.apps} className="ins-drawer-link">Apps</Link>
              <Link href={INSPIRATIONS_ROUTES.screens} className="ins-drawer-link">Screens</Link>
              <Link href={INSPIRATIONS_ROUTES.uiElements} className="ins-drawer-link">UI Elements</Link>
              <Link href={INSPIRATIONS_ROUTES.flows} className="ins-drawer-link">Flows</Link>
              <Link href={INSPIRATIONS_ROUTES.patterns} className="ins-drawer-link">Patterns</Link>
              <p className="ins-drawer-label">Library</p>
              <Link href={INSPIRATIONS_ROUTES.saved} className="ins-drawer-link">Saved</Link>
              <Link href={INSPIRATIONS_ROUTES.collections} className="ins-drawer-link">Collections</Link>
              <p className="ins-drawer-label">Motvin</p>
              <a href="/icons" className="ins-drawer-link">Icon library</a>
              <Link href="/" className="ins-drawer-link">Home</Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
