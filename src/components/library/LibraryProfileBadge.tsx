'use client';

import type { AuthUser } from '@/lib/firebase/auth';

/**
 * Avatar chip — port of motvin-ui/COMPONENT/Library Profile Badge.js.
 *
 * Three states:
 *   photoURL   → an <img> in .mi-top-avatar-wrap
 *   signed-in  → initials block, wrapper carries .mi-initials-mode
 *   signed-out → placeholder svg, wrapper carries .mi-logged-out
 *
 * The wrapper class list matters — the profile menu styles hook off it.
 */

type Props = {
  user: AuthUser | null;
};

function firstAlphanumericChar(text: string): string {
  const match = /[a-z0-9]/i.exec(text);
  return match ? match[0].toUpperCase() : 'U';
}

export function LibraryProfileBadge({ user }: Props) {
  const signedIn = Boolean(user && !user.isAnonymous);

  if (signedIn && user?.photoURL) {
    return (
      <img
        className="mi-top-avatar"
        src={user.photoURL}
        alt=""
        onError={(e) => {
          // Broken profile photo — fall back to the placeholder rather than
          // leaving the alt text as a dangling glyph.
          const img = e.currentTarget;
          img.onerror = null;
          img.src = '/ASSET/Icons/sidebar-avatar-placeholder.svg';
        }}
      />
    );
  }

  if (signedIn) {
    return (
      <span className="mi-avatar-initials-outer">
        <span className="mi-avatar-initials-inner">
          {firstAlphanumericChar(user?.displayName || 'U')}
        </span>
      </span>
    );
  }

  return (
    <img
      className="mi-top-avatar"
      src="/ASSET/Icons/sidebar-avatar-placeholder.svg"
      alt=""
    />
  );
}

/**
 * The wrapper class list the menu keys off — the badge itself is unchanged;
 * only the wrapper's class list changes with state.
 */
export function badgeWrapClassName(user: AuthUser | null): string {
  const signedIn = Boolean(user && !user.isAnonymous);
  if (!signedIn) return 'mi-top-avatar-wrap mi-logged-out';
  if (user?.photoURL) return 'mi-top-avatar-wrap';
  return 'mi-top-avatar-wrap mi-initials-mode';
}
