'use client';

import { Suspense, type ReactNode } from 'react';
import { FlowPreview } from './FlowPreview';
import { GuestRequestsNotice } from './GuestRequestsNotice';
import { ConfirmHost } from './ConfirmDialog';
import { GuestDownloadNotice } from './GuestDownloadNotice';
import { GuestImageGuard } from './GuestImageGuard';
import { Header } from './Header';
import { ScreenPreviewOverlay } from './ScreenPreviewModal';
import { ToastProvider } from './Toast';
import { MoeiCompanion } from './moeis/MoeiCompanion';
import { MoeiStudioHost } from './moeis/MoeiStudio';
import { AdminDrawerOverlay } from './admin/AdminDrawer';
import { AdminChatbot } from './admin/AdminChatbot';
import { UserChatbot } from './UserChatbot';
import { LongPressScreenMenus } from './useScreenContextMenu';
import { RevealPressedPills } from './RevealPressedPills';

function InspirationsHeaderSkeleton() {
  return (
    <header className="ins-header" aria-hidden="true">
      <div className="ins-header-inner">
        <div className="ins-header-content">
          <div className="ins-header-left">
            <span className="ins-brand-logo">
              <img src="/ASSET/svg/nav-motvin-logo.svg" alt="" className="ins-brand-logo-img" width={48} height={48} />
            </span>
            <div className="ins-apptabs">
              <span className="ins-apptab is-active">Apps</span>
              <span className="ins-apptab">Webs</span>
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
        {/* After a guest signs in: says their requests moved (or some didn't fit). Renders nothing. */}
        <GuestRequestsNotice />
        {/* Tells a guest downloads need an account (see useDownloadGate). */}
        <GuestDownloadNotice />
        {/* The Motvin-style "are you sure" box (askConfirm). Renders nothing until asked. */}
        <ConfirmHost />
        <LongPressScreenMenus />
        <RevealPressedPills />
        {/* Motvin Moeis: the moei studio (opened from "My moei") and the moei itself, when it's out. */}
        <MoeiStudioHost />
        <MoeiCompanion />
        {/* For a guest, also stops the browser's own save / copy / drag of a
            screenshot or logo (see GuestImageGuard). Renders nothing. */}
        <GuestImageGuard />
        <main className={`ins-main ${wide ? 'ins-main--wide' : ''}`}>{children}</main>
        {/* Reads ?flow= and renders over whatever page is showing. */}
        <Suspense fallback={null}>
          <FlowPreview />
        </Suspense>
        {/* Reads ?screen= and renders over whatever page is showing. */}
        <Suspense fallback={null}>
          <ScreenPreviewOverlay />
        </Suspense>
        {/* Reads ?admin= and renders the library admin as a drawer over
            whatever page is showing — see ProfileMenu's "Admin" item. */}
        <Suspense fallback={null}>
          <AdminDrawerOverlay />
        </Suspense>
        {/* The library owner's running video ingest, on whichever page they
            are on. Renders nothing for everyone else. */}
        <AdminChatbot />
        {/* The visitor's guide: navigation only, shown to everyone — beside the
            admin dock for the owner. */}
        <UserChatbot />
      </div>
    </ToastProvider>
  );
}
