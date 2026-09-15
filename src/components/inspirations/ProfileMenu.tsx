'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { useAuthModal } from '@/components/shared/AuthModal';
import { isAdminEmail } from '@/lib/inspirations/admin';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { applyTheme, getStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme';
import { BookmarkIcon, FolderIcon, UploadIcon } from './Icons';

/**
 * Avatar chip + dropdown for the Inspirations header. Reuses the site-wide
 * auth context and modal; adds theme switching so the gallery can be studied
 * in either mode.
 */
export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { open: openAuth } = useAuthModal();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>('dark');
  const rootRef = useRef<HTMLDivElement>(null);
  const signedIn = Boolean(user && !user.isAnonymous);
  // Presentation only. The admin API verifies the signed-in account itself,
  // so revealing this link would not grant anyone access.
  const showAdmin = signedIn && isAdminEmail(user?.email);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pickTheme = (pref: ThemePreference) => {
    applyTheme(pref);
    storeTheme(pref);
    setTheme(pref);
  };

  const initial = (user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="ins-popwrap" ref={rootRef}>
      <button
        type="button"
        className={`ins-avatar ${signedIn ? 'is-signed-in' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={signedIn ? user?.displayName || 'Account' : 'Account menu'}
        onClick={() => {
          // Read the stored preference as the menu opens so the radio group
          // reflects a change made on another page.
          setTheme(getStoredTheme());
          setOpen((o) => !o);
        }}
      >
        {signedIn && user?.photoURL ? (
          <img src={user.photoURL} alt="" className="ins-avatar-img" referrerPolicy="no-referrer" />
        ) : signedIn ? (
          <span className="ins-avatar-initial">{initial}</span>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          </svg>
        )}
      </button>

      {open && (
        <div className="ins-popover ins-popover--right ins-profile-menu" role="menu">
          {signedIn && user && (
            <div className="ins-profile-user">
              <p className="ins-profile-name">{user.displayName || 'User'}</p>
              <p className="ins-profile-email">{user.email}</p>
            </div>
          )}
          <Link href={INSPIRATIONS_ROUTES.saved} className="ins-popover-item" role="menuitem" onClick={() => setOpen(false)}>
            <BookmarkIcon size={14} />
            <span>Saved</span>
          </Link>
          <Link href={INSPIRATIONS_ROUTES.collections} className="ins-popover-item" role="menuitem" onClick={() => setOpen(false)}>
            <FolderIcon size={14} />
            <span>Collections</span>
          </Link>
          {showAdmin && (
            <>
              <div className="ins-popover-divider" />
              <Link
                href={INSPIRATIONS_ROUTES.admin}
                className="ins-popover-item ins-popover-item--admin"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <UploadIcon size={14} />
                <span>Admin</span>
                <span className="ins-popover-item-tag">Upload</span>
              </Link>
            </>
          )}
          <div className="ins-popover-divider" />
          <p className="ins-popover-title">Theme</p>
          <div className="ins-theme-row" role="radiogroup" aria-label="Theme">
            {(['light', 'dark', 'system'] as ThemePreference[]).map((pref) => (
              <button key={pref} type="button" role="radio" aria-checked={theme === pref} className={`ins-chip ins-chip--sm ${theme === pref ? 'is-active' : ''}`} onClick={() => pickTheme(pref)}>
                {pref[0].toUpperCase() + pref.slice(1)}
              </button>
            ))}
          </div>
          <div className="ins-popover-divider" />
          <a href="/icons" className="ins-popover-item" role="menuitem">
            <span>Icon library</span>
          </a>
          <a href="/updates/" className="ins-popover-item" role="menuitem" target="_blank" rel="noopener noreferrer">
            <span>Release notes</span>
          </a>
          <div className="ins-popover-divider" />
          <button
            type="button"
            className="ins-popover-item"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              if (signedIn) await signOut();
              else openAuth('login');
            }}
          >
            <span>{signedIn ? 'Log out' : 'Log in'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
