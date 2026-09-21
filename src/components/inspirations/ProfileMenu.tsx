'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LibraryProfileBadge, badgeWrapClassName } from '@/components/library/LibraryProfileBadge';
import { useAuth } from '@/components/shared/AuthProvider';
import { useAuthModal } from '@/components/shared/AuthModal';
import { isAdminEmail } from '@/lib/inspirations/admin';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { applyTheme, getStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme';
import { BookmarkIcon, FolderIcon, UploadIcon } from './Icons';

/**
 * Avatar chip + dropdown for the Inspirations header. The chip and dropdown
 * shell are the same mi-profile-menu-container/mi-profile-dropdown markup as
 * motvin-library's LibraryProfileMenu (profile-menu.css) — but the menu
 * items themselves stay Inspirations' own: Saved, Collections, admin-only
 * Admin link, and theme switching, none of which LibraryProfileMenu has.
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

  return (
    <div className="mi-profile-menu-container" ref={rootRef}>
      <button
        type="button"
        className={badgeWrapClassName(user)}
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
        <LibraryProfileBadge user={user} />
      </button>

      <div className={`mi-profile-dropdown${open ? ' is-open' : ''}`} role="menu">
        <div className="mi-profile-dropdown-inner">
          {signedIn && user && (
            <div className="mi-profile-user-info-section">
              <div className="mi-profile-user-info">
                <p className="mi-profile-name">{user.displayName || 'User'}</p>
                <p className="mi-profile-email">{user.email}</p>
              </div>
              <div className="mi-profile-divider-wrap">
                <div className="mi-profile-divider" />
              </div>
            </div>
          )}

          <div className="mi-profile-menu-items">
            <Link href={INSPIRATIONS_ROUTES.saved} className="mi-profile-item" role="menuitem" onClick={() => setOpen(false)}>
              <BookmarkIcon size={16} />
              <span>Saved</span>
            </Link>
            <Link href={INSPIRATIONS_ROUTES.collections} className="mi-profile-item" role="menuitem" onClick={() => setOpen(false)}>
              <FolderIcon size={16} />
              <span>Collections</span>
            </Link>
            {showAdmin && (
              <Link href={INSPIRATIONS_ROUTES.admin} className="mi-profile-item" role="menuitem" onClick={() => setOpen(false)}>
                <UploadIcon size={16} />
                <span>Admin</span>
                <span className="ins-popover-item-tag">Upload</span>
              </Link>
            )}
          </div>

          <div className="mi-profile-divider-wrap">
            <div className="mi-profile-divider" />
          </div>

          <p className="ins-popover-title">Theme</p>
          <div className="ins-theme-row" role="radiogroup" aria-label="Theme">
            {(['light', 'dark', 'system'] as ThemePreference[]).map((pref) => (
              <button key={pref} type="button" role="radio" aria-checked={theme === pref} className={`ins-chip ins-chip--sm ${theme === pref ? 'is-active' : ''}`} onClick={() => pickTheme(pref)}>
                {pref[0].toUpperCase() + pref.slice(1)}
              </button>
            ))}
          </div>

          <div className="mi-profile-divider-wrap">
            <div className="mi-profile-divider" />
          </div>

          <div className="mi-profile-menu-items">
            <a href="/icons" className="mi-profile-item" role="menuitem">
              <span>Icon library</span>
            </a>
            <a href="/updates/" className="mi-profile-item" role="menuitem" target="_blank" rel="noopener noreferrer">
              <span>Release notes</span>
            </a>
          </div>

          <div className="mi-profile-divider-wrap">
            <div className="mi-profile-divider" />
          </div>

          <button
            type="button"
            className="mi-profile-item"
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
      </div>
    </div>
  );
}
