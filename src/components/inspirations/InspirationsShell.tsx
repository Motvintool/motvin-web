'use client';

import { Suspense, type ReactNode } from 'react';
import { FlowPreview } from './FlowPreview';
import { Header } from './Header';
import { LibrarySync } from './LibrarySync';
import { ToastProvider } from './Toast';

function InspirationsHeaderSkeleton() {
  return (
    <header className="ins-header" aria-hidden="true">
      <div className="ins-header-inner">
        <div className="ins-header-content">
          <div className="ins-header-left">
            <span className="ins-brand-logo">
              <img src="/ASSET/svg/nav-motvin-logo.svg" alt="" className="ins-brand-logo-img" width={48} height={48} />
            </span>
            <div className="ins-platform-nav ins-platform-nav--ios">
              <span className="ins-platform-indicator" style={{ transform: 'translateX(6px)', width: 83 }} />
              <span className="ins-platform-link is-active">
                <img src="/ASSET/Icons/Motvin/apple.svg" alt="" className="ins-platform-icon" width={18} height={18} />
                iOS
              </span>
              <span className="ins-platform-link">Android</span>
              <span className="ins-platform-link">Web</span>
            </div>
          </div>
          <div className="ins-header-center" />
          <div className="ins-header-right" />
        </div>
      </div>
    </header>
  );
}

/**
 * Page chrome shared by every /inspirations route: header + main + toasts.
 * The header reads search params, so it sits inside a Suspense boundary
 * (Next 16 requires one during static generation).
 */
export function InspirationsShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <ToastProvider>
      <div className="ins-root">
        <Suspense fallback={<InspirationsHeaderSkeleton />}>
          <Header />
        </Suspense>
        {/* Renders nothing — keeps Save/Collections synced to the signed-in
            account. Reads useAuth(), which needs no Suspense boundary here. */}
        <LibrarySync />
        <main className={`ins-main ${wide ? 'ins-main--wide' : ''}`}>{children}</main>
        {/* Reads ?flow= and renders over whatever page is showing. */}
        <Suspense fallback={null}>
          <FlowPreview />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
