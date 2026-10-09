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
import { ADMIN_PARAM } from './admin/AdminDrawer';
import { RequestAppModal } from './RequestAppModal';

/**
 * Avatar chip + profile menu for the Inspirations header. The chip is the library's own badge; the menu is
 * the Figma "profile-menu" (node 1329-2714): who you are and a Manage profile button, then Collections,
 * Settings (signed in), Admin Settings (admin only) and Request apps, then Icon library and Release notes, Log out, and a
 * footer with the legal links and Instagram.
 */
const ICON = '/ASSET/Icons/Motvin';
const INSTAGRAM_URL = 'https://www.instagram.com/siren.uix';

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
  const [requesting, setRequesting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    // Keyboard: Esc closes and hands focus back to the avatar; the arrow keys, Home and End move between rows.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('.ins-pmenu [role="menuitem"]') ?? []);
      if (!items.length) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      let next = 0;
      if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % items.length;
      else if (e.key === 'ArrowUp') next = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
      else if (e.key === 'End') next = items.length - 1;
      items[next].focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
          ref={triggerRef}
          className={badgeWrapClassName(user)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={signedIn ? user?.displayName || 'Account' : 'Account menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <LibraryProfileBadge user={user} />
        </button>
      </div>

      <div className={`ins-pmenu${open ? ' is-open' : ''}`} role="menu" aria-hidden={!open}>
        <div className="ins-pmenu-body">
          <div className="ins-pmenu-top">
            <div className="ins-pmenu-head">
              <div className="ins-pmenu-id">
                <div className="ins-pmenu-idtext">
                  <p className="ins-pmenu-name">{signedIn && user ? user.displayName || 'User' : 'Guest'}</p>
                  {signedIn && user ? (
                    <a className="ins-pmenu-email" href={`mailto:${user.email}`}>
                      {user.email}
                    </a>
                  ) : (
                    <span className="ins-pmenu-email">name@example.com</span>
                  )}
                </div>
                {signedIn && user?.photoURL ? (
                  <img className="ins-pmenu-avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : signedIn && user ? (
                  <span className="ins-pmenu-avatar ins-pmenu-avatar--initial" aria-hidden>
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </span>
                ) : null}
              </div>
              {signedIn ? (
                <Link href={`${INSPIRATIONS_ROUTES.settings}#set-profile`} className="ins-pmenu-edit" role="menuitem" onClick={() => setOpen(false)}>
                  Manage profile
                </Link>
              ) : (
                <button
                  type="button"
                  className="ins-pmenu-edit"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    openAuth('login');
                  }}
                >
                  Login account
                </button>
              )}
            </div>

            <div className="ins-pmenu-panel">
              <div className="ins-pmenu-list">
                <Link href={INSPIRATIONS_ROUTES.collections} className="ins-pmenu-item" role="menuitem" onClick={() => setOpen(false)}>
                  <span className="ins-pmenu-lead">
                    <img src={`${ICON}/profile-collections.svg`} alt="" width={18} height={18} />
                    Collections
                  </span>
                  <img src={`${ICON}/profile-arrow.svg`} alt="" width={12} height={12} />
                </Link>
                {signedIn && (
                  <Link href={INSPIRATIONS_ROUTES.settings} className="ins-pmenu-item" role="menuitem" onClick={() => setOpen(false)}>
                    <span className="ins-pmenu-lead">
                      <img src={`${ICON}/profile-settings.svg`} alt="" width={18} height={18} />
                      Settings
                    </span>
                    <img src={`${ICON}/profile-arrow.svg`} alt="" width={12} height={12} />
                  </Link>
                )}
                {showAdmin && (
                  <Link href={adminHref} scroll={false} className="ins-pmenu-item" role="menuitem" onClick={() => setOpen(false)}>
                    <span className="ins-pmenu-lead">
                      <img src={`${ICON}/profile-admin.svg`} alt="" width={18} height={18} />
                      Admin Settings
                    </span>
                    <img src={`${ICON}/profile-arrow.svg`} alt="" width={12} height={12} />
                  </Link>
                )}
                {(
                  <button
                    type="button"
                    className="ins-pmenu-item"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      setRequesting(true);
                    }}
                  >
                    <span className="ins-pmenu-lead">
                      <img src={`${ICON}/profile-app-request.svg`} alt="" width={18} height={18} />
                      Request apps
                      <span className="ins-pmenu-new">New</span>
                    </span>
                    <img src={`${ICON}/profile-arrow.svg`} alt="" width={12} height={12} />
                  </button>
                )}
              </div>

              <div className="ins-pmenu-rule" />

              <div className="ins-pmenu-list">
                <a href="/icons" className="ins-pmenu-item" role="menuitem">
                  <span>Icon library</span>
                  <img src={`${ICON}/profile-redirect.svg`} alt="" width={14} height={14} />
                </a>
                <a href="/updates/" className="ins-pmenu-item" role="menuitem" target="_blank" rel="noopener noreferrer">
                  <span>Release notes</span>
                  <img src={`${ICON}/profile-redirect.svg`} alt="" width={14} height={14} />
                </a>
                {signedIn && (
                  <button
                    type="button"
                    className="ins-pmenu-item ins-pmenu-item--danger"
                    role="menuitem"
                    onClick={async () => {
                      setOpen(false);
                      await signOut();
                    }}
                  >
                    <span>Log out</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="ins-pmenu-foot">
            <div className="ins-pmenu-legal">
              <Link href="/privacy" onClick={() => setOpen(false)}>Privacy</Link>
              <Link href="/terms" onClick={() => setOpen(false)}>Terms</Link>
              <Link href="/copyrights" onClick={() => setOpen(false)}>Copyrights</Link>
            </div>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Motvin on Instagram">
              <img src={`${ICON}/profile-external.svg`} alt="" width={20} height={20} />
            </a>
          </div>
        </div>
      </div>
      {requesting && <RequestAppModal initialName="" initialPlatform="ios" onClose={() => setRequesting(false)} />}
    </div>
  );
}
