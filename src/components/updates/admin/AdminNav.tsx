'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/shared/AuthProvider';

/**
 * Admin top nav — logo, mobile toggle, and a Sign-in / Logout affordance.
 * Self-contained: reads auth state and drives Google sign-in / sign-out.
 * Sign-in/out errors bubble up via `onAuthError` so the parent can surface them
 * in the shared status banner.
 */

type Props = {
  onAuthError?: (message: string) => void;
  onAuthChange?: () => void;
};

export function AdminNav({ onAuthError, onAuthChange }: Props) {
  const { user, signInWithGoogle, signOut } = useAuth();
  const signedIn = Boolean(user && !user.isAnonymous);

  const [open, setOpen] = useState(false);

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

  const handleSignIn = async () => {
    onAuthChange?.();
    try {
      await signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      onAuthError?.(message);
    }
  };

  const handleSignOut = async () => {
    onAuthChange?.();
    try {
      await signOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-out failed.';
      onAuthError?.(message);
    }
  };

  return (
    <nav
      className="nav"
      // Turbopack drops `backdrop-filter` from .nav in the CSS pipeline; inline
      // it so the glass effect matches the legacy build.
      style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
    >
      <div className="nav-inner updates-shell">
        <Link href="/updates" className="nav-logo" aria-label="Motvin updates">
          <span
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 500,
              fontSize: 22,
              color: '#0b0b0b',
              letterSpacing: '-0.44px',
            }}
          >
            motvin
          </span>
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
        <div className={`nav-right${open ? ' is-open' : ''}`} id="navMenu">
          <Link href="/updates" className="nav-link">
            View Updates
          </Link>
          {signedIn ? (
            <button type="button" className="nav-link nav-link-button" onClick={handleSignOut}>
              Logout
            </button>
          ) : (
            <button type="button" className="nav-btn" onClick={handleSignIn}>
              Sign in with Google
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
