'use client';

/**
 * Right-side 404 illustration with a plain-text fallback if the svg fails to
 * load.
 */
export function NotFoundGraphics() {
  return (
    <div className="graphics-404">
      <img
        src="/ASSET/svg/404-illustration.svg"
        alt="404 Graphic"
        className="illustration-404"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      <div className="fallback-404">404</div>
    </div>
  );
}
