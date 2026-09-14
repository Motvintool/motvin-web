'use client';

import Link from 'next/link';

/** Top-left Motvin wordmark that also links back to the homepage. */
export function AuthPageLogo() {
  return (
    <Link href="/" className="auth-page-logo">
      <div className="auth-page-logo-icon">
        <img
          src="/ASSET/svg/Motvin/login/login-signup-motvin-logo.svg"
          alt="Motvin"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <p className="auth-page-logo-text">motvin</p>
    </Link>
  );
}
