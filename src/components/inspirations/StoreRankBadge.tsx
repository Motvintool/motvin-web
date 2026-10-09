'use client';

import type { Platform } from '@/lib/inspirations/types';
import { useStoreStats } from './useStoreStats';

/**
 * Rank badge pinned to the corner of the app mark, like a seal: the app's
 * position in its store's top-free chart for its category (`#1`; hovering or focusing
 * it opens a small tooltip with the category and store). It is the page's
 * headline credential, so it rides on the logo itself rather than taking a row.
 * Renders nothing until the store answers, and nothing if the app is not on the
 * chart.
 */
/** Gold for #1, silver for #2, bronze for everything below. */
function cupFor(position: number): string {
  if (position === 1) return '/ASSET/Icons/cup.png';
  if (position === 2) return '/ASSET/Icons/Motvin/cup-silver.png';
  return '/ASSET/Icons/Motvin/cup-bronze.png';
}

/** Only ranks at or above this show a badge — a badge for #86 is not a distinction. */
const MAX_RANK = 20;

/** The ring follows the cup: gold / silver / bronze (bronze for everything below #2). */
function tierFor(position: number): 'gold' | 'silver' | 'bronze' {
  return position === 1 ? 'gold' : position === 2 ? 'silver' : 'bronze';
}

/** A little encouragement for the tooltip. */
const CHEER = { gold: 'Top of the charts! 🎉', silver: 'Right behind the leader ✨', bronze: 'Climbing the charts 🔥' } as const;

export function StoreRankBadge({ name, platform }: { name: string; platform: Platform }) {
  const { stats } = useStoreStats(name, platform);
  const rank = stats?.rank;
  if (!rank || rank.position > MAX_RANK) return null;
  const store = 'App Store';
  // Name the storefront when it is not the default US one, so a rank earned in
  // India is not read as a US rank.
  const where = rank.country && rank.country !== 'US' ? `${rank.country} ${store}` : store;
  const tier = tierFor(rank.position);
  const cup = cupFor(rank.position);
  return (
    <span className="ins-rank" data-tier={tier} tabIndex={0} aria-label={`Ranked #${rank.position} in ${rank.category} on the ${where} top free chart`}>
      <span className="ins-rankbadge">
        <img src={cup} alt="" width={16} height={16} />
        <b>#{rank.position}</b>
      </span>
      {/* Pops up on hover or keyboard focus. Decorative for screen readers: the
          wrapper's aria-label already says the same thing in full. */}
      <span className="ins-ranktip" role="tooltip" aria-hidden>
        <span className="ins-ranktip-medal">
          <img src={cup} alt="" width={36} height={36} className="ins-ranktip-cup" />
        </span>
        <span className="ins-ranktip-text">
          <b>#{rank.position} in {rank.category}</b>
          <span>Top free apps · {where}</span>
          <em>{CHEER[tier]}</em>
        </span>
      </span>
    </span>
  );
}
