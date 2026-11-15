import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { App } from '@/lib/inspirations/types';

/**
 * App mark.
 *
 * Shows the logo stored in `data/inspirations/logos` when the app has one.
 * Otherwise it falls back to the app's initials on a neutral tile — a plain
 * label, not an invented brand colour.
 */
export function AppLogo({ app, size = 20, className = '' }: { app: App; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = inspirationsApi.mediaUrl(app.logo);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`ins-app-logo ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  const initials = app.name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={`ins-app-logo ins-app-logo--initials ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
