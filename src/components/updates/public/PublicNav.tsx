'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { usePublicAdminAccess } from './usePublicAdminAccess';

/**
 * Top nav for /updates. Self-contained: reads auth state and swaps the login
 * link into "Admin" / "Logout" the way motvin-ui/updates/script.110f497c05.js
 * did — but instead of opening the Google popup inline it hands the visitor
 * off to the standalone /login page.
 *
 * Click behaviour:
 *   - Not signed in → navigate to /login?next=/updates so ANYONE who signs in
 *     comes back to the public feed. Admins then see the "Admin" link swap in
 *     and can click through; non-admins never land on the publisher.
 *   - Signed in as admin → jump to /updates/admin.
 *   - Signed in as non-admin → sign out in place.
 */

const ADMIN_PATH = '/updates/admin';
// After sign-in, return to the public feed. Admins will see the "Admin" link
// swap in on the nav and can click through; non-admins just get the feed and
// never land on the publisher.
const LOGIN_PATH = `/login?next=${encodeURIComponent('/updates')}`;

export function PublicNav() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { signedIn, canAccessAdmin } = usePublicAdminAccess();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const mq = window.matchMedia('(max-width: 680px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onChange);
    return () => {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onChange);
    };
  }, [open]);

  const loginLabel = !signedIn ? 'Log in' : canAccessAdmin ? 'Admin' : 'Logout';
  const loginHref = !signedIn ? LOGIN_PATH : canAccessAdmin ? ADMIN_PATH : '#';

  const onLoginClick = useCallback(
    async (e: MouseEvent<HTMLAnchorElement>) => {
      if (busy) return;
      // Not signed in → let the anchor navigate to /login normally.
      if (!signedIn) return;

      e.preventDefault();
      if (canAccessAdmin) {
        router.push(ADMIN_PATH);
        return;
      }
      setBusy(true);
      try {
        await signOut();
      } catch (err) {
        console.error('Sign-out failed:', err);
      } finally {
        setBusy(false);
      }
    },
    [busy, signedIn, canAccessAdmin, signOut, router],
  );

  return (
    <nav
      className="nav"
      // Turbopack's CSS pipeline strips `backdrop-filter` from .nav on the
      // updates page, so inline it here — same workaround the library
      // toolbar uses. Keeps the glass effect the reference had.
      style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
    >
      <div className="nav-inner updates-shell">
        <Link
          href="/"
          className="update-logo"
          style={{ display: 'flex', alignItems: 'center', gap: '8.68px', textDecoration: 'none' }}
        >
          <div className="update-logo-icon" style={{ width: 44, height: 44 }}>
            <img
              src="/ASSET/svg/Motvin/login/login-signup-motvin-logo.svg"
              alt="Motvin"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <p
            className="update-logo-text"
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 500,
              fontSize: '25.9px',
              color: '#0b0b0b',
              margin: 0,
              letterSpacing: '-0.52px',
            }}
          >
            motvin
          </p>
        </Link>
        <button
          className="nav-menu-toggle"
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls="navMenu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
        <div
          className={`nav-right${open ? ' is-open' : ''}`}
          id="navMenu"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a, button')) setOpen(false);
          }}
        >
          <a href="https://www.instagram.com/siren.uix/" className="nav-link hide-mobile">
            Follow Me
          </a>
          <a
            href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6"
            className="nav-link hide-mobile"
          >
            Join Community
          </a>
          <div className="nav-cta-group">
            <a
              href={loginHref}
              className="nav-link"
              aria-busy={busy || undefined}
              onClick={onLoginClick}
            >
              {busy ? 'Signing out…' : loginLabel}
            </a>
            <a href="https://motvin.com/" className="nav-btn">
              Get Started
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
