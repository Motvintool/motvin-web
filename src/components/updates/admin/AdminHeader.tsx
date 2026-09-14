'use client';

import { forwardRef } from 'react';

/**
 * Publisher-page header. Ref is forwarded so the parent can scroll the
 * header into view when editing an existing note.
 */
export const AdminHeader = forwardRef<HTMLElement>(function AdminHeader(_props, ref) {
  return (
    <header className="header header-left" ref={ref}>
      <div className="container container-wide">
        <p className="eyebrow">Updates Feed</p>
        <h1>Publish release notes</h1>
        <p>Write and publish Motvin product updates into the shared Firebase feed.</p>
      </div>
    </header>
  );
});
