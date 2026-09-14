'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import type { CategoryConfig } from '@/lib/config/categories';
import { LibraryResults } from './LibraryResults';
import { LibrarySidebar, type SidebarTab } from './LibrarySidebar';
import { ProductBanner } from './ProductBanner';
import { AllModalShells } from './ModalShells';
import { LegacyStubs } from './LegacyStubs';
import { SidebarCollapseToggle } from './SidebarCollapseToggle';
import { Toast, ToastProvider } from './Toast';
import { TooltipRuntime } from './TooltipRuntime';

/**
 * Breakpoint below which the right panel becomes an off-canvas drawer instead
 * of a docked column. Matches legacy motvin-icons.js:1737.
 */
const MOBILE_PANEL_BREAKPOINT = 1300;

function isMobilePanelLayout() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= MOBILE_PANEL_BREAKPOINT;
}

/**
 * The library page — one component serving /icons, /logos and /illustrations.
 *
 * The static site shipped this three times over (icons.html + motvin-icons.js,
 * logos.html + logos.js, illustrations.html + illustrations.js) with the
 * engines sharing 68 of ~70 functions. Everything that genuinely differs comes
 * in through `config`.
 *
 * DOM shape mirrors the original exactly, because the layout CSS depends on it:
 *
 *   section.mi-product-banner
 *   div.mi-app-shell            ← flex row: sidebar | main | panel
 *     aside.mi-left-sidebar
 *     main.mi-main              ┐
 *       header.mi-top-header    │ rendered by LibraryResults, which owns the
 *       …toolbar, grid, pager   │ state both the main column and the panel need
 *     aside.mi-right-panel      │
 *     div.mi-rp-mobile-backdrop ┘
 *   div.mi-mobile-menu-panel
 *
 * `main` and the right panel are siblings, not nested — putting the panel
 * inside `main` collapses the three-column layout.
 */

type Props = {
  config: CategoryConfig;
};

export function LibraryView({ config }: Props) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('filters');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Below the panel's breakpoint the right panel slides over the grid; above
  // it, the panel is a permanent column and this flag is meaningless.
  const [panelOpen, setPanelOpen] = useState(false);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  // body.mi-mobile-panel-open locks page scroll behind the drawer; matches
  // openMobileFilterPanel/closeMobileFilterPanel in icons.html:1748–1760.
  useEffect(() => {
    if (panelOpen) document.body.classList.add('mi-mobile-panel-open');
    else document.body.classList.remove('mi-mobile-panel-open');
    return () => document.body.classList.remove('mi-mobile-panel-open');
  }, [panelOpen]);

  // Escape closes the drawer on mobile — legacy binds this globally
  // (icons.html:1776–1780).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel]);

  // If the viewport grows past the breakpoint while the drawer is open, drop
  // the open flag — the panel becomes a permanent column and the flag would
  // otherwise linger and reopen on next resize down.
  useEffect(() => {
    const onResize = () => {
      if (!isMobilePanelLayout() && panelOpen) closePanel();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [panelOpen, closePanel]);

  return (
    <ToastProvider>
      <>
      <ProductBanner />

      <div
        className="mi-app-shell"
        style={{ '--mi-grid-columns': config.gridColumns } as React.CSSProperties}
      >
        <LibrarySidebar
          active={sidebarTab}
          onSelect={(tab) => {
            setSidebarTab(tab);
            // Only open the drawer on mobile — on desktop the panel is
            // permanent and the flag would just leak drawer styles when
            // resizing back down (matches motvin-icons.js:1763–1769).
            if (isMobilePanelLayout()) setPanelOpen(true);
          }}
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        />

        <Suspense fallback={null}>
          <LibraryResults
            config={config}
            sidebarTab={sidebarTab}
            onSelectTab={setSidebarTab}
            panelOpen={panelOpen}
            onClosePanel={closePanel}
          />
        </Suspense>
      </div>

      <div
        className="mi-mobile-menu-panel"
        id="mobile-menu-panel"
        style={{ display: mobileMenuOpen ? undefined : 'none' }}
      >
        <div className="mi-mobile-menu-nav" id="mobile-menu-nav-slot" />
        <div className="mi-mobile-menu-divider" />
        <div className="mi-mobile-menu-sidebar" id="mobile-menu-sidebar-slot" />
      </div>

      <AllModalShells />
      <Toast />
      <LegacyStubs />
      <SidebarCollapseToggle />
      <TooltipRuntime />
    </>
    </ToastProvider>
  );
}
