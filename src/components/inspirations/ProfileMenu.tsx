'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LibraryProfileBadge, badgeWrapClassName } from '@/components/library/LibraryProfileBadge';
import { useAuth } from '@/components/shared/AuthProvider';
import { useAuthModal } from '@/components/shared/AuthModal';
import { useHydrated } from '@/components/shared/useHydrated';
import { isAdminEmail } from '@/lib/inspirations/admin';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { applyTheme, getStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme';
import { ADMIN_PARAM } from './admin/AdminDrawer';
import { FolderIcon, SettingsIcon, UploadIcon } from './Icons';

/**
 * Avatar chip + dropdown for the Inspirations header. The chip and dropdown
 * shell are the same mi-profile-menu-container/mi-profile-dropdown markup as
 * motvin-library's LibraryProfileMenu (profile-menu.css) — but the menu
 * items themselves stay Inspirations' own: Saved, Collections, admin-only
 * Admin link, and theme switching, none of which LibraryProfileMenu has.
 */
export function ProfileMenu() {
  const { user: liveUser, signOut } = useAuth();
  const { open: openAuth } = useAuthModal();
  // The server always renders this menu signed out. This header hydrates
  // inside its own Suspense boundary, after AuthProvider has already swapped
  // in the cached user — so without this gate the hydration render shows the
  // avatar against HTML that shows "Login", and React throws a mismatch and
  // client-renders the boundary from scratch on every page load.
  const hydrated = useHydrated();
  const user = hydrated ? liveUser : null;
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>('dark');
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const signedIn = Boolean(user && !user.isAnonymous);
  // Presentation only. The admin API verifies the signed-in account itself,
  // so revealing this link would not grant anyone access.
  const showAdmin = signedIn && isAdminEmail(user?.email);
  // Opens the admin drawer over whatever page is showing (see AdminDrawer.tsx)
  // instead of navigating away to a separate page — same `?admin=1`-on-the-
  // current-URL convention ScreenCard uses for `?screen=`.
  const adminHref = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(ADMIN_PARAM, '1');
    return `${pathname}?${sp.toString()}`;
  })();

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
      <div className={`ins-profile-pill ${!signedIn ? 'is-logged-out' : ''}`}>
        {!signedIn && (
          <button type="button" className="ins-profile-login-btn" onClick={() => openAuth('login')}>
            Login
          </button>
        )}
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
      </div>

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
            <Link href={INSPIRATIONS_ROUTES.collections} className="mi-profile-item" role="menuitem" onClick={() => setOpen(false)}>
              <FolderIcon size={16} />
              <span>Collections</span>
            </Link>
            {signedIn && (
              <Link href={INSPIRATIONS_ROUTES.settings} className="mi-profile-item" role="menuitem" onClick={() => setOpen(false)}>
                <SettingsIcon size={16} />
                <span>Settings</span>
              </Link>
            )}
            {showAdmin && (
              <Link href={adminHref} scroll={false} className="mi-profile-item" role="menuitem" onClick={() => setOpen(false)}>
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
