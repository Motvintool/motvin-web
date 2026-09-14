'use client';

/**
 * Status message shown at the top of the admin publisher — tone drives colour
 * via `data-tone` in updates.css. `null` message renders nothing.
 */

export type BannerTone = 'neutral' | 'success' | 'error';
export type Banner = { message: string; tone: BannerTone } | null;

export function StatusBanner({ banner }: { banner: Banner }) {
  if (!banner) return null;
  return (
    <div className="status-banner" data-tone={banner.tone}>
      {banner.message}
    </div>
  );
}
