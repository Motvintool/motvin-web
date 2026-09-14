'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthModal } from '@/components/shared/AuthModal';
import { useAuth } from '@/components/shared/AuthProvider';
import { CommunityDropdown } from './CommunityDropdown';
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

type Menu = 'products' | 'community' | null;

export function Navbar() {
  const { open: openAuthModal } = useAuthModal();
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

  const closePanel = useCallback(() => setPanelOpen(false), []);

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
          target.closest('.products-dropdown, .community-dropdown'));
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

  const toggleMenu = (menu: Exclude<Menu, null>) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (isMobile) {
      setOpenAccordion((prev) => (prev === menu ? null : menu));
    } else {
      setOpenMenu((prev) => (prev === menu ? null : menu));
    }
  };

  const productsOpen = openMenu === 'products';
  const communityOpen = openMenu === 'community';
  const productsAccordionOpen = openAccordion === 'products';
  const communityAccordionOpen = openAccordion === 'community';

  const navLinks = (
    <nav className="nav-links">
      <a
        href="#"
        className={`nav-item${productsOpen ? ' active' : ''}${productsAccordionOpen ? ' is-accordion-open' : ''}`}
        id="products-dropdown-trigger"
        onClick={toggleMenu('products')}
      >
        <span style={{ '--item-offset': '13px' } as React.CSSProperties}>Products</span>
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
      <a
        href="#"
        className={`nav-item${communityOpen ? ' active' : ''}${communityAccordionOpen ? ' is-accordion-open' : ''}`}
        id="community-dropdown-trigger"
        onClick={toggleMenu('community')}
      >
        <span style={{ '--item-offset': '13px' } as React.CSSProperties}>Community</span>
        <img
          src="/ASSET/Icons/desktop-arrow.svg"
          alt=""
          className="community-desktop-arrow"
          style={{ width: '18px', height: '18px' }}
        />
        <img
          src="/ASSET/Icons/nav-drop-arrow.svg"
          alt=""
          className="community-mobile-arrow"
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
      <a href="#demo-section" className="nav-item" onClick={closePanel}>
        <span>Features</span>
      </a>
      <div
        className={`mi-nav-community-accordion${communityAccordionOpen ? ' is-open' : ''}`}
        id="mi-nav-community-accordion"
      >
        {isMobile && <CommunityDropdown open={communityAccordionOpen} />}
      </div>
      <a href="/updates/" target="_blank" className="nav-item" onClick={closePanel}>
        <span>Release Notes</span>
      </a>
      <a href="#faq-section" className="nav-item" onClick={closePanel}>
        <span>F&amp;Q</span>
      </a>
    </nav>
  );

  const signinButton = (
    <a
      href="#"
      className="btn-secondary"
      id="auth-signin-btn"
      style={{ display: user ? 'none' : undefined }}
      onClick={(e) => {
        e.preventDefault();
        openAuthModal('login');
      }}
    >
      <span>Sign in</span>
      <img src="/ASSET/Icons/btn-arrow-black.svg" alt="" className="btn-secondary-arrow" />
    </a>
  );

  const signupButton = (
    <a
      href="#"
      className="btn-primary"
      id="auth-signup-btn"
      ref={signupRef}
      style={{ display: user ? 'none' : undefined }}
      onClick={(e) => {
        e.preventDefault();
        openAuthModal('register');
      }}
    >
      <span>Get started for free</span>
      <img src="/ASSET/Icons/btn-arrow.svg" alt="" className="btn-primary-arrow" />
    </a>
  );

  const dashboardButton = (
    <Link
      href="/files"
      className="btn-secondary"
      id="auth-dashboard-btn"
      style={{ display: user ? undefined : 'none' }}
    >
      <span>Go to Dashboard</span>
    </Link>
  );

  const navActions = (
    <div className="nav-actions">
      <div className="nav-extra-links">
        <Link href="/icons" className="nav-item" onClick={closePanel}>
          <span>Icons Library</span>
          <span className="mi-nav-badge">New</span>
        </Link>
        <a href="#" className="nav-item" style={{ display: 'none' }}>
          <img src="/ASSET/Icons/community.svg" alt="Community" />
          <span>Join Community</span>
        </a>
      </div>
      {/* Below the breakpoint these three move out: sign-in to the panel
          footer, sign-up and dashboard to the collapsed navbar's CTA slot. */}
      {!isMobile && signinButton}
      {!isMobile && signupButton}
      {!isMobile && dashboardButton}
    </div>
  );

  return (
    <div className="sticky-header">
      <header className="navbar" ref={navRef}>
        <div className="navbar-container">
          <div className="navbar-left">
            <a href="#" className="logo">
              <img src="/ASSET/Icons/motvin-logo.svg" alt="" className="mi-logo-mark" />
            </a>
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

      <div className={`dropdown-backdrop${openMenu ? ' active' : ''}`} id="dropdown-backdrop" />

      {/* Desktop mega-menus. On mobile the same components render inside the
          nav accordions above. */}
      {!isMobile && <ProductsDropdown open={productsOpen} />}
      {!isMobile && <CommunityDropdown open={communityOpen} />}

      <div
        className={`mi-nav-mobile-panel${panelOpen ? ' is-open' : ''}`}
        id="nav-mobile-panel"
        ref={panelRef}
      >
        <div className="mi-nav-mobile-panel-main">
          <div className="mi-nav-mobile-panel-header">
            <a href="#" className="mi-nav-mobile-panel-logo" aria-label="Motvin home">
              <img src="/ASSET/Icons/motvin-logo.svg" alt="" />
            </a>
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
              <div id="nav-mobile-actions-slot">{isMobile && navActions}</div>
            </div>
          </div>
        </div>
        <div className="mi-nav-mobile-panel-actions">
          {isMobile && signinButton}
          <button
            className="mi-nav-mobile-panel-signup"
            id="nav-mobile-panel-signup"
            type="button"
            onClick={() => signupRef.current?.click()}
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}
