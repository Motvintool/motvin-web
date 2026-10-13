'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { CommunityDropdown } from './CommunityDropdown';
import { CompanyDropdown } from './CompanyDropdown';
import { ProductsDropdown } from './ProductsDropdown';

/**
 * Sticky header — port of the navbar in motvin-ui/index.html plus the nav half
 * of JS/index.js.
 *
 * Deviation from the original, deliberate: the static site physically moved
 * `.nav-links`, `.nav-actions`, the auth buttons and both dropdowns into the
 * hamburger panel with appendChild() below 1300px, then moved them back on
 * resize. React owns the DOM, so instead the same subtrees are rendered into
 * whichever parent the current layout calls for. The resulting DOM in each
 * layout is identical to the original's, so the existing CSS applies unchanged.
 */

const NAV_MOBILE_BREAKPOINT = 1300;
// Past this scroll depth (desktop) the pill tucks away for the compact buttons.
const COMPACT_AFTER = 160;
// Once reopened from the compact menu button, the pill stays until the page
// has scrolled this much further down.
const REOPEN_SCROLL_SLACK = 120;
// How far the page has to move before it counts as scrolling up or down.
const SCROLL_DIRECTION_THRESHOLD = 6;
// Vertical middle of the compact buttons (desktop), for telling when the
// dark footer has slid under them.
const COMPACT_MIDDLE = 59;
// The menus open on hover (desktop, mouse); this grace period lets the
// pointer travel from a label down into its menu without it closing.
const HOVER_CLOSE_DELAY = 180;
const INSTAGRAM_URL = 'https://www.instagram.com/siren.uix';

type Menu = 'products' | 'community' | 'company' | null;

// Each desktop menu panel, by id. They render outside the nav, so they get
// their own hover listeners.
const MENU_PANELS: [id: string, menu: Exclude<Menu, null>][] = [
  ['products-dropdown', 'products'],
  ['company-dropdown', 'company'],
  ['community-dropdown', 'community'],
];

/** Which menu a trigger opens, from its data-menu attribute. */
const menuOf = (el: EventTarget | null) =>
  (el instanceof HTMLElement ? el.dataset.menu : undefined) as Exclude<Menu, null> | undefined;

