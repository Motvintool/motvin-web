'use client';

/** 404 top strip — brand mark on the left, status pill on the right. */
export function NotFoundHeader() {
  return (
    <header className="header-404">
      <div className="brand-404">
        <div className="logo-icon-404">
          <img src="/ASSET/Icons/motvin-logo.svg" alt="Motvin" />
        </div>
        <span className="brand-text-404">motvin</span>
      </div>
      <div className="status-404">
        <span className="status-dot" />
        <span className="status-text">404 Error. Page not Found</span>
      </div>
    </header>
  );
}
