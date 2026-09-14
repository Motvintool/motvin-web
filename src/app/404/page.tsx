'use client';

import { NotFoundChrome } from '@/components/404/NotFoundChrome';
import { NotFoundFooter } from '@/components/404/NotFoundFooter';
import { NotFoundGraphics } from '@/components/404/NotFoundGraphics';
import { NotFoundHeader } from '@/components/404/NotFoundHeader';
import { NotFoundHero } from '@/components/404/NotFoundHero';
import '@/styles/not-found.css';

/**
 * App-level 404 — port of motvin-ui/404.html.
 *
 * Composition-only shell: every section lives in `src/components/not-found/`.
 * Wrapper div + <main> preserve the DOM shape so `not-found.css` keeps working
 * unchanged. Every unknown route (and `notFound()` calls) lands here via
 * `src/app/not-found.tsx`.
 */
export default function NotFound() {
  return (
    <>
      <NotFoundChrome />
      <div className="page-404-wrapper">
        <main className="container-404">
          <div className="content-404">
            <NotFoundHeader />
            <NotFoundHero />
          </div>
          <NotFoundGraphics />
        </main>
        <NotFoundFooter />
      </div>
    </>
  );
}