export function Navbar() {
  const { user } = useAuth();
  // Desktop mega-menu (>1300px) — only one open at a time.
  const [openMenu, setOpenMenu] = useState<Menu>(null);
  // Accordion inside the hamburger panel (<=1300px) — same triggers, different affordance.
  const [openAccordion, setOpenAccordion] = useState<Menu>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Starts false so the server render matches the original's initial desktop
  // markup; the effect below corrects it before paint on narrow viewports.
  const [isMobile, setIsMobile] = useState(false);

  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const signupRef = useRef<HTMLAnchorElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  // Desktop only: scrolling down past the hero swaps the full pill for the
  // compact buttons; scrolling up anywhere brings the full pill straight
  // back. The round menu button also brings it back, until the next scroll
  // down of some length.
  const [scrolled, setScrolled] = useState(false);
  // True while the dark footer is behind the compact buttons, so they can
  // switch to their light version and stay visible.
  const [overDark, setOverDark] = useState(false);
  const [pillReopened, setPillReopened] = useState(false);
  const reopenedAtRef = useRef(0);
  const lastYRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastYRef.current;
        if (y <= COMPACT_AFTER) {
          setScrolled(false);
          lastYRef.current = y;
        } else if (Math.abs(dy) > SCROLL_DIRECTION_THRESHOLD) {
          // Small jitters don't count as a change of direction.
          setScrolled(dy > 0);
          lastYRef.current = y;
        }
        if (y - reopenedAtRef.current > REOPEN_SCROLL_SLACK) setPillReopened(false);
        // With the curtain footer, the footer always sits behind the page; it
        // only shows once the white sheet's bottom edge has passed above.
        const footer = document.querySelector('.lpi-footer');
        const sheet = document.querySelector('.landing-sheet');
        const footerEdge = footer
          ? footer.classList.contains('is-reveal') && sheet
            ? sheet.getBoundingClientRect().bottom
            : footer.getBoundingClientRect().top
          : Infinity;
        setOverDark(footerEdge < COMPACT_MIDDLE);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const reopenPill = () => {
    reopenedAtRef.current = window.scrollY;
    setPillReopened(true);
  };

  useEffect(() => {
    const sync = () => {
      const mobile = window.innerWidth <= NAV_MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setPanelOpen(false);
        setOpenAccordion(null);
      } else {
        setOpenMenu(null);
      }
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // Body class drives the scroll lock while the hamburger panel is open.
  useEffect(() => {
    document.body.classList.toggle('mi-nav-mobile-open', panelOpen);
    return () => document.body.classList.remove('mi-nav-mobile-open');
  }, [panelOpen]);

  // Outside click closes the open mega-menu and the hamburger panel; Escape
  // closes the panel.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The mega-menus render as siblings of <header>, not inside it, so a
      // ref on the header alone would treat clicks inside an open menu as
      // "outside" and close it. Match the panels by selector instead of
      // wrapping them, which would disturb their absolute positioning.
      const insideNav =
        navRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest('.products-dropdown, .community-dropdown, .company-dropdown'));
      if (!insideNav) {
        setOpenMenu(null);
      }
      if (
        panelOpen &&
        !panelRef.current?.contains(target) &&
        !hamburgerRef.current?.contains(target)
      ) {
        setPanelOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanelOpen(false);
        setOpenMenu(null);
      }
    };
    document.addEventListener('click', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [panelOpen]);

  // On desktop the menus open on hover: entering a label (or its menu)
  // opens it, moving to another label swaps straight over, and leaving
  // closes it after a short grace period. A click only opens, so a click
  // right after hovering doesn't shut it. On mobile they're accordions.
  const openOnHover = (menu: Exclude<Menu, null>) => {
    clearTimeout(hoverTimer.current);
    setOpenMenu(menu);
  };
  const closeAfterHover = (menu: Exclude<Menu, null>) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpenMenu((open) => (open === menu ? null : open)), HOVER_CLOSE_DELAY);
  };

  const onMenuClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const menu = menuOf(e.currentTarget);
    if (!menu) return;
    if (isMobile) setOpenAccordion((prev) => (prev === menu ? null : menu));
    else openOnHover(menu);
  };
  const onMenuEnter = (e: React.PointerEvent<HTMLElement>) => {
    const menu = menuOf(e.currentTarget);
    if (!isMobile && e.pointerType === 'mouse' && menu) openOnHover(menu);
  };
  const onMenuLeave = (e: React.PointerEvent<HTMLElement>) => {
    const menu = menuOf(e.currentTarget);
    if (!isMobile && e.pointerType === 'mouse' && menu) closeAfterHover(menu);
  };

  // The menu panels render outside the nav, so they get their own listeners:
  // staying over an open menu keeps it open, leaving it closes it.
  useEffect(() => {
    if (isMobile) return;
    const cleanups = MENU_PANELS.map(([id, menu]) => {
      const panel = document.getElementById(id);
      if (!panel) return () => {};
      const onEnter = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') openOnHover(menu);
      };
      const onLeave = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') closeAfterHover(menu);
      };
      panel.addEventListener('pointerenter', onEnter);
      panel.addEventListener('pointerleave', onLeave);
      return () => {
        panel.removeEventListener('pointerenter', onEnter);
        panel.removeEventListener('pointerleave', onLeave);
      };
    });
    return () => {
      clearTimeout(hoverTimer.current);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [isMobile]);

  // Never collapse while a mega-menu is open.
  const collapsed = !isMobile && scrolled && !pillReopened && !openMenu;

  const productsOpen = openMenu === 'products';
  const communityOpen = openMenu === 'community';
  const productsAccordionOpen = openAccordion === 'products';
  const communityAccordionOpen = openAccordion === 'community';
  const companyOpen = openMenu === 'company';
  const companyAccordionOpen = openAccordion === 'company';
  // Picking a Resources link closes the menu, and the hamburger panel on mobile.
  const closeMenus = () => {
    setOpenMenu(null);
    setOpenAccordion(null);
    setPanelOpen(false);
  };

  const navLinks = (
    <nav className="nav-links">
      <a
        href="#"
        className={`nav-item${productsOpen ? ' active' : ''}${productsAccordionOpen ? ' is-accordion-open' : ''}`}
        id="products-dropdown-trigger"
        data-menu="products"
        onClick={onMenuClick}
        onPointerEnter={onMenuEnter}
        onPointerLeave={onMenuLeave}
      >
        <span style={{ '--item-offset': '13px' } as React.CSSProperties}>Explore tools</span>
        <img
          src="/ASSET/Icons/desktop-arrow.svg"
          alt=""
          className="products-desktop-arrow"
          style={{ width: '18px', height: '18px' }}
        />
        <img
          src="/ASSET/Icons/nav-drop-arrow.svg"
          alt=""
          className="products-mobile-arrow"
          style={{ width: '14px', height: '14px', opacity: '0.5' }}
        />
      </a>
      {/* On mobile the dropdowns render inside these accordions instead of as
          fixed-position mega-menus. */}
      <div
        className={`mi-nav-products-accordion${productsAccordionOpen ? ' is-open' : ''}`}
        id="mi-nav-products-accordion"
      >
        {isMobile && <ProductsDropdown open={productsAccordionOpen} />}
      </div>
      <div
        className={`mi-nav-community-accordion${communityAccordionOpen ? ' is-open' : ''}`}
        id="mi-nav-community-accordion"
      >
        {isMobile && <CommunityDropdown open={communityAccordionOpen} />}
      </div>
      {/* Resources: Updates, About us, Request apps and Copyrights. */}
      <a
        href="#"
        className={`nav-item${companyOpen ? ' active' : ''}${companyAccordionOpen ? ' is-accordion-open' : ''}`}
        id="company-dropdown-trigger"
        data-menu="company"
        onClick={onMenuClick}
        onPointerEnter={onMenuEnter}
        onPointerLeave={onMenuLeave}
      >
        <span style={{ '--item-offset': '13px' } as React.CSSProperties}>Resources</span>
        <img
          src="/ASSET/Icons/desktop-arrow.svg"
          alt=""
          className="company-desktop-arrow"
          style={{ width: '18px', height: '18px' }}
        />
        <img
          src="/ASSET/Icons/nav-drop-arrow.svg"
          alt=""
          className="company-mobile-arrow"
          style={{ width: '14px', height: '14px', opacity: '0.5' }}
        />
      </a>
      <a
        href="#"
        className={`nav-item${communityOpen ? ' active' : ''}${communityAccordionOpen ? ' is-accordion-open' : ''}`}
        id="community-dropdown-trigger"
        data-menu="community"
        onClick={onMenuClick}
        onPointerEnter={onMenuEnter}
        onPointerLeave={onMenuLeave}
      >
        <span style={{ '--item-offset': '13px' } as React.CSSProperties}>Join us</span>
        <img
          src="/ASSET/Icons/nav-drop-arrow.svg"
          alt=""
          className="community-mobile-arrow"
          style={{ width: '14px', height: '14px', opacity: '0.5' }}
        />
      </a>
      <div
        className={`mi-nav-company-accordion${companyAccordionOpen ? ' is-open' : ''}`}
        id="mi-nav-company-accordion"
      >
        {isMobile && <CompanyDropdown open={companyAccordionOpen} onNavigate={closeMenus} />}
      </div>
    </nav>
  );

  const signinButton = (
    <Link
      href="/login"
      className="btn-secondary"
      id="auth-signin-btn"
      style={{ display: user ? 'none' : undefined }}
    >
      <span>Sign in</span>
      <img src="/ASSET/Icons/btn-arrow-black.svg" alt="" className="btn-secondary-arrow" />
    </Link>
  );

  const signupButton = (
    <Link
      href="/signup"
      className="btn-primary"
      id="auth-signup-btn"
      ref={signupRef}
      style={{ display: user ? 'none' : undefined }}
    >
      <span>Get started for free</span>
      <img src="/ASSET/Icons/btn-arrow.svg" alt="" className="btn-primary-arrow" />
    </Link>
  );

  const dashboardButton = (
    <Link
      href="/inspirations"
      className="btn-secondary"
      id="auth-dashboard-btn"
      style={{ display: user ? undefined : 'none' }}
    >
      <span>Go to Library</span>
    </Link>
  );

  const navSocial = (
    <div className="nav-social">
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="nav-social-link" aria-label="Motvin on Instagram">
        <img src="/ASSET/landing/nav-instagram-filled.svg" alt="" width={20} height={20} />
      </a>
      {/* No X profile yet: not a link, just a "Coming soon" tip on hover. */}
      <span className="nav-social-link is-soon" tabIndex={0} aria-label="Motvin on X, coming soon">
        <img src="/ASSET/landing/nav-x.svg" alt="" width={20} height={20} />
        <span className="nav-social-tip" aria-hidden="true">
          Coming soon
        </span>
      </span>
    </div>
  );

  const navActions = (
    <div className="nav-actions">
      {navSocial}
      {user ? (
        <Link href="/inspirations" className="nav-login" onClick={closePanel}>
          Go to Library
        </Link>
      ) : (
        <Link href="/login" className="nav-login" onClick={closePanel}>
          Log in
        </Link>
      )}
    </div>
  );

  return (
    <div className="sticky-header">
      <header className="navbar" ref={navRef}>
        <div className={`navbar-container${collapsed ? ' is-collapsed' : ''}`} inert={collapsed || undefined}>
          <div className="navbar-left">
            <Link href="/" className="logo" aria-label="Motvin home">
              <img src="/ASSET/Icons/motvin-logo.svg" alt="" className="mi-logo-mark" />
            </Link>
            {!isMobile && navLinks}
          </div>
          {!isMobile && navActions}

          <div className="mi-nav-mobile-cta-slot" id="nav-mobile-cta-slot">
            {isMobile && signupButton}
            {isMobile && dashboardButton}
          </div>
          {/* Mobile-only hamburger: opens a dropdown holding the relocated nav */}
          <button
            className={`mi-nav-hamburger${panelOpen ? ' is-open' : ''}`}
            id="nav-hamburger-toggle"
            aria-label="Menu"
            aria-expanded={panelOpen}
            aria-controls="nav-mobile-panel"
            ref={hamburgerRef}
            onClick={(e) => {
              e.stopPropagation();
              setPanelOpen((open) => !open);
            }}
          >
            <img src="/ASSET/Icons/nav-open.svg" alt="" className="mi-nav-hamburger-icon-open" />
            <img src="/ASSET/Icons/nav-close.svg" alt="" className="mi-nav-hamburger-icon-close" />
          </button>
        </div>
      </header>

      {/* Desktop, once scrolled: the pill gives way to these. */}
      {!isMobile && (
        <div
          className={`nav-compact${collapsed ? ' is-visible' : ''}${overDark ? ' is-over-dark' : ''}`}
          inert={!collapsed || undefined}
        >
          {user ? (
            <Link href="/inspirations" className="nav-compact-btn is-dark">
              Go to Library
            </Link>
          ) : (
            <>
              <Link href="/login" className="nav-compact-btn">
                Log in
              </Link>
              <Link href="/signup" className="nav-compact-btn is-dark">
                Get started
              </Link>
            </>
          )}
          <button
            type="button"
            className="nav-compact-menu"
            aria-label="Show menu"
           
            onClick={reopenPill}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 8h14" />
              <path d="M5 16h14" />
            </svg>
          </button>
        </div>
      )}

      <div className={`dropdown-backdrop${openMenu ? ' active' : ''}`} id="dropdown-backdrop" />

      {/* Desktop mega-menus. On mobile the same components render inside the
          nav accordions above. */}
      {!isMobile && <ProductsDropdown open={productsOpen} />}
      {!isMobile && <CommunityDropdown open={communityOpen} />}
      {!isMobile && <CompanyDropdown open={companyOpen} onNavigate={closeMenus} />}

      <div
        className={`mi-nav-mobile-panel${panelOpen ? ' is-open' : ''}`}
        id="nav-mobile-panel"
        ref={panelRef}
      >
        <div className="mi-nav-mobile-panel-main">
          <div className="mi-nav-mobile-panel-header">
            <Link href="/" className="mi-nav-mobile-panel-logo" aria-label="Motvin home" onClick={closePanel}>
              <img src="/ASSET/Icons/motvin-logo.svg" alt="" />
            </Link>
            <button
              className="mi-nav-mobile-panel-close"
              id="nav-mobile-panel-close"
              aria-label="Close menu"
              onClick={closePanel}
            >
              <img src="/ASSET/Icons/nav-close.svg" alt="" />
            </button>
          </div>
          <div className="mi-nav-mobile-panel-content">
            <div className="mi-nav-mobile-panel-list">
              <div id="nav-mobile-links-slot">{isMobile && navLinks}</div>
              <div id="nav-mobile-actions-slot">{isMobile && navSocial}</div>
            </div>
          </div>
        </div>
        <div className="mi-nav-mobile-panel-actions">
          {isMobile && signinButton}
          {user ? (
            <Link
              href="/inspirations"
              className="mi-nav-mobile-panel-signup mi-nav-mobile-panel-library"
              onClick={closePanel}
            >
              Go to Library
            </Link>
          ) : (
            <button
              className="mi-nav-mobile-panel-signup"
              id="nav-mobile-panel-signup"
              type="button"
              onClick={() => signupRef.current?.click()}
            >
              Get started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
