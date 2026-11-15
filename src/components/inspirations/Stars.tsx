'use client';

/**
 * A rating drawn as five stars.
 *
 * The value is usually fractional — 4.89 is not four stars and it is not five —
 * so the filled portion is clipped to the exact percentage rather than rounded.
 * Rounding to the nearest star would show 4.2 and 4.4 identically, which
 * defeats the point of showing a decimal beside it.
 *
 * The whole control is one image to a screen reader: five separate stars read
 * out individually are noise, and the number is already stated in text next to
 * it.
 */

const STAR_PATH = 'M12 2.6l2.7 5.9 6.3.7-4.7 4.3 1.3 6.3L12 16.6l-5.6 3.2 1.3-6.3L3 9.2l6.3-.7z';

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  const percent = (clamped / 5) * 100;

  return (
    <span className="ins-stars" role="img" aria-label={`${clamped.toFixed(2)} out of 5`}>
      <span className="ins-stars-track" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} />
        ))}
      </span>
      {/* Same five stars again, filled, revealed to the rating's width. */}
      <span className="ins-stars-fill" style={{ width: `${percent}%` }} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} filled />
        ))}
      </span>
    </span>
  );
}

function Star({ size, filled = false }: { size: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" focusable="false">
      <path
        d={STAR_PATH}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
