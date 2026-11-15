'use client';

import { useEffect, useRef, useState } from 'react';
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
 * The ring around the avatar takes the picture's own colour: the flat colour of Google's generated letter
 * avatar, or the average colour along the rim of a real photo. It is sampled on a small canvas and handed to
 * the wrapper as --mi-ring; until then (or if the canvas is blocked) the ring keeps its default grey.
 */
function useAvatarRing(src: string, host: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wrap = host.current?.parentElement;
    wrap?.style.removeProperty('--mi-ring');
    let cancelled = false;
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      if (cancelled || !wrap) return;
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(probe, 0, 0, size, size);
        const centre = size / 2;
        const radius = size / 2 - 3;
        const steps = 16;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < steps; i += 1) {
          const angle = (i / steps) * Math.PI * 2;
          const d = ctx.getImageData(Math.round(centre + Math.cos(angle) * radius), Math.round(centre + Math.sin(angle) * radius), 1, 1).data;
          r += d[0];
          g += d[1];
          b += d[2];
        }
        wrap.style.setProperty('--mi-ring', `rgb(${Math.round(r / steps)}, ${Math.round(g / steps)}, ${Math.round(b / steps)})`);
      } catch {
        /* tainted canvas: keep the default ring */
      }
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, host]);
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
  const imgRef = useRef<HTMLImageElement>(null);
  useAvatarRing(src, imgRef);

  if (failed) {
    return <img className="mi-top-avatar" src={AVATAR_PLACEHOLDER} alt="" />;
  }

  return (
    <img
      ref={imgRef}
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
