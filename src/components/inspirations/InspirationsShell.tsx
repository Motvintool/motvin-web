'use client';

import { Suspense, type ReactNode } from 'react';
import { FlowPreview } from './FlowPreview';
import { Header } from './Header';
import { ToastProvider } from './Toast';

/**
 * Page chrome shared by every /inspirations route: header + main + toasts.
 * The header reads search params, so it sits inside a Suspense boundary
 * (Next 16 requires one during static generation).
 */
export function InspirationsShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <ToastProvider>
      <div className="ins-root">
        <Suspense fallback={<div className="ins-header ins-header--placeholder" aria-hidden />}>
          <Header />
        </Suspense>
        <main className={`ins-main ${wide ? 'ins-main--wide' : ''}`}>{children}</main>
        {/* Reads ?flow= and renders over whatever page is showing. */}
        <Suspense fallback={null}>
          <FlowPreview />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
