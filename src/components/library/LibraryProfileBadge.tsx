'use client';

import { useState } from 'react';
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

const AVATAR_PLACEHOLDER = '/ASSET/Icons/sidebar-avatar-placeholder.svg';

type Props = {
  user: AuthUser | null;
};

function firstAlphanumericChar(text: string): string {
  const match = /[a-z0-9]/i.exec(text);
  return match ? match[0].toUpperCase() : 'U';
}

/**
 * The photo state, hardened against Google's avatar host:
 *
 * - `referrerPolicy="no-referrer"` — lh3.googleusercontent.com intermittently
 *   answers 403 when the request carries a referrer, which is why a photo
 *   that loaded yesterday shows as missing today. Sending none makes the
 *   request reliable.
 * - One cache-busted retry on error — a transient 429/network failure would
 *   otherwise be replayed from the browser's negative cache for the rest of
 *   the session.
 * - Only after the retry also fails does the placeholder appear.
 *
 * Keyed by URL from the parent, so a changed photo resets both counters.
 */
function AvatarPhoto({ src }: { src: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <img className="mi-top-avatar" src={AVATAR_PLACEHOLDER} alt="" />;
  }

  return (
    <img
      className="mi-top-avatar"
      src={attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}mretry=${attempt}`}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => (attempt === 0 ? setAttempt(1) : setFailed(true))}
    />
  );
}

export function LibraryProfileBadge({ user }: Props) {
  const signedIn = Boolean(user && !user.isAnonymous);

  if (signedIn && user?.photoURL) {
    return <AvatarPhoto key={user.photoURL} src={user.photoURL} />;
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

  return <img className="mi-top-avatar" src={AVATAR_PLACEHOLDER} alt="" />;
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
