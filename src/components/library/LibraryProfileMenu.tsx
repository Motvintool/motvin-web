'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { useAuthModal } from '@/components/shared/AuthModal';
import { LibraryProfileBadge, badgeWrapClassName } from './LibraryProfileBadge';
import type { SidebarTab } from './LibrarySidebar';

/**
 * Top-right profile chip + dropdown — port of
 * motvin-ui/COMPONENT/Library Profile Menu.js.
 *
 * Markup mirrors the reference at `:52488` so the ported `profile-menu.css`
 * rules apply cleanly:
 *
 *   #profile-dropdown.mi-profile-dropdown[.is-open]
 *     .mi-profile-dropdown-inner
 *       .mi-profile-user-info-section  (hidden when signed out)
 *         .mi-profile-user-info > .mi-profile-name + .mi-profile-email
 *         .mi-profile-divider-wrap > .mi-profile-divider
 *       .mi-profile-menu-items
 *         a.mi-profile-item#mi-profile-saved
 *         a.mi-profile-item (Release Notes)
 *         a.mi-profile-item (Community)
 *       .mi-profile-divider-wrap > .mi-profile-divider
 *       a.mi-profile-item.mi-profile-auth-action
 */

type Props = {
  onSelectSidebarTab?: (tab: SidebarTab) => void;
};

export function LibraryProfileMenu({ onSelectSidebarTab }: Props) {
  const { user, signOut } = useAuth();
  const { open: openAuth } = useAuthModal();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const signedIn = Boolean(user && !user.isAnonymous);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleAuthAction = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      setOpen(false);
      if (signedIn) await signOut();
      else openAuth('login');
    },
    [signedIn, openAuth, signOut],
  );

  return (
    <div
      className="mi-profile-menu-container"
      id="profile-menu-container"
      ref={rootRef}
    >
      <button
        type="button"
        className={badgeWrapClassName(user)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={signedIn ? user?.displayName || 'Account' : 'Sign in'}
        onClick={() => setOpen((prev) => !prev)}
      >
        <LibraryProfileBadge user={user} />
      </button>

      <div
        id="profile-dropdown"
        className={`mi-profile-dropdown${open ? ' is-open' : ''}`}
        role="menu"
      >
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
            {/* Saved Collections flips the sidebar tab in-app; render as an
                anchor with href="#" for keyboard/right-click parity with the
                reference, then intercept the click. */}
            <a
              href="#"
              className="mi-profile-item"
              id="mi-profile-saved"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                onSelectSidebarTab?.('saved');
              }}
            >
              <img src="/ASSET/Icons/icons-logos-profile-menu-savedcollections.svg" alt="" />
              <span>Saved Collections</span>
            </a>
            <a
              href="/updates/"
              target="_blank"
              rel="noopener noreferrer"
              className="mi-profile-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <img src="/ASSET/Icons/icons-logos-profile-menu-releasenotes.svg" alt="" />
              <span>Release Notes</span>
            </a>
            <a
              href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
              target="_blank"
              rel="noopener noreferrer"
              className="mi-profile-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <img src="/ASSET/Icons/icons-logos-profile-menu-community.svg" alt="" />
              <span>Community</span>
            </a>
          </div>

          <div className="mi-profile-divider-wrap">
            <div className="mi-profile-divider" />
          </div>

          <a
            href="#"
            className="mi-profile-item mi-profile-auth-action"
            role="menuitem"
            onClick={handleAuthAction}
          >
            <img
              className="mi-profile-auth-icon"
              src={
                signedIn
                  ? '/ASSET/Icons/icons-logos-profile-menu-loggedout.svg'
                  : '/ASSET/Icons/icons-logos-profile-menu-login.svg'
              }
              alt=""
            />
            <span className="mi-profile-auth-text">{signedIn ? 'Log out' : 'Log in'}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
