import type { App } from '@/lib/inspirations/types';

/**
 * App mark. Renders the real logo when the record has one, otherwise a
 * solid brand-coloured tile with the app's initials. Sized by the parent
 * through `size`.
 */
export function AppLogo({ app, size = 20, className = '' }: { app: App; size?: number; className?: string }) {
  const { logo } = app;
  if (logo.src) {
    return (
      <img
        src={logo.src}
        alt=""
        width={size}
        height={size}
        className={`ins-app-logo ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  return (
    <span
      className={`ins-app-logo ins-app-logo--glyph ${className}`}
      style={{
        width: size,
        height: size,
        background: logo.bg,
        color: logo.fg,
        fontSize: Math.max(8, Math.round(size * 0.42)),
      }}
      aria-hidden
    >
      {logo.glyph}
    </span>
  );
}
