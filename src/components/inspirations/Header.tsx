'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { PLATFORMS } from '@/lib/inspirations/types';
import { GlobalSearch } from './GlobalSearch';
import { CloseIcon } from './Icons';
import { ProfileMenu } from './ProfileMenu';
import { AudioMenu } from './AudioMenu';

const PLATFORM_ICON: Record<(typeof PLATFORMS)[number], string> = {
  ios: '/ASSET/Icons/Motvin/apple.svg',
  android: '/ASSET/Icons/Motvin/android.svg',
  web: '/ASSET/Icons/Motvin/web.svg',
};

/**
 * Compact sticky header: wordmark · Web / iOS / Android · search · Save ·
 * Collections · profile · menu. On mobile it collapses to wordmark and the
 * menu; the platform nav, search and text links move into the drawer.
 */
export function Header() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);

  const activePlatforms = (params.get('platform') ?? '').split(',').filter(Boolean);
  // iOS highlighted with no param is the truth, not a visual default: every
  // feed applies DEFAULT_PLATFORM (iOS) when the URL names no platform, so
  // this nav, the toolbar's Platform pill and the docked Apps/Web switcher
  // always describe the same single-platform view.
  const visuallyActivePlatform =
    activePlatforms.length === 1 ? activePlatforms[0] : activePlatforms.length === 0 ? 'ios' : null;

  // Close the drawer whenever the route changes. Adjusting state during
  // render (rather than in an effect) avoids an extra paint with the menu
  // still open.
  const routeKey = `${pathname}?${params.toString()}`;
  const [seenRoute, setSeenRoute] = useState(routeKey);
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey);
    setMenuOpen(false);
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

  // Switching platform keeps the visitor where they are: same browse page,
  // same filters, only the platform param changes. From a detail page (a
  // screen, app or flow) there is no "same view on another platform" to keep,
  // so those fall back to Explore.
  const BROWSE_PATHS: string[] = [
    INSPIRATIONS_ROUTES.explore,
    INSPIRATIONS_ROUTES.apps,
    INSPIRATIONS_ROUTES.screens,
    INSPIRATIONS_ROUTES.uiElements,
    INSPIRATIONS_ROUTES.flows,
    INSPIRATIONS_ROUTES.patterns,
    INSPIRATIONS_ROUTES.search,
  ];
  const platformHref = (p: string) => {
    const staying = BROWSE_PATHS.includes(pathname);
    const base = staying ? pathname : INSPIRATIONS_ROUTES.explore;
    const sp = staying ? new URLSearchParams(params.toString()) : new URLSearchParams();
    const on = activePlatforms.length === 1 && activePlatforms[0] === p;
    if (on) sp.delete('platform');
    else sp.set('platform', p);
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };

  // The black pill is a single element that slides and resizes between
  // platforms, rather than each link toggling its own background — that's
  // what makes the switch read as one shape moving instead of a colour swap.
  const platformLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = visuallyActivePlatform ? platformLinkRefs.current[visuallyActivePlatform] : null;
      setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [visuallyActivePlatform]);

  return (
    <header className="ins-header">
      <div className="ins-header-inner">
        <div className="ins-header-content">
        <div className="ins-header-left">
          <Link href={INSPIRATIONS_ROUTES.explore} className="ins-brand-logo" aria-label="Motvin Inspirations home">
            <img src="/ASSET/svg/nav-motvin-logo.svg" alt="" className="ins-brand-logo-img" width={48} height={48} />
          </Link>
          <nav className={`ins-platform-nav ${visuallyActivePlatform ? `ins-platform-nav--${visuallyActivePlatform}` : ''}`} aria-label="Platform">
            {indicator && (
              <span
                className="ins-platform-indicator"
                style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
                aria-hidden="true"
              />
            )}
            {PLATFORMS.map((p) => {
              const visuallyOn = p === visuallyActivePlatform;
              return (
                <Link
                  key={p}
                  ref={(node) => {
                    platformLinkRefs.current[p] = node;
                  }}
                  href={platformHref(p)}
                  className={`ins-platform-link ${visuallyOn ? 'is-active' : ''}`}
                  aria-current={visuallyOn ? 'true' : undefined}
                >
                  {visuallyOn && <img src={PLATFORM_ICON[p]} alt="" className="ins-platform-icon" width={18} height={18} />}
                  {PLATFORM_LABEL[p]}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="ins-header-center">
          <GlobalSearch />
          <AudioMenu />
        </div>

        <div className="ins-header-right">
          <div className="ins-header-action-links">
            <Link
              href={INSPIRATIONS_ROUTES.collections}
              className="ins-header-action-link"
              aria-label="Collections"
              aria-current={pathname === INSPIRATIONS_ROUTES.collections ? 'page' : undefined}
            >
              <img src="/ASSET/Icons/Motvin/save.svg" alt="" width={20} height={20} />
            </Link>
            {/* Same-origin but deliberately a new tab, so leaving to read
                release notes never loses whatever the visitor was browsing. */}
            <a href="/updates/" className="ins-header-action-link" aria-label="Release notes" target="_blank" rel="noopener noreferrer">
              <img src="/ASSET/Icons/Motvin/collection.svg" alt="" width={20} height={20} />
            </a>
          </div>
          <div className="ins-header-profile">
            <ProfileMenu />
            <button type="button" className="ins-iconbtn ins-iconbtn--plain ins-header-menu" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <img src="/ASSET/Icons/Motvin/hamburger-menu.svg" alt="" className="ins-header-menu-icon" width={18} height={15} />
            </button>
          </div>
        </div>
        </div>
      </div>

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
              <Link href={INSPIRATIONS_ROUTES.collections} className="ins-drawer-link">Collections</Link>
              <p className="ins-drawer-label">Motvin</p>
              <a href="/icons" className="ins-drawer-link">Icon library</a>
              <a href="/updates/" className="ins-drawer-link" target="_blank" rel="noopener noreferrer">Release notes</a>
              <Link href="/" className="ins-drawer-link">Home</Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
